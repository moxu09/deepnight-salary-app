import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const organization = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).name.startsWith("qiunai") ? "qiunai" : "deepnight";
const employee = "employee";
const manager = "manager";
const resignationReviewer = "resignation-reviewer";

function setup(targetOrganization = organization) {
  const rows = [
    { id: "old-pending", organization_code: targetOrganization, discord_id: employee, application_date: "2025-01-01", created_at: "2025-01-01T00:00:00Z", status: "pending", request_type: "代支報銷", approval_category: "reimbursement", form_data: { attachments: [{ path: "proof.png" }] } },
    { id: "resignation", organization_code: targetOrganization, discord_id: employee, application_date: "2025-02-01", created_at: "2025-02-01T00:00:00Z", status: "pending", request_type: "離職申請書", approval_category: "administrative", form_data: {} },
    { id: "other-company", organization_code: targetOrganization === "qiunai" ? "deepnight" : "qiunai", discord_id: employee, application_date: "2025-01-01", created_at: "2025-01-01T00:00:00Z", status: "pending", request_type: "代支報銷", approval_category: "reimbursement", form_data: {} },
  ];
  const updates = [];
  const removed = [];
  const supabaseAdmin = {
    from(table) {
      const filters = [];
      let options = {};
      let page = null;
      let patch = null;
      const query = {
        select(_columns, nextOptions = {}) { options = nextOptions; return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        gte(key, value) { filters.push([key, { gte: value }]); return this; },
        lt(key, value) { filters.push([key, { lt: value }]); return this; },
        order() { return this; },
        range(start, end) { page = [start, end]; return this; },
        in() { return this; },
        update(value) { patch = value; return this; },
        result() {
          const matching = (table === "salary_requests" ? rows : []).filter((row) => filters.every(([key, value]) => {
            if (value && typeof value === "object" && "gte" in value) return row[key] >= value.gte;
            if (value && typeof value === "object" && "lt" in value) return row[key] < value.lt;
            return row[key] === value;
          }));
          if (patch && matching.length) { Object.assign(matching[0], patch); updates.push({ filters: [...filters], patch }); }
          return { data: options.head ? null : page ? matching.slice(page[0], page[1] + 1) : matching, count: options.count === "exact" ? matching.length : null, error: null };
        },
        then(resolve, reject) { return Promise.resolve(this.result()).then(resolve, reject); },
        single() { const result = this.result(); return Promise.resolve({ ...result, data: result.data[0] || null }); },
        maybeSingle() { const result = this.result(); return Promise.resolve({ ...result, data: result.data[0] || null }); },
      };
      return query;
    },
  };
  const routeSource = readFileSync(join(root, `app/api/${targetOrganization}/hr/route.js`), "utf8");
  const source = routeSource
    .slice(routeSource.indexOf("export const runtime"))
    .replaceAll("export ", "");
  const context = {
    supabaseAdmin,
    getAuthUserFromRequest: async (_db, request) => ({ discordId: request.discordId }),
    getErpAccessByDiscordId: async (_db, _org, discordId) => ({ capabilities: {
      canReviewAll: discordId === manager,
      canReviewResignations: discordId === resignationReviewer,
    }, assignment: { display_name: "管理員" } }),
    getTaipeiMonthInput: () => "2026-09",
    signRequestAttachments: async (items) => items,
    removeRequestImages: async (paths) => { removed.push(paths); },
    uploadRequestImages: async () => [],
    NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) },
    URL, Date, String, Number, Object, Array, Set, Map, Promise, console,
    process: { env: {} },
  };
  runInNewContext(`${source}\nthis.handlers = { GET, PATCH };`, context);
  return { handlers: context.handlers, rows, updates, removed };
}

const get = (discordId, suffix = "", targetOrganization = organization) => ({ discordId, url: `https://test.local/api/${targetOrganization}/hr?mode=admin&view=inbox${suffix}` });
const patch = (discordId, body) => ({ discordId, json: async () => body });

test("legacy approvals appear in the workbench across months and cannot leak across organizations", async () => {
  const { handlers } = setup();
  const response = await handlers.GET(get(manager));
  assert.equal(response.status, 200);
  assert.deepEqual(Array.from(response.body.requests, (row) => row.id), ["old-pending", "resignation"]);
  assert.equal(response.body.summary.pending, 2);
  assert.equal(response.body.pagination.total, 2);
});

test("HR inbox applies category filtering and 25-row pagination on the server", async () => {
  const { handlers, rows } = setup();
  for (let index = 0; index < 28; index++) rows.push({
    ...rows[0], id: `pending-${index}`, created_at: `2024-01-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
  });
  const response = await handlers.GET(get(manager, "&status=pending&category=reimbursement&page=2"));
  assert.equal(response.status, 200);
  assert.equal(response.body.summary.pending, 29);
  assert.equal(response.body.pagination.total, 29);
  assert.equal(response.body.pagination.page, 2);
  assert.equal(response.body.requests.length, 4);
  assert.ok(response.body.requests.every((row) => row.approval_category === "reimbursement"));
});

test("approval decisions reject self-signing, missing rejection reason and repeat signing", async () => {
  const { handlers, rows, updates, removed } = setup();
  rows.push({ ...rows[0], id: "self-request", discord_id: manager });
  const self = await handlers.PATCH(patch(manager, { id: "self-request", status: "approved" }));
  assert.match(self.body.message, /不能簽核自己的申請/);
  assert.equal((await handlers.PATCH(patch(manager, { id: "old-pending", status: "rejected", reviewResult: " " }))).status, 400);
  assert.equal(updates.length, 0);
  assert.equal(removed.length, 0);
  const approved = await handlers.PATCH(patch(manager, { id: "old-pending", status: "approved" }));
  assert.equal(approved.status, 200);
  assert.equal(approved.body.request.status, "approved");
  assert.equal(removed.length, 1);
  assert.equal((await handlers.PATCH(patch(manager, { id: "old-pending", status: "approved" }))).status, 400);
  assert.equal(removed.length, 1);
  assert.ok(updates[0].filters.some(([key, value]) => key === "status" && value === "pending"));
});

test("DeepNight resignation reviewer sees only resignation applications", async () => {
  if (organization !== "deepnight") return;
  const { handlers } = setup();
  const response = await handlers.GET(get(resignationReviewer));
  assert.equal(response.status, 200);
  assert.deepEqual(Array.from(response.body.requests, (row) => row.id), ["resignation"]);
  assert.equal(response.body.summary.pending, 1);
});

test("DeepNight unified backend serves Qiunai HR inbox with organization isolation", async () => {
  if (organization !== "deepnight") return;
  const { handlers } = setup("qiunai");
  const unauthorized = await handlers.GET(get(employee, "", "qiunai"));
  assert.equal(unauthorized.status, 400);
  const response = await handlers.GET(get(manager, "", "qiunai"));
  assert.equal(response.status, 200);
  assert.deepEqual(Array.from(response.body.requests, (row) => row.id), ["old-pending", "resignation"]);
  assert.equal(response.body.summary.pending, 2);
});
