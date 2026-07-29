import path from "node:path";
import PDFDocument from "pdfkit";

const regularFont = path.join(
  process.cwd(),
  "node_modules/@fontsource/noto-sans-tc/files/noto-sans-tc-chinese-traditional-400-normal.woff",
);
const boldFont = path.join(
  process.cwd(),
  "node_modules/@fontsource/noto-sans-tc/files/noto-sans-tc-chinese-traditional-700-normal.woff",
);

const PAGE_MARGIN = 42;
const CONTENT_WIDTH = 511;

function safeText(value, fallback = "-") {
  const text = String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[：]/g, ": ")
    .replace(/[｜]/g, " / ")
    .replace(/[／]/g, "/")
    .replace(/[；]/g, "; ")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/[→]/g, " -> ")
    .replace(/[–—‑]/g, "-")
    .trim();
  return text || fallback;
}

function taipeiDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return safeText(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}/${part("month")}/${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
}

function stateLabel(value) {
  if (value === "enabled") return "已啟用";
  if (value === "disabled") return "未啟用";
  if (value === "unsupported") return "不支援";
  return "無法確認";
}

function severityLabel(value) {
  if (value === "high") return "高風險";
  if (value === "medium") return "需確認";
  return "資訊";
}

function severityColor(value) {
  if (value === "high") return "#be123c";
  if (value === "medium") return "#b45309";
  return "#287fb2";
}

function companyName(organization) {
  return organization === "qiunai" ? "秋奈陪玩店" : "深夜不關燈";
}

function bytesLabel(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "容量無法確認";
  const gib = bytes / 1024 / 1024 / 1024;
  if (gib >= 1024) return `${(gib / 1024).toFixed(gib >= 10240 ? 0 : 2)} TB`;
  return `${gib.toFixed(gib >= 100 ? 0 : 1)} GB`;
}

function uniqueText(values) {
  return [...new Set(values.map((value) => safeText(value, "")).filter(Boolean))];
}

export async function createDeviceAuditPdf({
  organization,
  employeeName,
  applicantId,
  report,
  analysis,
  uploadedAt,
}) {
  const accent = organization === "qiunai" ? "#7c3aed" : "#287fb2";
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: PAGE_MARGIN, right: PAGE_MARGIN, bottom: 52, left: PAGE_MARGIN },
    bufferPages: true,
    info: {
      Title: `${employeeName} 電腦環境稽核報告`,
      Author: companyName(organization),
      Subject: "員工電腦環境風險稽核",
    },
  });
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const completed = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  doc.registerFont("Regular", regularFont);
  doc.registerFont("Bold", boldFont);

  function pageHeader(continued = false) {
    doc.rect(0, 0, doc.page.width, 74).fill(accent);
    doc.font("Bold").fontSize(19).fillColor("#ffffff");
    doc.text("電腦環境稽核報告", PAGE_MARGIN, 20, { width: 320 });
    doc.font("Regular").fontSize(8.5).fillColor("#e2e8f0");
    doc.text(
      continued ? `${companyName(organization)} - 續頁` : companyName(organization),
      PAGE_MARGIN,
      48,
      { width: 320 },
    );
    doc.y = 92;
  }

  function ensureSpace(height = 40) {
    if (doc.y + height <= doc.page.height - 58) return;
    doc.addPage();
    pageHeader(true);
  }

  function sectionTitle(title) {
    ensureSpace(34);
    doc.moveDown(0.35);
    doc.font("Bold").fontSize(12).fillColor(accent);
    doc.text(safeText(title), PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.35);
  }

  function paragraph(text, options = {}) {
    const value = safeText(text);
    const height = doc.heightOfString(value, {
      width: CONTENT_WIDTH,
      lineGap: 2,
      ...options,
    });
    ensureSpace(height + 12);
    doc.font(options.bold ? "Bold" : "Regular")
      .fontSize(options.size || 9)
      .fillColor(options.color || "#334155")
      .text(value, PAGE_MARGIN, doc.y, {
        width: CONTENT_WIDTH,
        lineGap: 2,
        ...options,
      });
    doc.moveDown(0.3);
  }

  function bullet(text, color = "#334155") {
    const value = safeText(text);
    const textWidth = CONTENT_WIDTH - 18;
    const height = doc.heightOfString(value, { width: textWidth, lineGap: 2 });
    ensureSpace(height + 10);
    const y = doc.y;
    doc.circle(PAGE_MARGIN + 3, y + 5, 2).fill(color);
    doc.font("Regular").fontSize(8.5).fillColor("#334155");
    doc.text(value, PAGE_MARGIN + 14, y, { width: textWidth, lineGap: 2 });
    doc.moveDown(0.3);
  }

  pageHeader(false);
  doc.roundedRect(PAGE_MARGIN, doc.y, CONTENT_WIDTH, 112, 12)
    .fillAndStroke("#f8fafc", "#dbe6ef");
  const infoY = doc.y + 15;
  doc.font("Bold").fontSize(14).fillColor("#1e293b");
  doc.text(safeText(employeeName), PAGE_MARGIN + 16, infoY, { width: 300 });
  doc.font("Regular").fontSize(8.5).fillColor("#64748b");
  doc.text(`帳號: ${safeText(applicantId)}`, PAGE_MARGIN + 16, infoY + 27, { width: 300 });
  doc.text(`掃描時間: ${taipeiDateTime(report.generatedAt)}`, PAGE_MARGIN + 16, infoY + 49, { width: 300 });
  doc.text(`上傳時間: ${taipeiDateTime(uploadedAt)}`, PAGE_MARGIN + 16, infoY + 70, { width: 300 });
  const score = Number(analysis.summary?.score || 0);
  const scoreColor = score >= 25 ? "#be123c" : score >= 11 ? "#b45309" : "#047857";
  doc.font("Bold").fontSize(10).fillColor("#64748b");
  doc.text("風險分數", PAGE_MARGIN + 354, infoY + 7, { width: 120, align: "center" });
  doc.font("Bold").fontSize(28).fillColor(scoreColor);
  doc.text(String(score), PAGE_MARGIN + 354, infoY + 31, { width: 120, align: "center" });
  doc.font("Regular").fontSize(8).fillColor("#64748b");
  doc.text("分數不是開掛機率", PAGE_MARGIN + 354, infoY + 70, { width: 120, align: "center" });
  doc.y = infoY + 112;

  sectionTitle("判讀結論");
  paragraph(analysis.summary?.assessment, { bold: true, size: 10, color: scoreColor });
  paragraph(analysis.disclaimer, { size: 8, color: "#64748b" });

  sectionTitle("系統與安全狀態");
  const systemRows = [
    ["電腦名稱", analysis.system?.computerName],
    ["作業系統", `${safeText(analysis.system?.osCaption)} ${safeText(analysis.system?.osVersion, "")}`],
    ["Secure Boot", stateLabel(analysis.security?.secureBoot)],
    ["TPM", stateLabel(analysis.security?.tpm)],
    ["VBS", stateLabel(analysis.security?.vbs)],
    ["記憶體完整性", stateLabel(analysis.security?.memoryIntegrity)],
    ["Kernel DMA Protection", stateLabel(analysis.security?.kernelDmaProtection)],
    ["DMA Remapping", stateLabel(analysis.security?.dmaRemapping)],
    ["易受攻擊驅動封鎖清單", stateLabel(analysis.security?.vulnerableDriverBlocklist)],
  ];
  for (const [label, value] of systemRows) {
    ensureSpace(22);
    const y = doc.y;
    doc.rect(PAGE_MARGIN, y, CONTENT_WIDTH, 21).fill("#f8fafc");
    doc.font("Bold").fontSize(8).fillColor("#64748b").text(label, PAGE_MARGIN + 8, y + 6, { width: 180 });
    doc.font("Regular").fontSize(8).fillColor("#1e293b").text(safeText(value), PAGE_MARGIN + 195, y + 6, { width: 300 });
    doc.y = y + 23;
  }

  const hardware = analysis.system?.hardware || report.sections?.system?.hardware;
  if (hardware) {
    sectionTitle("裝置配備");
    const cpuRows = uniqueText((hardware.processors || []).map((item) => {
      const specifications = [
        Number(item.cores) > 0 ? `${item.cores} 核心` : "",
        Number(item.logicalProcessors) > 0 ? `${item.logicalProcessors} 執行緒` : "",
        Number(item.maxClockMHz) > 0 ? `${item.maxClockMHz} MHz` : "",
      ].filter(Boolean).join(" / ");
      return `${safeText(item.name, "未知 CPU")}${specifications ? ` (${specifications})` : ""}`;
    }));
    const gpuRows = uniqueText((hardware.videoControllers || []).map((item) => {
      const details = [
        Number(item.adapterRamBytes) > 0 ? `VRAM ${bytesLabel(item.adapterRamBytes)}` : "",
        item.driverVersion ? `驅動 ${item.driverVersion}` : "",
        item.currentResolution ? `解析度 ${item.currentResolution}` : "",
      ].filter(Boolean).join(" / ");
      return `${safeText(item.name, "未知 GPU")}${details ? ` (${details})` : ""}`;
    }));
    const memoryModules = hardware.memory?.modules || [];
    const memoryDetail = memoryModules.map((item) => {
      const clock = Number(item.configuredClockMHz || item.speedMHz || 0);
      return `${bytesLabel(item.capacityBytes)}${clock > 0 ? ` ${clock} MHz` : ""}${item.manufacturer ? ` ${safeText(item.manufacturer)}` : ""}`;
    }).join(" + ");
    const diskRows = uniqueText((hardware.physicalDisks || []).map((item) => {
      const details = [bytesLabel(item.sizeBytes), item.interfaceType, item.mediaType].filter(Boolean).join(" / ");
      return `${safeText(item.model, "未知磁碟")}${details ? ` (${details})` : ""}`;
    }));
    const volumeRows = uniqueText((hardware.volumes || []).map((item) => {
      const usedBytes = Number(item.sizeBytes || 0) - Number(item.freeBytes || 0);
      const used = usedBytes >= 0 ? bytesLabel(usedBytes) : "無法確認";
      return `${safeText(item.drive, "磁碟區")} ${safeText(item.volumeName, "")} (${safeText(item.fileSystem)} / 總容量 ${bytesLabel(item.sizeBytes)} / 已使用 ${used} / 可用 ${bytesLabel(item.freeBytes)})`;
    }));
    const hardwareRows = [
      ["CPU", cpuRows.join("；") || "未取得"],
      ["GPU", gpuRows.join("；") || "未取得"],
      ["RAM", `${bytesLabel(hardware.memory?.totalBytes)}${memoryDetail ? ` (${memoryDetail})` : ""}`],
      ["實體磁碟 (ROM)", diskRows.join("；") || "未取得"],
      ["磁碟區容量", volumeRows.join("；") || "未取得"],
      ["主機板", `${safeText(analysis.system?.baseboardManufacturer, "")} ${safeText(analysis.system?.baseboardProduct, "")}`.trim() || "未取得"],
      ["BIOS", `${safeText(analysis.system?.biosManufacturer, "")} ${safeText(analysis.system?.biosVersion, "")}`.trim() || "未取得"],
    ];
    for (const [label, value] of hardwareRows) {
      paragraph(`${label}: ${value}`, { size: 8.5 });
    }
  }

  sectionTitle("白話分析");
  for (const detail of analysis.summary?.plainLanguage?.details || []) bullet(detail);

  sectionTitle("建議處理方式");
  for (const step of analysis.summary?.plainLanguage?.nextSteps || []) bullet(step, accent);

  sectionTitle(`風險項目（高風險 ${analysis.summary?.high || 0}／需確認 ${analysis.summary?.medium || 0}／資訊 ${analysis.summary?.low || 0}）`);
  if (!(analysis.findings || []).length) paragraph("未列出其他風險項目。", { color: "#047857" });
  for (const finding of analysis.findings || []) {
    ensureSpace(48);
    const color = severityColor(finding.severity);
    paragraph(`${severityLabel(finding.severity)}｜${safeText(finding.title)}`, { bold: true, size: 9.5, color });
    paragraph(finding.detail, { size: 8.5 });
    for (const evidence of finding.evidence || []) bullet(`證據：${evidence}`, color);
  }

  if (analysis.baseline?.compared) {
    sectionTitle("同一裝置歷史比較");
    paragraph(`比較基準：${taipeiDateTime(analysis.baseline.generatedAt)}（報告 ${safeText(analysis.baseline.reportId)}）`);
    bullet(`新增裝置：${analysis.baseline.newDeviceCount || 0}`);
    bullet(`新增 DMA 候選裝置：${analysis.baseline.newDmaDeviceCount || 0}`);
    bullet(`新增執行中驅動：${analysis.baseline.newRunningDriverCount || 0}`);
    bullet(`新增未受信任驅動：${analysis.baseline.newUntrustedDriverCount || 0}`);
    bullet(`安全防護退步：${analysis.baseline.securityRegressionCount || 0}`);
  }

  sectionTitle(`安全事件時間軸（最近 ${analysis.timelinePreview?.length || 0} 筆）`);
  if (!(analysis.timelinePreview || []).length) paragraph("本次沒有可顯示的安全事件時間軸。", { color: "#64748b" });
  for (const event of analysis.timelinePreview || []) {
    const line = [
      taipeiDateTime(event.timeCreated),
      safeText(event.source),
      `Event ${safeText(event.eventId)}`,
      safeText(event.category),
      safeText(event.subject, ""),
      safeText(event.target, ""),
      safeText(event.detail, ""),
    ].filter(Boolean).join("｜");
    bullet(line, "#64748b");
  }

  const pageRange = doc.bufferedPageRange();
  for (let index = 0; index < pageRange.count; index += 1) {
    doc.switchToPage(index);
    doc.page.margins.bottom = 0;
    doc.moveTo(PAGE_MARGIN, doc.page.height - 37)
      .lineTo(doc.page.width - PAGE_MARGIN, doc.page.height - 37)
      .strokeColor("#dbe6ef")
      .lineWidth(0.6)
      .stroke();
    doc.font("Regular").fontSize(7).fillColor("#94a3b8");
    doc.text(`報告 ID: ${safeText(report.reportId)}`, PAGE_MARGIN, doc.page.height - 27, { width: 340, height: 10, lineBreak: false });
    doc.text(`第 ${index + 1} / ${pageRange.count} 頁`, 430, doc.page.height - 27, { width: 123, height: 10, align: "right", lineBreak: false });
  }

  doc.end();
  return completed;
}
