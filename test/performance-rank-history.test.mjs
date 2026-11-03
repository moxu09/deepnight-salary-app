import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchAllRows } from "../lib/fetchAllRows.js";

const source = readFileSync(
  new URL("../app/api/deepnight/performance-rank/route.js", import.meta.url),
  "utf8",
)
  .replace(/^import[\s\S]*?;\n/gm, "")
  .replace(/export const (runtime|dynamic)\s*=.*;\n/g, "")
  .replace("export async function GET", "async function GET");

test("historical ranking reads every order page and includes the final millisecond", async () => {
  const orderPages = [];
  const filters = [];
  const orders = Array.from({ length: 1000 }, (_, index) => ({
    id: `other-${index}`,
    discord_id: "other",
    order_amount: 1,
    status: "completed",
  }));
  orders.push({ id: "mine", discord_id: "me", order_amount: 1200, status: "completed" });

  const supabaseAdmin = {
    from(table) {
      const query = {};
      for (const method of ["select", "eq", "or", "gte", "lt", "lte", "like", "order"])
        query[method] = (...args) => { filters.push({ table, method, args }); return query; };
      query.range = async (from, to) => {
        if (table === "play_orders") orderPages.push(from);
        const rows = table === "play_orders"
          ? orders
          : table === "players"
            ? [{ id: "staff-me", discord_id: "me" }, { id: "staff-other", discord_id: "other" }]
            : [];
        return { data: rows.slice(from, to + 1), error: null };
      };
      return query;
    },
  };
  const GET = new Function(
    "NextResponse", "supabaseAdmin", "getAuthUserFromRequest",
    "getTaipeiMonthInput", "monthInputToTaipeiRange", "fetchAllRows",
    `${source}; return GET;`,
  )(
    { json: Response.json }, supabaseAdmin, async () => ({ discordId: "me" }),
    () => "2026-10", () => ({ startIso: "2026-09-30T16:00:00.000Z", endIso: "2026-10-31T15:59:59.999Z" }),
    fetchAllRows,
  );

  const response = await GET(new Request("https://example.test/api/deepnight/performance-rank?month=2026-10"));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ranking.rank, 1);
  assert.equal(body.ranking.performanceAmount, 1200);
  assert.deepEqual(orderPages, [0, 500, 1000, 1001]);
  assert.ok(filters.some(({ table, method, args }) =>
    table === "play_orders" && method === "lt" && args[0] === "order_finished_at" && args[1] === "2026-10-31T16:00:00.000Z"));
});
