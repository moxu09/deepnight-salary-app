import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("發薪頁不再提供只改來源狀態的捷徑", async () => {
  const [payroll, salary] = await Promise.all([
    read("app/admin/payroll/page.tsx"),
    read("app/admin/salary/page.tsx"),
  ]);

  assert.doesNotMatch(payroll, /markStaffPaid|標記發薪/);
  assert.match(payroll, /action:\s*"deposit-wallet"/);
  assert.match(payroll, /action:\s*"bulk-deposit-wallet"/);
  assert.doesNotMatch(salary, /markOrderPaid|bulkMarkPaid|批次標記已入帳/);
  assert.doesNotMatch(salary, /<option value="已入帳">/);
  assert.match(salary, /href="\/admin\/payroll"/);
});

test("深夜訂單新增固定未入帳，編輯時再次檢查尚未結算", async () => {
  const salary = await read("app/admin/salary/page.tsx");

  assert.match(salary, /status:\s*"未入帳"/);
  assert.match(salary, /\.is\("wallet_settled_at", null\)/);
  assert.match(salary, /\.or\("status\.neq\.已入帳,status\.is\.null"\)/);
  assert.match(salary, /if \(!updatedOrder\)/);
});

test("員工自助修改只走欄位白名單 server route", async () => {
  const [page, route] = await Promise.all([
    read("app/staff/page.tsx"),
    read("app/api/deepnight/staff/route.js"),
  ]);
  assert.match(page, /fetch\("\/api\/deepnight\/staff"/);
  assert.doesNotMatch(page, /\.from\("players"\)\s*\.update\(/);
  assert.match(route, /getAuthUserFromRequest/);
  assert.match(route, /action === "update-profile"/);
  assert.match(route, /action === "set-online"/);
  assert.match(route, /action === "set-services"/);
  assert.doesNotMatch(route, /\.update\(body\)/);
});

test("深夜 EIP 可為指定 Discord ID 開啟直接存取且仍要求本人登入", async () => {
  const route = await read("app/api/deepnight/ensure-staff/route.js");

  assert.match(route, /DEEPNIGHT_EIP_ACCESS_DISCORD_IDS/);
  assert.match(route, /directAccessDiscordIds\.includes\(discordId\)/);
  assert.match(route, /if \(!hasStaffRole && !hasDirectAccess\)/);
  assert.match(route, /getDiscordIdFromUser\(user\)/);
  assert.match(route, /discord_id: discordId/);
});

test("RLS migration 封鎖 anon 並保留登入者的自有列與管理角色政策", async () => {
  const migration = await read(
    "supabase/migrations/20260913010200_sensitive_data_rls_lockdown.sql"
  );

  assert.match(migration, /from auth\.identities/);
  assert.match(migration, /identity_row\.provider = 'discord'/);
  assert.match(migration, /from public, anon, authenticated/);
  assert.match(migration, /alter table public\.players enable row level security/);
  assert.match(migration, /alter table public\.play_orders enable row level security/);
  assert.match(migration, /alter table public\.salary_wallet_entries enable row level security/);
  assert.match(migration, /alter table public\.users enable row level security/);
  assert.match(migration, /alter table public\.wallet_logs enable row level security/);
  assert.match(migration, /alter table public\.user_items enable row level security/);
  assert.match(migration, /discord_id = public\.erp_current_discord_id\(\)/);
  assert.match(
    migration,
    /create policy deepnight_players_select[\s\S]*?public\.erp_is_manager\('deepnight'\)/
  );
  assert.match(migration, /user_id = public\.erp_current_discord_id\(\)/);
  assert.match(migration, /'salary_withdraw_requests'/);
  assert.match(migration, /'member_monthly_accounts'/);
  assert.match(migration, /'jkopay_topup_orders'/);
  assert.match(migration, /'alliance_members'/);
  assert.match(migration, /create trigger qiunai_salary_order_requires_ledger/);
  assert.match(migration, /create trigger deepnight_salary_order_requires_ledger/);
  assert.match(migration, /不能只標記薪資已入帳/);
  assert.match(
    migration,
    /update of status,[\s\S]*?discord_id,[\s\S]*?wallet_period_key,[\s\S]*?order_amount,[\s\S]*?staff_salary,[\s\S]*?bonus_amount/
  );
  const selfUpdatePolicy = migration.slice(
    migration.indexOf("create policy deepnight_players_update"),
    migration.indexOf("create policy deepnight_players_insert"),
  );
  assert.match(selfUpdatePolicy, /public\.erp_is_manager\('deepnight'\)/);
  assert.doesNotMatch(selfUpdatePolicy, /erp_current_discord_id/);
  assert.match(migration, /已結算薪資不可直接改金額/);
  assert.match(
    migration,
    /'deepnight', 'play_orders', '1501098191813214312'/
  );
  assert.match(
    migration,
    /if v_source_table = 'play_orders'[\s\S]*?return new;/
  );
  assert.match(migration, /guild_id = '1501098191813214312'/);
  assert.match(
    migration,
    /guild_id is null[\s\S]*?exists \([\s\S]*?from public\.players/
  );
  assert.match(migration, /grant all on table public\.%I to service_role/);
  assert.match(migration, /prevent_settled_salary_order_delete/);
  assert.match(migration, /prevent_settled_salary_bonus_delete/);
  assert.match(migration, /or v_was_settled/);
  assert.match(
    migration,
    /old\.status = '已發薪'[\s\S]*?new\.status is distinct from '已發薪'/
  );
  assert.match(migration, /before delete on public\.play_orders/);
  assert.match(migration, /before delete on public\.players_bonus/);
  assert.doesNotMatch(migration, /create policy deepnight_orders_delete/);
  assert.doesNotMatch(migration, /create policy deepnight_bonus_delete/);
  assert.match(
    migration,
    /new\.discord_id is distinct from old\.discord_id[\s\S]*?new\.is_deleted is distinct from old\.is_deleted[\s\S]*?new\.wallet_period_key is distinct from old\.wallet_period_key/
  );
  assert.match(migration, /^begin;[\s\S]*commit;\s*$/m);
  assert.match(migration, /has_table_privilege\([\s\S]*?'anon'/);
});

test("獎金或扣薪只能刪未結算且無錢包明細的來源", async () => {
  const route = await read("app/api/deepnight/salary-adjustments/route.js");

  assert.match(route, /\.from\("salary_wallet_entries"\)[\s\S]*?\.select\("id"\)/);
  assert.match(route, /if \(adjustment\.wallet_settled_at \|\| walletEntry\)/);
  assert.match(route, /\.is\("wallet_settled_at", null\)/);
  assert.match(route, /deletedCount !== 1/);
  const walletReadBlock = route.slice(
    route.indexOf('.from("salary_wallet_entries")'),
    route.indexOf("if (walletReadError)"),
  );
  assert.doesNotMatch(walletReadBlock, /\.delete\(/);
  assert.doesNotMatch(route, /restoreAdjustment/);
});
