import "server-only";

import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

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

function challengeSecret() {
  const secret =
    process.env.DEVICE_AUDIT_CHALLENGE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || secret.length < 32) {
    throw new Error("電腦稽核挑戰碼服務尚未完成安全設定");
  }
  return secret;
}

function signChallengePayload(encodedPayload) {
  return createHmac("sha256", challengeSecret())
    .update(encodedPayload, "utf8")
    .digest("base64url");
}

export function createDeviceAuditChallenge({
  tokenHash,
  applicantId,
  expiresInMs = 15 * 60 * 1000,
}) {
  const now = Date.now();
  const payload = {
    version: 1,
    tokenHash: String(tokenHash),
    applicantId: String(applicantId),
    nonce: randomBytes(24).toString("base64url"),
    issuedAt: now,
    expiresAt: now + expiresInMs,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  return {
    challenge: `${encoded}.${signChallengePayload(encoded)}`,
    expiresAt: new Date(payload.expiresAt).toISOString(),
  };
}

export function verifyDeviceAuditChallenge(
  challenge,
  { tokenHash, applicantId },
) {
  const [encoded, providedSignature, ...rest] = String(challenge || "").split(
    ".",
  );
  if (!encoded || !providedSignature || rest.length) {
    throw new Error("掃描報告缺少有效的伺服器挑戰碼");
  }
  const expectedSignature = signChallengePayload(encoded);
  const expected = Buffer.from(expectedSignature, "utf8");
  const provided = Buffer.from(providedSignature, "utf8");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    throw new Error("伺服器挑戰碼簽章驗證失敗");
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new Error("伺服器挑戰碼格式錯誤");
  }
  if (
    payload.version !== 1 ||
    payload.tokenHash !== String(tokenHash) ||
    payload.applicantId !== String(applicantId)
  ) {
    throw new Error("伺服器挑戰碼與本次帳號或上傳碼不符");
  }
  if (
    !Number.isFinite(payload.issuedAt) ||
    !Number.isFinite(payload.expiresAt) ||
    payload.issuedAt > Date.now() + 60_000 ||
    payload.expiresAt <= Date.now()
  ) {
    throw new Error("伺服器挑戰碼已過期，請重新執行掃描");
  }
  return payload;
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

const CE_INDICATOR =
  /cheat[\s._-]*engine|cheatengine|ceserver|speedhack|dbk(?:32|64)|vehdebug|kernelmoduleunloader/i;

function compactEvidence(values) {
  return [...new Set(values.filter(Boolean).map(String))].slice(0, 8);
}

function indicatorText(item = {}) {
  return [
    item.name,
    item.displayName,
    item.path,
    item.moduleName,
    item.processName,
    item.originalFileName,
    item.companyName,
    item.productName,
    item.command,
    ...(Array.isArray(item.actions) ? item.actions : []),
    item.fileName,
    item.image,
    item.parentImage,
    item.imageLoaded,
    item.sourceImage,
    item.targetImage,
    item.targetFilename,
    item.targetObject,
  ]
    .filter(Boolean)
    .join(" ");
}

function matchesCeIndicator(item = {}) {
  return CE_INDICATOR.test(indicatorText(item));
}

function isValorantImage(path = "") {
  return /valorant(?:-win64-shipping)?\.exe|riotclientservices\.exe/i.test(
    String(path),
  );
}

function hasInjectionCapableAccess(value = "") {
  const mask = Number.parseInt(String(value).trim().replace(/^0x/i, ""), 16);
  if (!Number.isFinite(mask)) return false;
  return Boolean(mask & 0x0002 || mask & 0x0008 || mask & 0x0020);
}

function isBcdEnabled(value = "") {
  return /^(yes|on|true|1|啟用|開啟)$/i.test(String(value).trim());
}

function isBroadDefenderExclusion(value = "") {
  return /^(?:[a-z]:\\?|\\)$|\\users(?:\\|$)|\\windows(?:\\|$)|\\programdata(?:\\|$)|\\temp(?:\\|$)|valorant|riot games/i.test(
    String(value).trim(),
  );
}

function persistenceText(item = {}) {
  return [item.type, item.name, item.target, item.value, item.executablePath, item.commandLineTemplate, item.scriptFileName]
    .filter(Boolean)
    .join(" ");
}

function eventTime(value) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function auditDeviceKey(device = {}) {
  return String(device.instanceId || device.deviceId || device.name || "").toLowerCase();
}

function auditDriverKey(driver = {}) {
  return String(driver.sha256 || driver.path || driver.name || "").toLowerCase();
}

function addFinding(findings, severity, category, title, detail, evidence = []) {
  findings.push({
    id: `${category}-${findings.length + 1}`,
    severity,
    category,
    title,
    detail,
    evidence: compactEvidence(evidence),
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

  if (hasTitle(/Cheat Engine|CE 相關/)) {
    return "發現 CE 相關可驗證跡象｜需要立即人工複查";
  }
  if (hasTitle(/開機完整性|核心除錯限制/)) {
    return "發現 Windows 核心信任限制被放寬｜請恢復設定後重新掃描";
  }
  if (hasTitle(/高風險程序注入|偵錯器劫持/)) {
    return "發現程序注入或啟動劫持設定｜需要立即人工複查";
  }
  if (hasTitle(/近期安裝未受信任的核心驅動/)) {
    return "發現近期未受信任核心驅動安裝｜需要立即人工複查";
  }
  if (hasTitle(/高風險 PE 區段/)) {
    return "發現未受信任且具有可寫可執行區段的程式｜需要立即人工複查";
  }
  if (hasTitle(/與 VALORANT 活動時間重疊/)) {
    return "可疑事件與遊戲活動時間重疊｜請優先核對事件來源";
  }
  if (hasTitle(/遠端執行緒|程序篡改/)) {
    return "發現指向遊戲程序的注入或篡改事件｜需要立即人工複查";
  }
  if (hasTitle(/可寫入遊戲程序的存取事件/)) {
    return "發現可修改遊戲程序的存取紀錄｜需要人工複查";
  }
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
  activeCeCount,
  historicalCeCount,
  injectionEventCount,
  accessEventCount,
  codeIntegrityEventCount,
  moduleScanIncomplete,
  sysmonAvailable,
  codeIntegrityAvailable,
  bootBypassCount,
  disabledDefenderLayerCount,
  broadDefenderExclusionCount,
  eventLogClearCount,
  recentDriverInstallCount,
  wmiConsumerCount,
  injectionRegistryCount,
  sysmonControlEventCount,
  peAnomalyCount,
  timelineOverlapCount,
  auditPolicyChangeCount,
  defenderProtectionChangeCount,
  score,
}) {
  const details = [
    `本次風險分數為 ${score} 分。這是掃描命中項目的加總，不是開掛機率，也不能單靠分數認定有使用外掛。`,
  ];
  const nextSteps = [];
  const highCount = findings.filter((finding) => finding.severity === "high").length;

  if (bootBypassCount > 0) {
    details.push(`發現 ${bootBypassCount} 項開機完整性／核心除錯限制被放寬，代表 Windows 對核心與驅動的信任檢查較弱。`);
    nextSteps.push("請關閉 Test Signing、No Integrity Checks 與 Kernel Debug，重新開機後再掃描。");
  } else {
    details.push("沒有讀到 Test Signing、略過完整性檢查或 Kernel Debug 已啟用的設定。");
  }

  if (disabledDefenderLayerCount > 0) {
    details.push(`Microsoft Defender 有 ${disabledDefenderLayerCount} 層防護未啟用；若使用第三方防毒仍需人工確認其當下是否有效。`);
    nextSteps.push("請確認 Windows 安全性或第三方防毒的即時防護正在運作。");
  }
  if (broadDefenderExclusionCount > 0) {
    details.push(`Defender 有 ${broadDefenderExclusionCount} 個範圍過大或涉及 Riot／VALORANT 的排除項。`);
    nextSteps.push("請核對 Defender 排除項用途，移除不必要的遊戲、根目錄、Temp 或使用者目錄排除後再掃描。");
  }

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

  if (activeCeCount > 0) {
    details.push(`目前程序、載入模組、服務或驅動中共有 ${activeCeCount} 筆 CE 相關可驗證跡象。`);
    nextSteps.push("請逐筆核對 CE 相關項目的路徑、SHA-256、簽章、啟動時間及受影響程序。");
  } else {
    details.push("本次即時程序、載入模組、服務與驅動中未比對到公開且明確的 CE 元件名稱。");
  }
  if (historicalCeCount > 0) {
    details.push(`近期 Prefetch、啟動項或排程中共有 ${historicalCeCount} 筆 CE 相關歷史跡象；只能證明曾留下相關名稱，不能單獨證明本次遊戲期間使用。`);
    nextSteps.push("請核對 CE 歷史跡象的最後執行時間是否與考核或接單時間重疊。");
  }
  if (injectionEventCount > 0) {
    details.push(`Sysmon 記錄到 ${injectionEventCount} 筆指向 VALORANT 的遠端執行緒或程序篡改事件，屬於需要立即人工複查的強烈風險跡象。`);
    nextSteps.push("請暫緩審核，核對 Sysmon 事件的來源程式、數位簽章、SHA-256 與發生時間。");
  } else if (accessEventCount > 0) {
    details.push(`Sysmon 記錄到 ${accessEventCount} 筆可建立執行緒、配置或寫入 VALORANT 記憶體的程序存取；防毒與診斷工具也可能產生，需要逐筆確認。`);
    nextSteps.push("請確認程序存取來源是否為 Riot、Microsoft 或已知可信安全軟體。");
  } else if (!sysmonAvailable) {
    details.push("此電腦未提供 Sysmon 紀錄，因此無法回溯程序存取、遠端執行緒與程序篡改事件；這不代表相關事件一定沒有發生。");
  }
  if (codeIntegrityEventCount > 0) {
    details.push(`Windows Code Integrity 有 ${codeIntegrityEventCount} 筆核心驅動載入或簽章警告。`);
    nextSteps.push("請核對 Code Integrity 事件中的 SYS 檔案、發布者與簽章狀態。");
  } else if (!codeIntegrityAvailable) {
    details.push("Windows Code Integrity 事件記錄無法使用，因此本次沒有這一層歷史資料。");
  }
  if (eventLogClearCount > 0) {
    details.push(`近期有 ${eventLogClearCount} 筆 Windows 事件紀錄清除事件，因此清除前的歷史可能無法追查。`);
    nextSteps.push("請核對事件紀錄清除的時間、帳號與維護原因。");
  }
  if (recentDriverInstallCount > 0) {
    details.push(`近期有 ${recentDriverInstallCount} 筆未受信任核心驅動服務安裝紀錄。`);
    nextSteps.push("請逐一確認新安裝驅動的檔名、簽章、SHA-256、發布者與用途。");
  }
  if (wmiConsumerCount > 0) {
    details.push(`電腦中有 ${wmiConsumerCount} 個 WMI 永久事件消費者，可在背景觸發程式；可能是企業管理，也可能是常駐機制。`);
    nextSteps.push("請核對 WMI 消費者執行命令與建立來源。");
  }
  if (injectionRegistryCount > 0) {
    details.push(`找到 ${injectionRegistryCount} 筆 AppInit／AppCert／IFEO／SilentProcessExit 設定，這些設定能改變程序啟動或 DLL 載入。`);
    nextSteps.push("請核對所有注入或偵錯器劫持登錄設定，尤其是指向遊戲或使用者可寫入路徑者。");
  }
  if (sysmonControlEventCount > 0) {
    details.push(`Sysmon 有 ${sysmonControlEventCount} 筆停止或設定變更事件，部分期間的監控涵蓋可能不完整。`);
    nextSteps.push("請核對 Sysmon 停止／設定變更時間是否與考核或接單期間重疊。");
  }
  if (peAnomalyCount > 0) {
    details.push(`近期可執行檔中有 ${peAnomalyCount} 個具有高熵或可寫可執行 PE 區段，需要核對是否為正常封裝程式。`);
    nextSteps.push("請核對 PE 異常檔案的數位簽章、SHA-256、來源及建立時間。");
  }
  if (timelineOverlapCount > 0) {
    details.push(`有 ${timelineOverlapCount} 筆可疑事件落在 VALORANT 活動前後兩小時內，已提高人工複查優先度。`);
    nextSteps.push("請將事件時間與實際考核／接單時段交叉比對。");
  }
  if (auditPolicyChangeCount > 0) {
    details.push(`近期有 ${auditPolicyChangeCount} 筆 Windows 稽核原則變更，可能影響歷史紀錄完整性。`);
  }
  if (defenderProtectionChangeCount > 0) {
    details.push(`Defender 有 ${defenderProtectionChangeCount} 筆防護停用或設定變更事件。`);
  }
  if (moduleScanIncomplete) {
    details.push("本次有部分程序模組無法列舉或超過安全上限，因此即時模組資料不是百分之百完整。");
    nextSteps.push("請確認以系統管理員執行；若仍不完整，需使用專業鑑識工具進一步查驗。");
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
  if (!new Set(["1.0", "1.1", "1.2", "1.3"]).has(report?.schemaVersion)) {
    errors.push("不支援的報告版本");
  }
  if (
    report?.schemaVersion !== "1.0" &&
    !String(report?.attestation?.challenge || "").trim()
  ) {
    errors.push("新版報告缺少伺服器挑戰碼");
  }
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

export function analyzeDeviceAudit(report, baselineReport = null) {
  const errors = validateDeviceAuditReport(report);
  if (errors.length) return { ok: false, errors };

  const findings = [];
  let baseline = null;
  const sections = report.sections || {};
  const security = sections.security || {};
  const states = {
    secureBoot: stateOf(security.secureBoot),
    tpm: stateOf(security.tpm),
    vbs: stateOf(security.vbs),
    memoryIntegrity: stateOf(security.memoryIntegrity),
    kernelDmaProtection: stateOf(security.kernelDmaProtection),
    dmaRemapping: stateOf(security.dmaRemapping),
    vulnerableDriverBlocklist: stateOf(security.vulnerableDriverBlocklist),
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
  if (states.vulnerableDriverBlocklist === "disabled") {
    addFinding(
      findings,
      "medium",
      "platform",
      "Microsoft 易受攻擊驅動程式封鎖清單已關閉",
      "Windows 明確關閉已知易受攻擊驅動程式封鎖清單；這不是外掛證據，但會降低核心防護。",
    );
  }

  const bootIntegrity = sections.bootIntegrity || {};
  const bootBypasses = [
    ["Test Signing", bootIntegrity.testSigning],
    ["No Integrity Checks", bootIntegrity.noIntegrityChecks],
    ["Kernel Debug", bootIntegrity.kernelDebug],
  ].filter(([, value]) => isBcdEnabled(value));
  if (bootBypasses.length) {
    addFinding(
      findings,
      "high",
      "platform",
      "Windows 開機完整性或核心除錯限制已放寬",
      "測試簽章、略過完整性檢查或核心除錯已啟用；請恢復正常設定後重新掃描。",
      bootBypasses.map(([name, value]) => `${name}: ${value}`),
    );
  }

  const defenderSecurity = sections.defenderSecurity || {};
  const defenderStatus = defenderSecurity.status || {};
  const defenderPreferences = defenderSecurity.preferences || {};
  const disabledDefenderLayers = [
    ["Antivirus", defenderStatus.antivirusEnabled === false],
    ["Real-time protection", defenderStatus.realTimeProtectionEnabled === false],
    ["Behavior monitor", defenderStatus.behaviorMonitorEnabled === false],
    ["IOAV", defenderStatus.ioavProtectionEnabled === false],
    ["Script scanning", defenderPreferences.disableScriptScanning === true],
  ].filter(([, disabled]) => disabled);
  if (defenderSecurity.available === true && disabledDefenderLayers.length) {
    addFinding(
      findings,
      "medium",
      "defender",
      "Microsoft Defender 部分防護未啟用",
      "可能來自第三方防毒或管理政策，不能單獨視為外掛；需確認掃描時是否有其他有效防護。",
      disabledDefenderLayers.map(([name]) => name),
    );
  }
  const broadDefenderExclusions = [
    ...(defenderSecurity.exclusions?.paths || []),
    ...(defenderSecurity.exclusions?.processes || []),
    ...(defenderSecurity.exclusions?.extensions || []),
  ].filter(isBroadDefenderExclusion);
  if (broadDefenderExclusions.length) {
    addFinding(
      findings,
      "medium",
      "defender",
      "Defender 存在範圍過大或涉及遊戲的排除項",
      "排除項可能有正當用途，但會使指定範圍不受一般即時掃描，需要本人說明。",
      broadDefenderExclusions,
    );
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

  const activeCeProcesses = (sections.processes || []).filter(matchesCeIndicator);
  const activeCeModules = (sections.loadedModules?.items || []).filter(matchesCeIndicator);
  const activeCeDrivers = runningDrivers.filter(matchesCeIndicator);
  const activeCeServices = (sections.services || []).filter(
    (service) =>
      String(service.state || "").toLowerCase() === "running" &&
      matchesCeIndicator(service),
  );
  const activeCeEvidence = [
    ...activeCeProcesses.map((item) => `程序：${item.name} · ${item.path || "路徑不明"}`),
    ...activeCeModules.map((item) => `模組：${item.processName || item.processId} ← ${item.moduleName || item.path}`),
    ...activeCeDrivers.map((item) => `驅動：${item.name} · ${item.path || "路徑不明"}`),
    ...activeCeServices.map((item) => `服務：${item.name} · ${item.path || "路徑不明"}`),
  ];
  if (activeCeEvidence.length) {
    addFinding(
      findings,
      "high",
      "injection",
      "發現執行中的 Cheat Engine／CE 相關元件",
      "目前程序、載入模組、服務或驅動中出現 CE 相關可驗證名稱；必須核對檔案雜湊、時間與用途。",
      activeCeEvidence,
    );
  }

  const historicalCeEvidence = [
    ...(sections.prefetch || []).filter(matchesCeIndicator).map((item) => `Prefetch：${item.fileName} · ${item.lastWriteTime || "時間不明"}`),
    ...(sections.startupItems || []).filter(matchesCeIndicator).map((item) => `啟動項：${item.name} · ${item.command || "內容不明"}`),
    ...(sections.scheduledTasks || []).filter(matchesCeIndicator).map((item) => `排程：${item.path || ""}${item.name || ""} · ${(item.actions || []).join(" ")}`),
    ...(sections.executionHistory?.bam || []).filter(matchesCeIndicator).map((item) => `BAM：${item.path || "路徑不明"} · ${item.executedAt || "時間不明"}`),
    ...(sections.executionHistory?.userAssist || []).filter(matchesCeIndicator).map((item) => `UserAssist：${item.path || "路徑不明"} · ${item.executedAt || "時間不明"}`),
    ...(sections.executionHistory?.compatibilityAssistant || []).filter(matchesCeIndicator).map((item) => `相容性歷史：${item.path || "路徑不明"}`),
    ...(sections.installedPrograms || []).filter(matchesCeIndicator).map((item) => `安裝紀錄：${item.displayName || "名稱不明"} · ${item.displayVersion || "版本不明"}`),
    ...(sections.recentExecutables || []).filter(matchesCeIndicator).map((item) => `近期檔案：${item.path || item.originalFileName || "路徑不明"} · ${item.sha256 || "無雜湊"}`),
  ];
  if (historicalCeEvidence.length) {
    addFinding(
      findings,
      "medium",
      "history",
      "發現近期 CE 相關執行或自動啟動痕跡",
      "Prefetch、啟動項或排程中出現 CE 相關名稱；不代表本次遊戲期間一定使用。",
      historicalCeEvidence,
    );
  }

  const recentPeAnomalies = (sections.recentExecutables || []).filter(
    (item) =>
      item.pe?.isPe === true &&
      (item.pe?.hasWritableExecutableSection === true || Number(item.pe?.maximumSectionEntropy) >= 7.2),
  );
  if (recentPeAnomalies.length) {
    const strongPeAnomalies = recentPeAnomalies.filter(
      (item) => item.pe?.hasWritableExecutableSection === true &&
        (isUnsigned(item.signatureStatus) || isBadSignature(item.signatureStatus)),
    );
    addFinding(
      findings,
      strongPeAnomalies.length ? "high" : "medium",
      "executable",
      strongPeAnomalies.length ? "近期可執行檔具有高風險 PE 區段結構" : "近期可執行檔具有需確認的封裝或 PE 區段特徵",
      "高熵可能來自壓縮或封裝，可寫且可執行區段也可能有正當用途；需核對簽章、SHA-256 與來源。",
      (strongPeAnomalies.length ? strongPeAnomalies : recentPeAnomalies).map((item) => `${item.path || item.originalFileName || "路徑不明"} · entropy ${item.pe?.maximumSectionEntropy ?? "不明"} · WX ${item.pe?.hasWritableExecutableSection === true ? "yes" : "no"}`),
    );
  }

  const sysmonEvents = sections.sysmonInjectionEvents?.events || [];
  const sysmonCeEvents = sysmonEvents.filter(matchesCeIndicator);
  if (sysmonCeEvents.length) {
    addFinding(
      findings,
      sysmonCeEvents.some(
        (event) =>
          event.id === 6 ||
          (event.id === 7 && isValorantImage(event.image)),
      )
        ? "high"
        : "medium",
      "history",
      "Sysmon 留下 CE 相關程序、模組或驅動事件",
      "事件紀錄保留了 CE 相關公開元件名稱；需核對事件類型、來源、目標與時間。",
      sysmonCeEvents.map(
        (event) =>
          `${event.timeCreated || "時間不明"} · Event ${event.id} · ${indicatorText(event)}`,
      ),
    );
  }
  const remoteThreadEvents = sysmonEvents.filter(
    (event) => event.id === 8 && isValorantImage(event.targetImage),
  );
  const tamperEvents = sysmonEvents.filter(
    (event) => event.id === 25 && isValorantImage(event.targetImage),
  );
  const injectionEvents = [...remoteThreadEvents, ...tamperEvents];
  if (injectionEvents.length) {
    addFinding(
      findings,
      "high",
      "injection",
      "發現指向 VALORANT 的遠端執行緒或程序篡改事件",
      "Sysmon 留下與注入技術相符的事件，必須核對來源程式、簽章、SHA-256 與發生時間。",
      injectionEvents.map((event) => `${event.timeCreated || "時間不明"} · ${event.sourceImage || "來源不明"} → ${event.targetImage || "目標不明"} · Event ${event.id} · 來源簽章 ${event.sourceSignatureStatus || "無法確認"}`),
    );
  }
  const accessEvents = sysmonEvents.filter(
    (event) =>
      event.id === 10 &&
      isValorantImage(event.targetImage) &&
      hasInjectionCapableAccess(event.grantedAccess),
  );
  if (accessEvents.length) {
    addFinding(
      findings,
      "medium",
      "injection",
      "發現可寫入遊戲程序的存取事件",
      "其他程序曾取得可建立執行緒、配置或寫入記憶體的權限；防毒與診斷工具也可能產生，需逐筆核對。",
      accessEvents.map((event) => `${event.timeCreated || "時間不明"} · ${event.sourceImage || "來源不明"} → ${event.targetImage || "目標不明"} · 權限 ${event.grantedAccess || "不明"}`),
    );
  }
  const valorantActivityEvents = sysmonEvents.filter(
    (event) => isValorantImage(event.image) || isValorantImage(event.targetImage) || isValorantImage(event.parentImage),
  );
  const suspiciousTimelineEvents = sysmonEvents.filter(
    (event) => matchesCeIndicator(event) || [8, 10, 25].includes(Number(event.id)),
  );
  const overlappingTimelineEvents = suspiciousTimelineEvents.filter((event) => {
    const suspiciousAt = eventTime(event.timeCreated);
    if (suspiciousAt === null) return false;
    return valorantActivityEvents.some((gameEvent) => {
      const gameAt = eventTime(gameEvent.timeCreated);
      return gameAt !== null && Math.abs(suspiciousAt - gameAt) <= 2 * 60 * 60 * 1000;
    });
  });
  if (overlappingTimelineEvents.length) {
    addFinding(
      findings,
      "medium",
      "timeline",
      "可疑事件與 VALORANT 活動時間重疊",
      "相關事件發生在遊戲活動前後兩小時內，需優先核對來源程式與實際遊戲時段。",
      overlappingTimelineEvents.map((event) => `${event.timeCreated || "時間不明"} · Event ${event.id} · ${indicatorText(event)}`),
    );
  }

  const codeIntegrityEvents = sections.codeIntegrityEvents?.events || [];
  const driverIntegrityEvents = codeIntegrityEvents.filter((event) =>
    /\.sys\b|driver|驅動/i.test(String(event.message || "")),
  );
  if (driverIntegrityEvents.length) {
    addFinding(
      findings,
      "medium",
      "driver",
      "Windows 曾阻擋或警告核心驅動完整性",
      "Code Integrity 近期留下驅動載入或簽章警告，需要核對涉及的驅動檔案。",
      driverIntegrityEvents.map((event) => `${event.timeCreated || "時間不明"} · Event ${event.id} · ${event.message || "無事件說明"}`),
    );
  }

  const logClearEvents = sections.eventLogClearEvents || [];
  if (logClearEvents.length) {
    addFinding(
      findings,
      "medium",
      "history",
      "近期曾清除 Windows 事件紀錄",
      "安全性或系統紀錄曾被清除，會降低歷史追查完整性；需核對清除時間與操作者。",
      logClearEvents.map((event) => `${event.timeCreated || "時間不明"} · ${event.logName || "事件紀錄"}`),
    );
  }
  const securityAuditEvents = sections.securityAuditEvents || [];
  const auditPolicyChanges = securityAuditEvents.filter((event) => Number(event.id) === 4719);
  if (auditPolicyChanges.length) {
    addFinding(
      findings,
      "medium",
      "collection",
      "近期曾變更 Windows 稽核原則",
      "稽核原則變更可能影響事件是否被記錄，需核對變更時間與帳號。",
      auditPolicyChanges.map((event) => `${event.timeCreated || "時間不明"} · ${event.subjectUserName || "帳號不明"}`),
    );
  }
  const securityIntegrityFailures = securityAuditEvents.filter((event) => [5038, 6281].includes(Number(event.id)));
  if (securityIntegrityFailures.length) {
    addFinding(
      findings,
      "medium",
      "platform",
      "Windows 安全性紀錄曾出現映像完整性失敗",
      "Windows 曾回報檔案或頁面雜湊驗證異常，需要核對事件內容。",
      securityIntegrityFailures.map((event) => `${event.timeCreated || "時間不明"} · Event ${event.id}`),
    );
  }
  const defenderOperational = sections.defenderOperationalEvents?.events || [];
  const defenderProtectionChanges = defenderOperational.filter((event) => [5001, 5004, 5007, 5010, 5012].includes(Number(event.id)));
  if (defenderProtectionChanges.length) {
    addFinding(
      findings,
      "medium",
      "defender",
      "Defender 近期曾停用防護或變更安全設定",
      "可能由管理政策、第三方防毒或本人操作造成，需核對時間與內容。",
      defenderProtectionChanges.map((event) => `${event.timeCreated || "時間不明"} · Event ${event.id} · ${event.message || "內容不明"}`),
    );
  }
  const asrBlockedEvents = defenderOperational.filter((event) => Number(event.id) === 1121);
  if (asrBlockedEvents.length) {
    addFinding(
      findings,
      "medium",
      "defender",
      "Defender ASR 近期曾封鎖可疑行為",
      "攻擊面縮減規則曾阻擋行為；不一定與遊戲外掛有關，需核對程序、路徑與時間。",
      asrBlockedEvents.map((event) => `${event.timeCreated || "時間不明"} · ${event.path || event.message || "內容不明"}`),
    );
  }

  const recentDriverInstalls = (sections.serviceInstallEvents || []).filter(
    (event) =>
      /kernel|file system|driver|核心|驅動/i.test(String(event.serviceType || "")) &&
      (isUnsigned(event.signatureStatus) || isBadSignature(event.signatureStatus)),
  );
  if (recentDriverInstalls.length) {
    addFinding(
      findings,
      "high",
      "driver",
      "近期安裝未受信任的核心驅動服務",
      "近期新增核心驅動服務，且簽章未能確認；需核對 SHA-256、檔案與安裝來源。",
      recentDriverInstalls.map((event) => `${event.timeCreated || "時間不明"} · ${event.serviceName || "服務不明"} · ${event.resolvedPath || event.imagePath || "路徑不明"}`),
    );
  }

  const wmiConsumers = sections.wmiPersistence?.consumers || [];
  if (wmiConsumers.length) {
    const suspiciousWmi = wmiConsumers.filter(
      (item) =>
        matchesCeIndicator(item) ||
        isUserWritablePath(persistenceText(item)) ||
        /powershell|cmd\.exe|rundll32|regsvr32|mshta|wscript|cscript/i.test(persistenceText(item)),
    );
    addFinding(
      findings,
      suspiciousWmi.length ? "high" : "medium",
      "persistence",
      suspiciousWmi.length ? "發現需立即複查的 WMI 常駐執行設定" : "發現 WMI 永久事件常駐設定",
      "WMI 永久事件訂閱可能是正常管理，也可能在背景啟動程式；需核對命令與來源。",
      (suspiciousWmi.length ? suspiciousWmi : wmiConsumers).map(persistenceText),
    );
  }

  const injectionRegistry = sections.injectionRegistry || [];
  if (injectionRegistry.length) {
    const strongRegistryIndicators = injectionRegistry.filter((item) => {
      const text = persistenceText(item);
      return matchesCeIndicator(item) || isUserWritablePath(text) ||
        (/(valorant|riotclient)/i.test(String(item.target || "")) && /IFEO|SilentProcessExit/i.test(String(item.type || "")));
    });
    addFinding(
      findings,
      strongRegistryIndicators.length ? "high" : "medium",
      "injection",
      strongRegistryIndicators.length ? "發現高風險程序注入或偵錯器劫持設定" : "發現程序注入或偵錯器劫持登錄設定",
      "AppInit、AppCert、IFEO Debugger 或 SilentProcessExit 會改變程序啟動與 DLL 載入，需要逐項核對。",
      (strongRegistryIndicators.length ? strongRegistryIndicators : injectionRegistry).map(persistenceText),
    );
  }

  const sysmonControlEvents = sysmonEvents.filter(
    (event) => event.id === 16 || (event.id === 4 && /stop|stopped|停止/i.test(String(event.state || ""))),
  );
  if (sysmonControlEvents.length) {
    addFinding(
      findings,
      "medium",
      "collection",
      "Sysmon 近期曾停止或變更設定",
      "監控停止或設定變更可能造成部分期間沒有注入歷史，需核對變更時間。",
      sysmonControlEvents.map((event) => `${event.timeCreated || "時間不明"} · Event ${event.id}`),
    );
  }

  const moduleScan = sections.loadedModules || {};
  const moduleScanIncomplete =
    moduleScan.truncated === true ||
    (Number(moduleScan.attemptedProcesses) > 0 &&
      Number(moduleScan.inaccessibleProcesses) /
        Number(moduleScan.attemptedProcesses) >
        0.4);
  if (moduleScanIncomplete) {
    addFinding(
      findings,
      "low",
      "collection",
      "部分程序模組無法完整檢查",
      moduleScan.truncated
        ? "模組數量超過安全上限，報告已截斷。"
        : "超過四成程序拒絕模組列舉，可能受權限或受保護程序影響。",
    );
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

  if (
    baselineReport &&
    validateDeviceAuditReport(baselineReport).length === 0 &&
    report.deviceFingerprint &&
    report.deviceFingerprint === baselineReport.deviceFingerprint
  ) {
    const baselineSections = baselineReport.sections || {};
    const previousDevices = new Set((baselineSections.devices || []).map(auditDeviceKey).filter(Boolean));
    const newDevices = (sections.devices || []).filter((device) => {
      const key = auditDeviceKey(device);
      return key && !previousDevices.has(key);
    });
    const newDmaDevices = newDevices.filter((device) => device.dmaCandidate === true);
    const previousDrivers = new Set((baselineSections.drivers || []).map(auditDriverKey).filter(Boolean));
    const newRunningDrivers = runningDrivers.filter((driver) => {
      const key = auditDriverKey(driver);
      return key && !previousDrivers.has(key);
    });
    const newUntrustedDrivers = newRunningDrivers.filter(
      (driver) => isUnsigned(driver.signatureStatus) || isBadSignature(driver.signatureStatus),
    );
    const securityRegressions = [
      ["Secure Boot", stateOf(baselineSections.security?.secureBoot), states.secureBoot],
      ["記憶體完整性", stateOf(baselineSections.security?.memoryIntegrity), states.memoryIntegrity],
      ["VBS", stateOf(baselineSections.security?.vbs), states.vbs],
      ["Kernel DMA Protection", stateOf(baselineSections.security?.kernelDmaProtection), states.kernelDmaProtection],
      ["易受攻擊驅動封鎖清單", stateOf(baselineSections.security?.vulnerableDriverBlocklist), states.vulnerableDriverBlocklist],
    ].filter(([, before, current]) => before === "enabled" && current === "disabled");

    if (newDmaDevices.length) {
      addFinding(
        findings,
        "high",
        "baseline",
        "同一部電腦的歷次基準後新增 DMA 候選裝置",
        "與上一次成功報告相比出現新的 PCIe／Thunderbolt／USB4 候選裝置；不是 DMA 外掛定論，但必須人工核對。",
        newDmaDevices.map((device) => `${device.name || "未知裝置"} · ${device.instanceId || "ID 不明"}`),
      );
    }
    if (newUntrustedDrivers.length) {
      addFinding(
        findings,
        "high",
        "baseline",
        "歷次基準後新增未受信任的執行中驅動",
        "與上次報告相比新增執行中的未簽章或簽章異常驅動。",
        newUntrustedDrivers.map((driver) => `${driver.name || "驅動不明"} · ${driver.path || "路徑不明"}`),
      );
    }
    if (securityRegressions.length) {
      addFinding(
        findings,
        "medium",
        "baseline",
        "歷次基準後有安全防護由啟用變成關閉",
        "同一部電腦先前已啟用的防護目前明確關閉，需要確認變更原因。",
        securityRegressions.map(([name, before, current]) => `${name}: ${before} → ${current}`),
      );
    }
    baseline = {
      compared: true,
      reportId: baselineReport.reportId,
      generatedAt: baselineReport.generatedAt,
      newDeviceCount: newDevices.length,
      newDmaDeviceCount: newDmaDevices.length,
      newRunningDriverCount: newRunningDrivers.length,
      newUntrustedDriverCount: newUntrustedDrivers.length,
      securityRegressionCount: securityRegressions.length,
    };
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
    activeCeCount: activeCeEvidence.length,
    historicalCeCount: historicalCeEvidence.length,
    injectionEventCount: injectionEvents.length,
    accessEventCount: accessEvents.length,
    codeIntegrityEventCount: driverIntegrityEvents.length,
    moduleScanIncomplete,
    sysmonAvailable: sections.sysmonInjectionEvents?.available === true,
    codeIntegrityAvailable: sections.codeIntegrityEvents?.available === true,
    bootBypassCount: bootBypasses.length,
    disabledDefenderLayerCount: disabledDefenderLayers.length,
    broadDefenderExclusionCount: broadDefenderExclusions.length,
    eventLogClearCount: logClearEvents.length,
    recentDriverInstallCount: recentDriverInstalls.length,
    wmiConsumerCount: wmiConsumers.length,
    injectionRegistryCount: injectionRegistry.length,
    sysmonControlEventCount: sysmonControlEvents.length,
    peAnomalyCount: recentPeAnomalies.length,
    timelineOverlapCount: overlappingTimelineEvents.length,
    auditPolicyChangeCount: auditPolicyChanges.length,
    defenderProtectionChangeCount: defenderProtectionChanges.length,
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
      activeCeCount: activeCeEvidence.length,
      historicalCeCount: historicalCeEvidence.length,
      injectionEventCount: injectionEvents.length,
      accessEventCount: accessEvents.length,
      codeIntegrityEventCount: driverIntegrityEvents.length,
      moduleScanIncomplete,
      sysmonAvailable: sections.sysmonInjectionEvents?.available === true,
      codeIntegrityAvailable: sections.codeIntegrityEvents?.available === true,
      bootBypassCount: bootBypasses.length,
      disabledDefenderLayerCount: disabledDefenderLayers.length,
      broadDefenderExclusionCount: broadDefenderExclusions.length,
      eventLogClearCount: logClearEvents.length,
      recentDriverInstallCount: recentDriverInstalls.length,
      wmiConsumerCount: wmiConsumers.length,
      injectionRegistryCount: injectionRegistry.length,
      sysmonControlEventCount: sysmonControlEvents.length,
      peAnomalyCount: recentPeAnomalies.length,
      timelineOverlapCount: overlappingTimelineEvents.length,
      auditPolicyChangeCount: auditPolicyChanges.length,
      defenderProtectionChangeCount: defenderProtectionChanges.length,
      securityTimelineCount: sections.securityTimeline?.length || 0,
      loadedModuleCount: sections.loadedModules?.items?.length || 0,
      moduleAttemptedProcesses: Number(sections.loadedModules?.attemptedProcesses) || 0,
      moduleInaccessibleProcesses: Number(sections.loadedModules?.inaccessibleProcesses) || 0,
      serverAttested:
        report.schemaVersion !== "1.0" &&
        Boolean(String(report.attestation?.challenge || "").trim()),
      collectorVersion: String(report.attestation?.collectorVersion || ""),
      ruleSetVersion: String(report.attestation?.ruleSetVersion || ""),
      bamHistoryCount: sections.executionHistory?.bam?.length || 0,
      userAssistHistoryCount: sections.executionHistory?.userAssist?.length || 0,
      compatibilityHistoryCount:
        sections.executionHistory?.compatibilityAssistant?.length || 0,
      recentExecutableCount: sections.recentExecutables?.length || 0,
      baselineCompared: baseline?.compared === true,
      baselineNewDeviceCount: baseline?.newDeviceCount || 0,
      baselineNewDmaDeviceCount: baseline?.newDmaDeviceCount || 0,
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
      hardware: sections.system?.hardware || null,
    },
    findings,
    baseline,
    timelinePreview: (sections.securityTimeline || []).slice(0, 50).map((event) => ({
      timeCreated: event.timeCreated,
      source: event.source,
      eventId: event.eventId,
      category: event.category,
      subject: event.subject,
      target: event.target,
      detail: event.detail,
    })),
    disclaimer: "此結果只呈現環境風險與可驗證痕跡，不代表能證明曾經或正在使用外掛。",
  };
}

export function publicAuditRecord(row, includeRaw = false) {
  const refreshedAnalysis = row.report_data
    ? analyzeDeviceAudit(row.report_data)
    : null;
  const displayAnalysis = row.analysis?.baseline?.compared
    ? row.analysis
    : refreshedAnalysis?.ok
      ? refreshedAnalysis
      : row.analysis;
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
    analysis: displayAnalysis,
    reviewStatus: row.review_status,
    reviewNote: row.review_note,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
  };
  return includeRaw ? { ...record, report: row.report_data } : record;
}
