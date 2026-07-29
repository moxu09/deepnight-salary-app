import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  analyzeDeviceAudit,
  hashUploadToken,
  sha256Buffer,
  validateDeviceAuditReport,
  verifyDeviceAuditChallenge,
} from "@/lib/deviceAudit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REPORT_BYTES = 15 * 1024 * 1024;

function cleanJsonText(buffer) {
  const text = buffer.toString("utf8");
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export async function POST(request) {
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_REPORT_BYTES * 1.5) {
      throw new Error("稽核報告超過允許大小");
    }
    const body = await request.json().catch(() => ({}));
    const uploadToken = String(body.uploadToken || "").trim();
    const reportBase64 = String(body.reportBase64 || "");
    const claimedHash = String(body.sha256 || "").trim().toLowerCase();
    const uploadChallenge = String(body.uploadChallenge || "").trim();
    if (
      !uploadToken ||
      !reportBase64 ||
      !/^[a-f0-9]{64}$/.test(claimedHash)
    ) {
      throw new Error("上傳資料不完整");
    }

    const reportBuffer = Buffer.from(reportBase64, "base64");
    if (!reportBuffer.length || reportBuffer.length > MAX_REPORT_BYTES) {
      throw new Error("稽核報告大小不正確");
    }
    const actualHash = sha256Buffer(reportBuffer);
    if (actualHash !== claimedHash) throw new Error("報告 SHA-256 校驗失敗");

    const report = JSON.parse(cleanJsonText(reportBuffer));
    const validationErrors = validateDeviceAuditReport(report);
    if (validationErrors.length) throw new Error(validationErrors.join("；"));

    const tokenHash = hashUploadToken(uploadToken);
    const { data: tokenRow, error: tokenError } = await supabaseAdmin
      .from("device_audit_upload_tokens")
      .select("*")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (tokenError) throw tokenError;
    if (!tokenRow) throw new Error("上傳碼無效");
    if (new Date(tokenRow.expires_at).getTime() <= Date.now()) {
      throw new Error("上傳碼已過期，請向店長索取新的上傳碼");
    }
    if (String(report.applicantId).trim() !== String(tokenRow.applicant_id).trim()) {
      throw new Error("報告帳號與上傳碼指定帳號不一致");
    }
    if (report.schemaVersion === "1.1") {
      verifyDeviceAuditChallenge(uploadChallenge, {
        tokenHash,
        applicantId: String(report.applicantId).trim(),
      });
      if (report.attestation?.challenge !== uploadChallenge) {
        throw new Error("報告內容與伺服器挑戰碼不一致");
      }
    }

    if (tokenRow.used_at) {
      if (tokenRow.used_report_id === report.reportId) {
        return NextResponse.json({
          ok: true,
          duplicate: true,
          reportId: report.reportId,
          message: "本次報告先前已成功上傳",
        });
      }
      throw new Error("此上傳碼已使用");
    }

    const analysis = analyzeDeviceAudit(report);
    if (!analysis.ok) throw new Error(analysis.errors.join("；"));
    const { data: saved, error: saveError } = await supabaseAdmin
      .from("device_audit_reports")
      .insert({
        organization_code: tokenRow.organization_code,
        report_id: report.reportId,
        applicant_id: report.applicantId,
        generated_at: report.generatedAt,
        device_fingerprint: report.deviceFingerprint || null,
        consent_accepted: report.consent.accepted === true,
        automatic_upload_accepted:
          report.consent.automaticUploadAccepted === true,
        report_sha256: actualHash,
        report_data: report,
        analysis,
        upload_token_id: tokenRow.id,
      })
      .select("id, organization_code, report_id, uploaded_at")
      .single();
    if (saveError) throw saveError;

    const { error: updateError } = await supabaseAdmin
      .from("device_audit_upload_tokens")
      .update({
        used_at: new Date().toISOString(),
        used_report_id: report.reportId,
      })
      .eq("id", tokenRow.id)
      .is("used_at", null);
    if (updateError) throw updateError;

    return NextResponse.json({
      ok: true,
      reportId: saved.report_id,
      organization: saved.organization_code,
      uploadedAt: saved.uploaded_at,
      message: "掃描報告已自動上傳 ERP",
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error?.message || "自動上傳失敗" },
      { status: 400 },
    );
  }
}
