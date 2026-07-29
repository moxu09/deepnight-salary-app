import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  createDeviceAuditChallenge,
  hashUploadToken,
} from "@/lib/deviceAudit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const uploadToken = String(body.uploadToken || "").trim();
    const applicantId = String(body.applicantId || "").trim();
    if (!uploadToken || !applicantId) {
      throw new Error("請提供上傳碼與申請帳號");
    }

    const tokenHash = hashUploadToken(uploadToken);
    const { data: tokenRow, error } = await supabaseAdmin
      .from("device_audit_upload_tokens")
      .select("applicant_id, expires_at, used_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (error) throw error;
    if (!tokenRow) throw new Error("上傳碼無效");
    if (tokenRow.used_at) throw new Error("此上傳碼已使用");
    if (new Date(tokenRow.expires_at).getTime() <= Date.now()) {
      throw new Error("上傳碼已過期，請向店長索取新的上傳碼");
    }
    if (String(tokenRow.applicant_id).trim() !== applicantId) {
      throw new Error("帳號與上傳碼指定帳號不一致");
    }

    const remainingMs = Math.max(
      1,
      new Date(tokenRow.expires_at).getTime() - Date.now(),
    );
    const challenge = createDeviceAuditChallenge({
      tokenHash,
      applicantId,
      expiresInMs: Math.min(2 * 60 * 60 * 1000, remainingMs),
    });
    return NextResponse.json({
      ok: true,
      ...challenge,
      notice: "挑戰碼只適用於本次帳號與一次性上傳碼。",
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error?.message || "建立掃描挑戰碼失敗" },
      { status: 400 },
    );
  }
}
