import "server-only";

import { createHash, randomBytes } from "node:crypto";

const VALID_ORGANIZATIONS = new Set(["deepnight", "qiunai"]);
const VALID_STATES = new Set(["enabled", "disabled", "unknown", "unsupported"]);

export function normalizeAuditOrganization(value) {
  const organization = String(value || "").trim().toLowerCase();
  if (!VALID_ORGANIZATIONS.has(organization)) {
    throw new Error("電腦稽核部門不正確");
  }
  return organization;
}

export function createUploadToken() {
  return randomBytes(24).toString("base64url");
}

export function hashUploadToken(value) {
  return createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

export function sha256Buffer(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stateOf(value) {
  if (typeof value === "string" && VALID_STATES.has(value)) return value;
  if (value && typeof value.status === "string" && VALID_STATES.has(value.status)) {
    return value.status;
  }
  return "unknown";
}

function isBadSignature(status = "") {
  return /nottrusted|hashmismatch|unknownerror/i.test(status);
}

function isUnsigned(status = "") {
  return /notsigned|unsigned/i.test(status);
}

function isUserWritablePath(path = "") {
  return /\\users\\|\\appdata\\|\\temp\\|\\downloads\\/i.test(path);
}

function addFinding(findings, severity, category, title, detail) {
  findings.push({
    id: `${category}-${findings.length + 1}`,
    severity,
    category,
    title,
    detail,
  });
}

function riskBandOf(score) {
  if (score >= 75) return "極高風險";
  if (score >= 50) return "嚴重風險";
  if (score >= 25) return "高風險";
  if (score >= 11) return "需注意";
  return "低風險";
}

function assessmentOf(findings, score) {
  const hasTitle = (pattern) =>
    findings.some((finding) => pattern.test(String(finding.title || "")));

  if (hasTitle(/未簽章|簽章無效/)) {
    return "發現驅動程式簽章異常｜需要人工複查";
  }
  if (hasTitle(/未受信任服務/)) {
    return "發現未受信任服務正在執行｜需要人工複查";
  }
  if (hasTitle(/未確認處理完成的 Defender/)) {
    return "發現 Defender 偵測尚未確認處理｜需要人工複查";
  }
  if (
    hasTitle(/Kernel DMA Protection 未啟用/) &&
    !findings.some((finding) => finding.severity === "high")
  ) {
    return "未發現明顯異常｜Kernel DMA Protection 待開啟";
  }
  if (hasTitle(/未以系統管理員執行/)) {
    return "尚未發現明顯異常｜請以系統管理員重新掃描";
  }
  if (score >= 75) return "發現嚴重風險跡象｜建議停止審核並人工查驗";
  if (score >= 50) return "發現多項高風險跡象｜建議暫緩審核";
  if (score >= 25) return "發現需人工複查的風險跡象";
  if (score >= 11) return "未發現明顯異常｜有安全設定待改善";
  if (findings.length) return "未發現明顯異常｜部分掃描資訊待確認";
  return "未發現明顯異常";
}

function plainLanguageAnalysis({
  findings,
  states,
  dmaCandidateCount,
  unsignedDriverCount,
  invalidDriverCount,
  defenderDetectionCount,
  collectionErrorCount,
  isAdministrator,
  score,
}) {
  const details = [
    `本次風險分數為 ${score} 分。這是掃描命中項目的加總，不是開掛機率，也不能單靠分數認定有使用外掛。`,
  ];
  const nextSteps = [];
  const highCount = findings.filter((finding) => finding.severity === "high").length;

  if (unsignedDriverCount === 0 && invalidDriverCount === 0) {
    details.push("目前沒有發現正在執行且未簽章或簽章失效的驅動程式。");
  } else {
    details.push(
      `發現 ${unsignedDriverCount} 個未簽章驅動、${invalidDriverCount} 個簽章失效驅動；這些項目需要人工核對檔案路徑、發布者與用途。`,
    );
    nextSteps.push("請審核人員逐一核對異常驅動的名稱、檔案路徑、數位簽章與 SHA-256。");
  }

  if (states.kernelDmaProtection === "disabled") {
    details.push(
      "Kernel DMA Protection 未啟用，代表 Windows 目前沒有開啟核心 DMA 防護；許多正常電腦也會因主機板、BIOS 或硬體支援而出現此狀態，不能單獨視為 DMA 外掛證據。",
    );
    nextSteps.push("可在 BIOS 開啟 VT-d／AMD-Vi，並於 Windows 系統資訊確認 Kernel DMA Protection 後重新掃描。");
  } else if (states.kernelDmaProtection === "unknown") {
    details.push("系統無法自動確認 Kernel DMA Protection 狀態，需要透過 Windows 系統資訊（msinfo32）人工查看。");
    nextSteps.push("請開啟 msinfo32，確認「核心 DMA 保護」欄位後再判讀。");
  }

  details.push(
    `掃描列出 ${dmaCandidateCount} 個 DMA 可存取裝置，通常包含顯示卡、網卡、儲存與系統控制器；這個數量不會加分，也不代表找到 ${dmaCandidateCount} 個外掛。`,
  );

  if (defenderDetectionCount === 0) {
    details.push("本次報告沒有讀到近期 Microsoft Defender 偵測紀錄。");
  } else {
    details.push(`讀到 ${defenderDetectionCount} 筆 Microsoft Defender 偵測紀錄；偵測紀錄不一定與遊戲外掛有關，需查看威脅名稱與是否已處理。`);
    nextSteps.push("請人工確認 Defender 偵測名稱、發生時間及處理是否成功。");
  }

  if (!isAdministrator) {
    details.push("這次不是以系統管理員權限掃描，因此部分驅動、安全性與事件資料可能讀取不完整。");
    nextSteps.push("請以系統管理員身分執行「點我查詢.cmd」後重新掃描。");
  }
  if (collectionErrorCount > 0) {
    details.push(`共有 ${collectionErrorCount} 個掃描項目未完成，因此這份報告可能缺少部分資料。`);
    nextSteps.push("請查看「部分掃描項目未完成」內容；若屬重要項目，排除錯誤後重新掃描。");
  }

  if (highCount === 0) {
    nextSteps.push("目前沒有足以單獨認定外掛的高風險證據，可完成安全設定或補掃後再由審核人員確認。");
  } else {
    nextSteps.push("目前存在高風險項目，建議先暫緩審核，完成驅動、服務或 Defender 紀錄的人工查驗。");
  }

  return { details, nextSteps };
}

export function validateDeviceAuditReport(report) {
  const errors = [];
  if (!report || typeof report !== "object") errors.push("報告格式不是 JSON 物件");
  if (report?.schemaVersion !== "1.0") errors.push("不支援的報告版本");
  if (report?.consent?.accepted !== true) errors.push("缺少本人掃描同意紀錄");
  if (report?.consent?.automaticUploadAccepted !== true) {
    errors.push("缺少完成後自動上傳的同意紀錄");
  }
  if (!report?.reportId) errors.push("缺少報告編號");
  if (!report?.applicantId) errors.push("缺少申請編號或 Discord ID");
  if (!report?.generatedAt || Number.isNaN(Date.parse(report.generatedAt))) {
    errors.push("報告產生時間無效");
  }
  if (!report?.sections || typeof report.sections !== "object") {
    errors.push("缺少掃描資料");
  }
  return errors;
}

export function analyzeDeviceAudit(report) {
  const errors = validateDeviceAuditReport(report);
  if (errors.length) return { ok: false, errors };

  const findings = [];
  const sections = report.sections || {};
  const security = sections.security || {};
  const states = {
    secureBoot: stateOf(security.secureBoot),
    tpm: stateOf(security.tpm),
    vbs: stateOf(security.vbs),
    memoryIntegrity: stateOf(security.memoryIntegrity),
    kernelDmaProtection: stateOf(security.kernelDmaProtection),
    dmaRemapping: stateOf(security.dmaRemapping),
  };

  if (states.secureBoot === "disabled") {
    addFinding(findings, "high", "platform", "Secure Boot 未啟用", "系統開機信任鏈未完整啟用。");
  } else if (states.secureBoot === "unknown") {
    addFinding(findings, "low", "platform", "Secure Boot 狀態不明", "可能未以系統管理員執行。");
  }
  if (states.memoryIntegrity === "disabled") {
    addFinding(findings, "high", "platform", "記憶體完整性未啟用", "核心隔離保護未運作。");
  }
  if (states.vbs === "disabled") {
    addFinding(findings, "medium", "platform", "VBS 未運作", "虛擬化型安全性未處於執行狀態。");
  }
  if (states.tpm === "disabled" || states.tpm === "unsupported") {
    addFinding(findings, "medium", "platform", "TPM 不可用", "未偵測到可用且就緒的 TPM。");
  }
  if (states.kernelDmaProtection === "disabled") {
    addFinding(
      findings,
      "medium",
      "dma",
      "Kernel DMA Protection 未啟用",
      "Windows 核心 DMA 防護目前未啟用；此狀態常受主機板、BIOS 與硬體支援影響，不能單獨判定為外掛。",
    );
  } else if (states.kernelDmaProtection === "unknown") {
    addFinding(findings, "medium", "dma", "Kernel DMA Protection 狀態不明", "需以 msinfo32 人工確認。");
  }
  if (["disabled", "unsupported"].includes(states.dmaRemapping)) {
    addFinding(findings, "medium", "dma", "未確認 DMA Remapping 能力", "需確認 BIOS 的 IOMMU 或 AMD-Vi。");
  }

  const runningDrivers = (sections.drivers || []).filter(
    (driver) => String(driver.state || "").toLowerCase() === "running",
  );
  const unsignedDrivers = runningDrivers.filter((driver) =>
    isUnsigned(driver.signatureStatus),
  );
  const invalidDrivers = runningDrivers.filter((driver) =>
    isBadSignature(driver.signatureStatus),
  );
  if (invalidDrivers.length) {
    addFinding(findings, "high", "driver", "執行中的驅動程式簽章無效", `共 ${invalidDrivers.length} 個，需人工核對。`);
  }
  if (unsignedDrivers.length) {
    addFinding(findings, "high", "driver", "執行中的驅動程式未簽章", `共 ${unsignedDrivers.length} 個，需人工核對。`);
  }

  const riskyServices = (sections.services || []).filter(
    (service) =>
      String(service.state || "").toLowerCase() === "running" &&
      isUserWritablePath(service.path) &&
      (isUnsigned(service.signatureStatus) || isBadSignature(service.signatureStatus)),
  );
  if (riskyServices.length) {
    addFinding(findings, "high", "service", "可寫入目錄中執行未受信任服務", `共 ${riskyServices.length} 個。`);
  }

  const detections = sections.defenderDetections || [];
  if (detections.length) {
    const unresolved = detections.filter(
      (item) => item.actionSuccess === false || item.actionSuccess === null,
    );
    addFinding(
      findings,
      unresolved.length ? "high" : "medium",
      "history",
      unresolved.length ? "存在未確認處理完成的 Defender 偵測" : "近期曾有 Defender 偵測紀錄",
      `共 ${detections.length} 筆，需人工確認項目與處理結果。`,
    );
  }

  const dmaCandidates = (sections.devices || []).filter(
    (device) => device.dmaCandidate === true,
  );
  if (report.runtime?.isAdministrator !== true) {
    addFinding(findings, "medium", "collection", "未以系統管理員執行", "部分安全性與驅動資料可能不完整。");
  }
  const collectionErrors = report.collection?.errors || [];
  if (collectionErrors.length) {
    addFinding(findings, "low", "collection", "部分掃描項目未完成", `共 ${collectionErrors.length} 項。`);
  }

  const weights = { high: 25, medium: 10, low: 3 };
  const score = Math.min(
    100,
    findings.reduce((sum, item) => sum + weights[item.severity], 0),
  );
  const high = findings.filter((item) => item.severity === "high").length;
  const medium = findings.filter((item) => item.severity === "medium").length;
  const riskBand = riskBandOf(score);
  const plainLanguage = plainLanguageAnalysis({
    findings,
    states,
    dmaCandidateCount: dmaCandidates.length,
    unsignedDriverCount: unsignedDrivers.length,
    invalidDriverCount: invalidDrivers.length,
    defenderDetectionCount: detections.length,
    collectionErrorCount: collectionErrors.length,
    isAdministrator: report.runtime?.isAdministrator === true,
    score,
  });

  return {
    ok: true,
    analyzedAt: new Date().toISOString(),
    summary: {
      score,
      level: score >= 25 ? "high" : score >= 11 ? "review" : "low",
      riskBand,
      assessment: assessmentOf(findings, score),
      plainLanguage,
      high,
      medium,
      low: findings.filter((item) => item.severity === "low").length,
      dmaCandidateCount: dmaCandidates.length,
      unsignedDriverCount: unsignedDrivers.length,
      invalidDriverCount: invalidDrivers.length,
      defenderDetectionCount: detections.length,
      collectionErrorCount: collectionErrors.length,
      isAdministrator: report.runtime?.isAdministrator === true,
    },
    security: states,
    system: {
      computerName: sections.system?.computerName || "",
      osCaption: sections.system?.osCaption || "",
      osVersion: sections.system?.osVersion || "",
      biosManufacturer: sections.system?.biosManufacturer || "",
      biosVersion: sections.system?.biosVersion || "",
      baseboardManufacturer: sections.system?.baseboardManufacturer || "",
      baseboardProduct: sections.system?.baseboardProduct || "",
    },
    findings,
    disclaimer: "此結果只呈現環境風險與可驗證痕跡，不代表能證明曾經或正在使用外掛。",
  };
}

export function publicAuditRecord(row, includeRaw = false) {
  const refreshedAnalysis = row.report_data
    ? analyzeDeviceAudit(row.report_data)
    : null;
  const record = {
    id: row.id,
    organization: row.organization_code,
    reportId: row.report_id,
    applicantId: row.applicant_id,
    generatedAt: row.generated_at,
    uploadedAt: row.uploaded_at,
    deviceFingerprint: row.device_fingerprint,
    consentAccepted: row.consent_accepted,
    automaticUploadAccepted: row.automatic_upload_accepted,
    reportSha256: row.report_sha256,
    analysis: refreshedAnalysis?.ok ? refreshedAnalysis : row.analysis,
    reviewStatus: row.review_status,
    reviewNote: row.review_note,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
  };
  return includeRaw ? { ...record, report: row.report_data } : record;
}
