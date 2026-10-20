import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fetchAllRows } from "../lib/fetchAllRows.js";

function queryFor(length, cap = 1000, failAt = Infinity) {
  const source = Array.from({ length }, (_, id) => ({ id, amount: id + 1 }));
  const calls = [];
  return {
    calls,
    order(column) { assert.equal(column, "id"); return this; },
    async range(from, to) {
      calls.push([from, to]);
      if (from >= failAt) return { data: null, error: { message: "query failed" } };
      return { data: source.slice(from, Math.min(to + 1, from + cap)), error: null };
    },
  };
}

for (const length of [0, 1, 500, 1000, 2790, 6001]) {
  test(`讀完整 ${length} 筆，不截斷或重複`, async () => {
    const result = await fetchAllRows(queryFor(length));
    assert.equal(result.error, null);
    assert.equal(result.data.length, length);
    assert.equal(new Set(result.data.map(x => x.id)).size, length);
    assert.equal(result.data.reduce((n, x) => n + x.amount, 0), length * (length + 1) / 2);
  });
}

test("伺服器上限比頁面小時仍讀完整", async () => {
  const result = await fetchAllRows(queryFor(1790, 137));
  assert.equal(result.data.length, 1790);
});

test("後續分頁錯誤不回傳部分財務數字", async () => {
  const result = await fetchAllRows(queryFor(2790, 1000, 1000));
  assert.equal(result.data, null);
  assert.equal(result.error.message, "query failed");
});

test("共同總覽所有金額來源均分頁且仍保留權限與部門條件", async () => {
  const route = await readFile(new URL("../app/api/common-admin/overview/route.js", import.meta.url), "utf8");
  for (const table of ["play_orders", "qiunai_salary_orders", "players_bonus", "qiunai_staff_bonus", "salary_wallet_entries", "salary_withdraw_requests"]) {
    assert.match(route, new RegExp(`fetchAllRows\\(\\s*supabaseAdmin\\s*\\.from\\("${table}"\\)`));
  }
  assert.match(route, /actor.discordId !== ERP_OWNER_DISCORD_ID/);
  assert.match(route, /guild_id.eq.\$\{DEEPNIGHT_GUILD_ID\}/);
  assert.match(route, /if \(failed\?\.error\) throw failed.error/);
});

test("總覽依完整資料計算訂單、營收、薪資、獎金與待發", async () => {
  const source = await readFile(new URL("../app/api/common-admin/overview/route.js", import.meta.url), "utf8");
  const functions = source.slice(source.indexOf("function number("), source.indexOf("function unwithdrawnByDepartment("));
  const summarize = new Function(`${functions}; return summarize;`)();
  const orders = Array.from({ length: 2790 }, (_, id) => ({
    id, order_amount: 100, staff_salary: 80, bonus_amount: 1,
    status: "未入帳", wallet_settled_at: null,
  }));
  const bonuses = Array.from({ length: 1201 }, (_, id) => ({ id, amount: 2, wallet_settled_at: null }));
  const result = summarize(123, orders, bonuses, "已入帳", 123456);
  assert.deepEqual(result, {
    activeStaff: 123, orderCount: 2790, revenue: 279000, salary: 223200,
    bonus: 5192, unpaid: 228392, unwithdrawn: 123456,
  });
});
