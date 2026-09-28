export const FINANCE_ERP_INSTALLER_BUCKET = "finance-erp-installers";
export const FINANCE_ERP_INSTALLER_VERSION = "0.2.6";
export const FINANCE_ERP_INSTALLER_PREFIX = `releases/${FINANCE_ERP_INSTALLER_VERSION}`;

export const FINANCE_ERP_PLATFORMS = Object.freeze({
  "mac-arm64": "Mac（Apple 晶片）",
  "mac-x64": "Mac（Intel）",
  "windows-x64": "Windows（64 位元）",
  android: "Android",
});

export function validateFinanceInstallerManifest(raw) {
  if (raw?.version !== FINANCE_ERP_INSTALLER_VERSION || !Array.isArray(raw.files)) {
    throw new Error("安裝包清單版本不正確");
  }
  const platforms = new Set();
  const files = raw.files.map((file) => {
    if (!Object.hasOwn(FINANCE_ERP_PLATFORMS, file?.platform) || platforms.has(file.platform)) {
      throw new Error("安裝包平台資料不正確");
    }
    platforms.add(file.platform);
    if (
      typeof file.filename !== "string" ||
      !file.filename.endsWith(".zip") ||
      file.filename.includes("/") ||
      file.filename.includes("\\") ||
      !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > 120 * 1024 * 1024 ||
      !Number.isSafeInteger(file.parts) || file.parts < 1 || file.parts > 10 ||
      !/^[a-f0-9]{64}$/.test(file.sha256)
    ) {
      throw new Error("安裝包清單內容不正確");
    }
    return {
      platform: file.platform,
      label: FINANCE_ERP_PLATFORMS[file.platform],
      filename: file.filename,
      size: file.size,
      parts: file.parts,
      sha256: file.sha256,
    };
  });
  if (platforms.size !== Object.keys(FINANCE_ERP_PLATFORMS).length) {
    throw new Error("安裝包清單不完整");
  }
  return files;
}

export function financeInstallerPartPath(platform, index) {
  if (!Object.hasOwn(FINANCE_ERP_PLATFORMS, platform) || !Number.isSafeInteger(index) || index < 0 || index > 9) {
    throw new Error("安裝包檔案路徑不正確");
  }
  return `${FINANCE_ERP_INSTALLER_PREFIX}/${platform}/part-${String(index).padStart(2, "0")}`;
}
