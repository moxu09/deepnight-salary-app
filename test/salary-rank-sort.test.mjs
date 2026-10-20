import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(
  path.join(dirname, "..", "app", "admin", "salary-rank", "page.tsx"),
  "utf8"
);

test("深夜薪資排行榜預設依訂單薪資降冪", () => {
  assert.match(
    source,
    /useState\("order_salary_desc"\)/
  );
  assert.match(
    source,
    /sortMode === "order_salary_desc"[\s\S]*?b\.orderSalary - a\.orderSalary/
  );
  assert.match(
    source,
    /<option value="order_salary_desc">訂單薪資降冪：高到低<\/option>/
  );
});

test("訂單薪資相同時使用穩定次排序", () => {
  assert.match(
    source,
    /b\.orderSalary - a\.orderSalary \|\|[\s\S]*?b\.totalSalary - a\.totalSalary \|\|[\s\S]*?b\.orderAmount - a\.orderAmount/
  );
});
