import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  authorizeErpRequest,
  erpErrorResponse,
} from "@/lib/erpAccess";
import {
  createUploadToken,
  hashUploadToken,
  normalizeAuditOrganization,
} from "@/lib/deviceAudit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organization = normalizeAuditOrganization(body.organization);
    const applicantId = String(body.applicantId || "").trim();
    if (!applicantId || applicantId.length > 100) {
      throw new Error("請輸入申請編號或 Discord ID");
    }

    const actor = await authorizeErpRequest(
      supabaseAdmin,
      request,
      organization,
      "canCreateDeviceAuditTokens",
    );
    const token = createUploadToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabaseAdmin.from("device_audit_upload_tokens").insert({
      organization_code: organization,
      applicant_id: applicantId,
      token_hash: hashUploadToken(token),
      created_by: actor.discordId,
      expires_at: expiresAt,
    });
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      token,
      applicantId,
      organization,
      expiresAt,
      uploadEndpoint: `${new URL(request.url).origin}/api/device-audit/upload`,
      notice: "此為一次性上傳碼，24 小時後失效。請只交給本次受檢者。",
    });
  } catch (error) {
    return erpErrorResponse(error, "建立電腦稽核上傳碼失敗");
  }
}
