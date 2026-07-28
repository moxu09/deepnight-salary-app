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
    addFinding(findings, "high", "dma", "Kernel DMA Protection 未啟用", "Windows 核心 DMA 防護目前未啟用。");
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

  return {
    ok: true,
    analyzedAt: new Date().toISOString(),
    summary: {
      score,
      level: high > 0 || score >= 50 ? "high" : score >= 20 ? "review" : "low",
      high,
      medium: findings.filter((item) => item.severity === "medium").length,
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
    analysis: row.analysis,
    reviewStatus: row.review_status,
    reviewNote: row.review_note,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
  };
  return includeRaw ? { ...record, report: row.report_data } : record;
}
