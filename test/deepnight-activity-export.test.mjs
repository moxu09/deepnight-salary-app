import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { groupActivityResponses } from "../lib/deepnightActivityGroups.ts";

const source = (await readFile(new URL("../app/api/deepnight/activities/[id]/export/route.js", import.meta.url), "utf8")).replace(/^import .*;\n/gm, "").replace(/^export /gm, "");
function handler(authorized = true) {
  const db = { from(table) { const query = {
    select() { return query; }, eq() { return query; },
    maybeSingle: async () => ({ data: { id: "activity", title: "深夜測試聚餐", starts_at: "2026-11-01T04:00:00Z" } }),
    order: async () => ({ data: [{ id: "north", label: "北部" }] }),
  }; assert.ok(table.startsWith("deepnight_")); return query; } };
  return new Function("ExcelJS", "NextResponse", "supabaseAdmin", "authorizeErpRequest", "groupActivityResponses", "activityRows", "relatedActivityRows", `${source}; return GET;`)(
    ExcelJS, Object.assign(Response, { json: Response.json }), db,
    async (_db, _request, org) => { assert.equal(org, "deepnight"); if (!authorized) throw new Error("沒有管理權限"); },
    groupActivityResponses,
    async () => [{ id: "r1", response_status: "attending", selected_option_id: "north", staff_nickname: "測試暱稱", staff_real_name: "測試姓名", staff_phone: "0900000000" }],
    async () => [{ response_id: "r1", slot: 1, guest_name: "測試親友", guest_phone: "0900000001" }],
  );
}
test("活動 Excel 匯出包含分區、人員及親友資料，使用台北時間與 A4 橫式", async () => {
  const response = await handler()(new Request("https://test.invalid/export"), { params: Promise.resolve({ id: "activity" }) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-disposition"), /\.xlsx/);
  const book = new ExcelJS.Workbook(); await book.xlsx.load(Buffer.from(await response.arrayBuffer()));
  const sheet = book.getWorksheet(1);
  assert.equal(sheet.pageSetup.paperSize, 9); assert.equal(sheet.pageSetup.orientation, "landscape");
  assert.equal(sheet.getCell("B2").value.toISOString(), "2026-11-01T12:00:00.000Z");
  const cells = []; sheet.eachRow((row) => row.eachCell((cell) => cells.push(cell.value)));
  assert.ok(cells.includes("測試暱稱")); assert.ok(cells.includes("測試親友")); assert.ok(cells.some((value) => String(value).includes("北部")));
});
test("無管理權限時不匯出員工名單", async () => {
  const response = await handler(false)(new Request("https://test.invalid/export"), { params: Promise.resolve({ id: "activity" }) });
  assert.equal(response.status, 400); assert.equal((await response.json()).ok, false);
});
