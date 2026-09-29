import assert from "node:assert/strict";
import test from "node:test";
import {
  FINANCE_ERP_INSTALLER_VERSION,
  financeInstallerPartPath,
  validateFinanceInstallerManifest,
} from "../lib/financeErpInstallers.js";

const files = ["mac-arm64", "mac-x64", "windows-x64", "android"].map((platform) => ({
  platform,
  filename: `finance-${platform}.zip`,
  size: 42,
  parts: 1,
  sha256: "a".repeat(64),
}));

test("accepts only a complete four-platform manifest", () => {
  assert.equal(validateFinanceInstallerManifest({ version: FINANCE_ERP_INSTALLER_VERSION, files }).length, 4);
  assert.throws(() => validateFinanceInstallerManifest({ version: FINANCE_ERP_INSTALLER_VERSION, files: files.slice(1) }));
  assert.throws(() => validateFinanceInstallerManifest({ version: FINANCE_ERP_INSTALLER_VERSION, files: [files[0], files[0], ...files.slice(2)] }));
});

test("rejects untrusted platform and filename paths", () => {
  assert.throws(() => validateFinanceInstallerManifest({ version: FINANCE_ERP_INSTALLER_VERSION, files: [{ ...files[0], filename: "../secret.zip" }, ...files.slice(1)] }));
  assert.throws(() => financeInstallerPartPath("../../secret", 0));
  assert.throws(() => financeInstallerPartPath("android", 10));
  assert.equal(financeInstallerPartPath("android", 0), `releases/${FINANCE_ERP_INSTALLER_VERSION}/android/part-00`);
});
