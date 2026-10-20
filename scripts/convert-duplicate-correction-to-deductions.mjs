import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

async function loadEnv(file) {
  const text = await fs.readFile(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

function stableUuid(value) {
  const hex = crypto.createHash("sha256").update(value).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

const envPath = process.env.DEEPNIGHT_REPAIR_ENV || "/Users/moxu/rainbot2/.env";
const sourceBackupPath =
  process.env.DUPLICATE_SOURCE_BACKUP ||
  "docs/audits/2026-09-08T06-50-35-938Z-duplicate-source-work-salary.json";
await loadEnv(envPath);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
const original = JSON.parse(await fs.readFile(sourceBackupPath, "utf8"));
const originalEntries = original.wallet_entries || [];
const settledSourceIds = new Set(originalEntries.map((entry) => String(entry.source_id)));
const unpaidSources = (original.sources || []).filter(
  (source) => !settledSourceIds.has(String(source.id))
);
const affectedStaffIds = [...new Set(originalEntries.map((entry) => String(entry.discord_id)))];

const { data: currentEntries, error: entryError } = await supabase
  .from("salary_wallet_entries")
  .select("*")
  .eq("app_key", "deepnight")
  .in("id", originalEntries.map((entry) => entry.id));
if (entryError) throw entryError;

const { data: pendingRequests, error: requestError } = await supabase
  .from("salary_withdraw_requests")
  .select("*")
  .eq("app_key", "deepnight")
  .eq("status", "pending")
  .in("discord_id", affectedStaffIds);
if (requestError) throw requestError;

const totalsByStaff = new Map();
for (const entry of originalEntries) {
  const discordId = String(entry.discord_id);
  const current = totalsByStaff.get(discordId) || {
    discordId,
    staffName: entry.staff_name || null,
    amount: 0,
    sourceIds: [],
  };
  current.amount += Number(entry.amount || 0);
  current.sourceIds.push(String(entry.source_id));
  totalsByStaff.set(discordId, current);
}

const currentSourceIds = unpaidSources.map((source) => source.id);
const { data: currentUnpaidSources, error: sourceError } = currentSourceIds.length
  ? await supabase.from("play_orders").select("*").in("id", currentSourceIds)
  : { data: [], error: null };
if (sourceError) throw sourceError;

const audit = {
  created_at: new Date().toISOString(),
  reason: "Convert duplicate credited salary into visible deduction entries",
  original_source_backup: sourceBackupPath,
  current_wallet_entries: currentEntries || [],
  current_unpaid_sources: currentUnpaidSources || [],
  pending_withdraw_requests: pendingRequests || [],
  planned_deductions: [...totalsByStaff.values()],
};
const auditDir = path.resolve("docs/audits");
await fs.mkdir(auditDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const auditPath = path.join(auditDir, `${stamp}-duplicate-correction-deductions.json`);
await fs.writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");

const summary = {
  auditPath,
  unpaidPayrollItemsRemoved: unpaidSources.length,
  creditedOrdersRestored: originalEntries.length,
  deductionCount: totalsByStaff.size,
  deductionTotal: [...totalsByStaff.values()].reduce((sum, row) => sum + row.amount, 0),
  pendingWithdrawalsRejected: (pendingRequests || []).length,
};
if (!process.argv.includes("--apply")) {
  console.log(JSON.stringify({ mode: "dry-run", ...summary }, null, 2));
  process.exit(0);
}

const correctedAt = new Date().toISOString();
const settlementDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

// 未入帳的重複薪資項目直接移除歸屬；保留客人訂單本體與付款紀錄。
for (const source of unpaidSources) {
  const { error } = await supabase
    .from("play_orders")
    .update({
      discord_id: null,
      staff_name: null,
      staff_salary: 0,
      bonus_amount: 0,
      salary_rate: null,
      salary_level: null,
      platform_expense: 0,
    })
    .eq("id", source.id);
  if (error) throw error;
}

// 已入帳的原始明細恢復原額，另建等額扣項，讓 EIP 帳務清楚且淨額不變。
for (const entry of originalEntries) {
  const { error } = await supabase
    .from("salary_wallet_entries")
    .update({
      amount: Number(entry.amount || 0),
      metadata: {
        ...(entry.metadata || {}),
        duplicate_source_work_correction: false,
        correction_moved_to_deduction: true,
        corrected_at: correctedAt,
      },
    })
    .eq("id", entry.id)
    .eq("app_key", "deepnight");
  if (error) throw error;
}

for (const row of totalsByStaff.values()) {
  const adjustmentId = stableUuid(`deepnight:duplicate-income-correction:2026-09-08:${row.discordId}`);
  const adjustment = {
    id: adjustmentId,
    discord_id: row.discordId,
    staff_name: row.staffName,
    bonus_type: "薪水扣除",
    description: "重複入帳矯正",
    amount: -Math.abs(row.amount),
    created_at: correctedAt,
    wallet_settled_at: correctedAt,
    wallet_period_key: "duplicate-correction-2026-09-08",
  };
  const { error: adjustmentError } = await supabase
    .from("players_bonus")
    .upsert(adjustment, { onConflict: "id" });
  if (adjustmentError) throw adjustmentError;

  const { error: walletError } = await supabase
    .from("salary_wallet_entries")
    .upsert(
      {
        app_key: "deepnight",
        discord_id: row.discordId,
        staff_name: row.staffName,
        entry_type: "staff_bonus",
        amount: -Math.abs(row.amount),
        source_table: "players_bonus",
        source_id: adjustmentId,
        source_label: "扣除｜重複入帳矯正",
        period_key: "duplicate-correction-2026-09-08",
        settlement_date: settlementDate,
        metadata: {
          period_label: "重複入帳矯正",
          note: "重複入帳矯正",
          corrected_at: correctedAt,
          duplicate_source_ids: row.sourceIds,
        },
      },
      { onConflict: "app_key,source_table,source_id,entry_type" }
    );
  if (walletError) throw walletError;
}

if ((pendingRequests || []).length) {
  const { error } = await supabase
    .from("salary_withdraw_requests")
    .update({
      status: "rejected",
      reject_reason: "重複入帳矯正，已扣回重複薪資，請依正確餘額重新申請。",
      reviewed_at: correctedAt,
      updated_at: correctedAt,
    })
    .eq("app_key", "deepnight")
    .eq("status", "pending")
    .in("id", pendingRequests.map((request) => request.id));
  if (error) throw error;
}

console.log(JSON.stringify({ mode: "applied", correctedAt, ...summary }, null, 2));
