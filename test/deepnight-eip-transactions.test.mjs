import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const staff = "100000000000000001", inactive = "100000000000000002";
const activity = "a0000000-0000-4000-8000-000000000001", otherActivity = "a0000000-0000-4000-8000-000000000002";
const option = "b0000000-0000-4000-8000-000000000001", otherOption = "b0000000-0000-4000-8000-000000000002";
const poll = "c0000000-0000-4000-8000-000000000001", foreignPoll = "c0000000-0000-4000-8000-000000000002";
const choice = "d0000000-0000-4000-8000-000000000001", choice2 = "d0000000-0000-4000-8000-000000000002", foreignChoice = "d0000000-0000-4000-8000-000000000003";
const migrations = ["20261021010000_deepnight_eip_activities_polls.sql", "20261021011000_deepnight_eip_atomic_responses.sql", "20261021012000_eip_app_installers.sql", "20261021013000_deepnight_activity_history_guards.sql"];
before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table players(discord_id text primary key, is_active boolean, created_at timestamptz default now() - interval '30 days', display_name text, discord_name text, real_name text);
    create table play_orders(id uuid primary key default gen_random_uuid(), discord_id text, is_deleted boolean, completed_at timestamptz, salary_paid boolean, status text);
    create table salary_announcements(id uuid primary key, organization_code text, is_active boolean default true, is_poll boolean default true, poll_allow_multiple boolean default false, audience_discord_ids text[] default '{}', starts_at timestamptz, ends_at timestamptz);
  `);
  for (const name of migrations) await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"));
  // Re-applying migrations must preserve existing data and privileges.
  for (const name of migrations) await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"));
  await db.query("insert into players(discord_id,is_active) values ($1,true),($2,false)", [staff, inactive]);
  await db.query("insert into deepnight_activities(id,title,starts_at,response_deadline) values ($1,'測試活動',now()+interval '7 days',now()+interval '6 days'),($2,'另一活動',now()+interval '7 days',now()+interval '6 days')", [activity, otherActivity]);
  await db.query("insert into deepnight_activity_options(id,activity_id,label) values($1,$2,'北部'),($3,$4,'南部')", [option, activity, otherOption, otherActivity]);
  await db.query("insert into salary_announcements(id,organization_code) values($1,'deepnight'),($2,'qiunai')", [poll, foreignPoll]);
  await db.query("insert into salary_poll_options(id,announcement_id,label) values($1,$2,'A'),($3,$2,'B'),($4,$5,'其他店')", [choice, poll, choice2, foreignChoice, foreignPoll]);
});
after(() => db.close());

function respond({ id = activity, person = staff, status = "attending", selected = option, guests = [] } = {}) {
  return db.query("select submit_deepnight_activity_response($1,$2,$3,$4,$5::jsonb) as response", [id, person, status, selected, JSON.stringify(guests)]);
}
const vote = (options, person = staff, id = poll) => db.query("select replace_deepnight_poll_vote($1,$2,$3::uuid[])", [id, person, options]);

test("報名與親友原子寫入，重送只保留一份回覆並保留最早報名時間", async () => {
  const first = await respond({ guests: [{ name: "測試親友", phone: "0900000000" }] });
  const second = await respond();
  assert.equal(first.rows[0].response.id, second.rows[0].response.id);
  assert.equal(first.rows[0].response.submitted_at, second.rows[0].response.submitted_at);
  assert.equal((await db.query("select count(*)::int as n from deepnight_activity_responses")).rows[0].n, 1);
  assert.equal((await db.query("select count(*)::int as n from deepnight_activity_guests")).rows[0].n, 0);
});
test("錯誤場次與不完整親友資料不覆寫原報名", async () => {
  await assert.rejects(respond({ selected: otherOption }), /不屬於此活動/);
  await assert.rejects(respond({ guests: [{ name: "測試", phone: "" }] }), /完整填寫/);
  await assert.rejects(respond({ person: inactive }), /有效員工/);
  assert.equal((await db.query("select selected_option_id from deepnight_activity_responses where discord_id=$1", [staff])).rows[0].selected_option_id, option);
});
test("截止後不可報名，資格計算排除未完成及刪除訂單", async () => {
  await db.query("update deepnight_activities set min_completed_orders=1 where id=$1", [activity]);
  await db.query("insert into play_orders(discord_id,status,is_deleted) values($1,'工時待審核',false)", [staff]);
  await assert.rejects(respond(), /不符合參與門檻/);
  await db.query("insert into play_orders(discord_id,status,is_deleted) values($1,'已入帳',true)", [staff]);
  await assert.rejects(respond(), /不符合參與門檻/);
  await db.query("insert into play_orders(discord_id,status,is_deleted) values($1,'已入帳',false)", [staff]);
  await respond();
  await db.query("update deepnight_activities set response_deadline=now()-interval '1 second' where id=$1", [activity]);
  await assert.rejects(respond(), /已截止/);
  await db.query("update deepnight_activities set response_deadline=now()+interval '6 days' where id=$1", [activity]);
});
test("不參與回覆會清除場次及親友，不受參與資格阻擋", async () => {
  await db.query("update deepnight_activities set min_completed_orders=999 where id=$1", [activity]);
  const r = await respond({ status: "not_attending" });
  assert.equal(r.rows[0].response.selected_option_id, null);
  assert.equal(r.rows[0].response.response_status, "not_attending");
});
test("已報名活動及選項即使直接從資料庫刪除也會被攔截", async () => {
  await db.query("update deepnight_activities set min_completed_orders=0 where id=$1", [activity]);
  await respond();
  await assert.rejects(db.query("delete from deepnight_activity_options where id=$1", [option]), /不能刪除/);
  await assert.rejects(db.query("delete from deepnight_activities where id=$1", [activity]), /保留紀錄/);
});
test("單選拒絕複選、跨店選項、其他店投票與停職人員，原投票不會消失", async () => {
  await vote([choice]);
  await assert.rejects(vote([choice, choice2]), /只能選一個/);
  await assert.rejects(vote([foreignChoice]), /選項不正確/);
  await assert.rejects(vote([foreignChoice], staff, foreignPoll), /無法作答/);
  await assert.rejects(vote([choice], inactive), /在職員工/);
  const rows = (await db.query("select option_id from salary_poll_votes where announcement_id=$1", [poll])).rows;
  assert.deepEqual(rows.map((r) => r.option_id), [choice]);
});
test("複選可更新且重送不重複，截止與指定對象仍受保護", async () => {
  await db.query("update salary_announcements set poll_allow_multiple=true where id=$1", [poll]);
  await vote([choice, choice2]); await vote([choice, choice2]);
  assert.equal((await db.query("select count(*)::int as n from salary_poll_votes where announcement_id=$1", [poll])).rows[0].n, 2);
  await db.query("update salary_announcements set ends_at=now()-interval '1 second' where id=$1", [poll]);
  await assert.rejects(vote([choice]), /已截止/);
  await db.query("update salary_announcements set ends_at=null,audience_discord_ids=array['100000000000000009'] where id=$1", [poll]);
  await assert.rejects(vote([choice]), /對象名單/);
});
test("瀏覽器角色無法直接讀寫活動、投票、安裝包或執行內部寫入 RPC", async () => {
  for (const role of ["anon", "authenticated"]) {
    for (const table of ["deepnight_activities", "deepnight_activity_responses", "deepnight_activity_guests", "salary_poll_votes", "eip_app_installers"]) {
      const r = await db.query("select has_table_privilege($1,$2,'SELECT') as can_read,has_table_privilege($1,$2,'INSERT') as can_write", [role, table]);
      assert.deepEqual(r.rows[0], { can_read: false, can_write: false });
    }
    const r = await db.query("select has_function_privilege($1,'replace_deepnight_poll_vote(uuid,text,uuid[])','EXECUTE') as allowed", [role]);
    assert.equal(r.rows[0].allowed, false);
  }
});
