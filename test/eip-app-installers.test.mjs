import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { createEipInstallerHandlers } from "../lib/eipAppInstallers.js";

function setup({ active = true, corrupt = false, badPath = false, saveError = false } = {}) {
  const bytes = Buffer.alloc(2048); bytes[0] = 77; bytes[1] = 90;
  let row = { organization_code: "deepnight", platform: "windows-x64", version: "1.0.0", filename: "深夜-EIP.exe", path: badPath ? "qiunai/installers/windows-x64/test.exe" : "deepnight/installers/windows-x64/test.exe", size: bytes.length, sha256: corrupt ? "0".repeat(64) : createHash("sha256").update(bytes).digest("hex") };
  const calls = [];
  const db = {
    from(table) {
      const filters = {};
      const query = {
        select() { return query; }, eq(key, value) { filters[key] = value; calls.push([table, key, value]); return query; },
        maybeSingle() { return Promise.resolve({ data: table === "players" ? { discord_id: "staff", is_active: active } : filters.organization_code === "deepnight" ? row : null }); },
        order() { return Promise.resolve({ data: filters.organization_code === "deepnight" ? [row] : [] }); },
        upsert(value) { if (saveError) return Promise.resolve({ error: new Error("database failure") }); row = value; return Promise.resolve({ error: null }); },
      };
      return query;
    },
    storage: { from(bucket) { assert.equal(bucket, "salary-admin-files"); return {
      download(path) { calls.push(["download", path]); return Promise.resolve({ data: new Blob([bytes]) }); },
      upload(path) { calls.push(["upload", path]); return Promise.resolve({ error: null }); },
      remove(paths) { calls.push(["remove", paths]); return Promise.resolve({ error: null }); },
    }; } },
  };
  const authenticate = async (request) => {
    if (!request.headers.get("authorization")) throw Object.assign(new Error("請先登入"), { status: 401 });
    return { discordId: "staff" };
  };
  const authorizeAdmin = async (request) => {
    await authenticate(request);
    if (request.headers.get("authorization") !== "Bearer manager") throw Object.assign(new Error("沒有管理權限"), { status: 403 });
    return { discordId: "manager" };
  };
  return { ...createEipInstallerHandlers({ db, authenticate, authorizeAdmin }), bytes, calls };
}
const request = (suffix = "", user = "staff") => new Request(`https://test.invalid/api/deepnight/installers${suffix}`, { headers: user ? { Authorization: `Bearer ${user}` } : {} });
function upload(bytes, user = "manager", filename = "深夜-EIP.exe") {
  const form = new FormData(); form.set("platform", "windows-x64"); form.set("version", "1.0.1"); form.set("file", new File([bytes], filename));
  return new Request("https://test.invalid/api/deepnight/installers", { method: "POST", headers: { Authorization: `Bearer ${user}` }, body: form });
}
test("匿名、離職員工與假冒管理查詢無法取得安裝包", async () => {
  assert.equal((await setup().GET(request("", null))).status, 401);
  assert.equal((await setup({ active: false }).GET(request())).status, 403);
  assert.equal((await setup().GET(request("?admin=1"))).status, 403);
});
test("員工只能看到深夜清單，儲存路徑不回傳至前端", async () => {
  const app = setup(); const response = await app.GET(request());
  assert.equal(response.status, 200);
  const body = await response.json(); assert.equal(body.files.length, 1); assert.equal(body.files[0].path, undefined);
  assert.ok(app.calls.some((call) => call[1] === "organization_code" && call[2] === "deepnight"));
});
test("Windows EXE 長度、雜湊及中文檔名一致，毀損與跨店路徑不下載", async () => {
  const app = setup(), response = await app.GET(request("?platform=windows-x64"));
  assert.equal(response.status, 200);
  assert.equal((await response.arrayBuffer()).byteLength, app.bytes.length);
  assert.match(response.headers.get("content-disposition"), /filename\*=UTF-8''/);
  assert.equal((await setup({ corrupt: true }).GET(request("?platform=windows-x64"))).status, 500);
  const bad = setup({ badPath: true }); assert.equal((await bad.GET(request("?platform=windows-x64"))).status, 500);
  assert.ok(!bad.calls.some((call) => call[0] === "download"));
});
test("上傳要求管理權限、真實 EXE 標頭；失敗時清理新物件", async () => {
  const app = setup(); assert.equal((await app.POST(upload(app.bytes, "staff"))).status, 403);
  assert.equal((await app.POST(upload(Buffer.alloc(2048)))).status, 400);
  assert.equal((await app.POST(upload(app.bytes, "manager", "fake.zip"))).status, 400);
  assert.equal((await app.POST(upload(app.bytes))).status, 201);
  const fail = setup({ saveError: true }); assert.equal((await fail.POST(upload(fail.bytes))).status, 500);
  assert.ok(fail.calls.some((call) => call[0] === "remove"));
});
