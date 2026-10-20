import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { adminFileDownloadUrl } from "../lib/adminFileDownloadUrl.js";

test("Chinese filenames are encoded exactly once, preserving the storage token", () => {
  for (const name of ["深夜不關燈｜陪玩營運手冊.pdf", "秋奈新人手冊.pdf", "資料 & 說明 #1+100%.pdf", "hello world.pdf"]) {
    const before = new URL("https://example.com/storage/v1/object/sign/private/folder/object?token=example.signature&other=keep");
    const after = new URL(adminFileDownloadUrl(before.toString(), name));
    assert.equal(after.searchParams.get("download"), name);
    assert.equal(after.searchParams.get("token"), before.searchParams.get("token"));
    assert.equal(after.searchParams.get("other"), "keep");
    assert.equal(after.pathname, before.pathname);
    assert.equal(after.origin, before.origin);
    assert.equal(adminFileDownloadUrl(after.toString(), name), after.toString());
    if (name.includes("手冊")) assert.ok(!after.searchParams.toString().includes("%25E"));
  }
});

test("existing malformed download names are replaced, not decoded repeatedly", () => {
  const result = new URL(adminFileDownloadUrl("https://example.com/a?token=keep&download=%25E6%2596%25B0", "新人手冊.pdf"));
  assert.equal(result.searchParams.get("download"), "新人手冊.pdf");
  assert.equal(result.searchParams.getAll("download").length, 1);
});

test("storage signs the private object before adding the display filename", async () => {
  const source = await readFile(new URL("../lib/adminFileStorage.js", import.meta.url), "utf8");
  assert.match(source, /createSignedUrl\(path, 60\)/);
  assert.doesNotMatch(source, /createSignedUrl\(path, 60, \{ download: name \}\)/);
  assert.match(source, /adminFileDownloadUrl\(data.signedUrl, name\)/);
});
