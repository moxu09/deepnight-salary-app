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

async function loadAll(supabase, table, select = "*", configure = (query) => query) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await configure(
      supabase.from(table).select(select).range(from, from + 999)
    );
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

const envPath = process.env.DEEPNIGHT_REPAIR_ENV || "/Users/moxu/rainbot2/.env";
await loadEnv(envPath);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const orders = await loadAll(supabase, "play_orders");
const byId = new Map(orders.map((row) => [String(row.id), row]));
const workBySource = new Map();
for (const row of orders) {
  const match = String(row.order_id || row.order_no || "").match(
    /^WORK-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-\d+$/i
  );
  if (!match || row.is_deleted === true || !byId.has(match[1])) continue;
  const current = workBySource.get(match[1]) || [];
  current.push(row);
  workBySource.set(match[1], current);
}

const sources = [...workBySource.keys()]
  .map((id) => byId.get(id))
  .filter(
    (row) =>
      row &&
      row.is_deleted !== true &&
      (row.discord_id || Number(row.staff_salary || 0) || Number(row.bonus_amount || 0))
  );
const sourceIds = new Set(sources.map((row) => String(row.id)));
const walletEntries = await loadAll(
  supabase,
  "salary_wallet_entries",
  "*",
  (query) => query.eq("app_key", "deepnight").eq("source_table", "play_orders")
);
const affectedWalletEntries = walletEntries.filter(
  (entry) => sourceIds.has(String(entry.source_id)) && Number(entry.amount || 0) !== 0
);

const backup = {
  created_at: new Date().toISOString(),
  reason: "Remove payroll shadow rows when canonical WORK reports exist",
  sources,
  work_orders: [...workBySource.entries()].flatMap(([sourceId, rows]) =>
    sourceIds.has(sourceId) ? rows : []
  ),
  wallet_entries: affectedWalletEntries,
};
const auditDir = path.resolve("docs/audits");
await fs.mkdir(auditDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = path.join(auditDir, `${stamp}-duplicate-source-work-salary.json`);
await fs.writeFile(backupPath, `${JSON.stringify(backup, null, 2)}\n`, "utf8");

const summary = {
  backupPath,
  sourceCount: sources.length,
  workCount: backup.work_orders.length,
  sourceSalary: sources.reduce(
    (sum, row) => sum + Number(row.staff_salary || 0) + Number(row.bonus_amount || 0),
    0
  ),
  walletEntryCount: affectedWalletEntries.length,
  walletCorrection: affectedWalletEntries.reduce(
    (sum, row) => sum + Number(row.amount || 0),
    0
  ),
};

if (!process.argv.includes("--apply")) {
  console.log(JSON.stringify({ mode: "dry-run", ...summary }, null, 2));
  process.exit(0);
}

const correctedAt = new Date().toISOString();
for (const source of sources) {
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

for (const entry of affectedWalletEntries) {
  const { error } = await supabase
    .from("salary_wallet_entries")
    .update({
      amount: 0,
      metadata: {
        ...(entry.metadata || {}),
        duplicate_source_work_correction: true,
        original_amount: Number(entry.amount || 0),
        corrected_at: correctedAt,
        canonical_work_ids: (workBySource.get(String(entry.source_id)) || []).map(
          (row) => row.id
        ),
      },
    })
    .eq("id", entry.id)
    .eq("app_key", "deepnight");
  if (error) throw error;
}

console.log(JSON.stringify({ mode: "applied", correctedAt, ...summary }, null, 2));
