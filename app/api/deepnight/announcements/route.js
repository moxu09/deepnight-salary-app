import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { authorizeErpRequest } from "@/lib/erpAccess";
import { getDiscordIdFromAuthUser } from "@/lib/salaryWallet";
import { addAdminSignatureStats, listEmployeeAnnouncements, parseAudience, sha256Buffer } from "@/lib/announcementSigning";
import { removeAdminFilePath, uploadAdminFile } from "@/lib/adminFileStorage";
import { sendAnnouncementDirectMessages } from "@/lib/discordAnnouncement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORG = "deepnight";

async function authenticate(request) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) throw new Error("請先登入");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new Error("登入已失效，請重新登入");
  const discordId = getDiscordIdFromAuthUser(data.user);
  if (!discordId) throw new Error("無法取得 Discord ID");
  return discordId;
}

async function requireAdmin(request) {
  const access = await authorizeErpRequest(supabaseAdmin, request, ORG, "canViewAllAdmin");
  return access.discordId;
}

function jsonError(error, fallback) {
  return NextResponse.json({ ok: false, message: error?.message || fallback }, { status: 400 });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const adminMode = url.searchParams.get("admin") === "1";
    const discordId = adminMode ? null : await authenticate(request);
    if (adminMode) await requireAdmin(request);

    if (!adminMode) return NextResponse.json({ ok: true, announcements: await listEmployeeAnnouncements(ORG, discordId) });
    const query = supabaseAdmin.from("salary_announcements").select("*").eq("organization_code", ORG).order("created_at", { ascending: false });
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ ok: true, announcements: adminMode ? await addAdminSignatureStats(ORG, data || []) : data || [] });
  } catch (error) {
    return jsonError(error, "讀取公告失敗");
  }
}

export async function POST(request) {
  try {
    const discordId = await requireAdmin(request);
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 27 * 1024 * 1024) throw new Error("上傳內容過大");
    const contentType = request.headers.get("content-type") || "";
    const multipart = contentType.includes("multipart/form-data");
    const body = multipart ? await request.formData() : await request.json().catch(() => ({}));
    const value = (key) => multipart ? body.get(key) : body[key];
    const title = String(value("title") || "").trim();
    const content = String(value("content") || "").trim();
    if (!title || !content) throw new Error("請填寫公告標題與內容");
    if (title.length > 120) throw new Error("公告標題不可超過 120 個字");
    if (content.length > 5000) throw new Error("公告內容不可超過 5,000 個字");
    const file = multipart ? body.get("file") : null;
    const requiresSignature = String(value("requiresSignature") || "") === "true" || value("requiresSignature") === true;
    if (requiresSignature && (!file || typeof file.arrayBuffer !== "function" || file.size <= 0)) throw new Error("要求簽署時必須上傳 PDF 文件");
    if (requiresSignature && file.type !== "application/pdf" && !String(file.name || "").toLowerCase().endsWith(".pdf")) throw new Error("簽署文件僅支援 PDF 格式");
    const audienceDiscordIds = parseAudience(value("audienceDiscordIds"));
    const signatureDeadline = String(value("signatureDeadline") || "").trim() || null;
    let attachmentPath = "";
    try {
      if (file && typeof file.arrayBuffer === "function" && file.size > 0) attachmentPath = await uploadAdminFile({ organization: ORG, category: "operations", file });
      const { data, error } = await supabaseAdmin.from("salary_announcements").insert({
        organization_code: ORG, title, content,
        is_active: String(value("isActive")) !== "false",
        created_by: discordId, updated_at: new Date().toISOString(),
        attachment_path: attachmentPath || null,
        attachment_name: attachmentPath ? String(file.name || "公告附件").slice(0, 180) : null,
        attachment_sha256: attachmentPath ? sha256Buffer(Buffer.from(await file.arrayBuffer())) : null,
        requires_signature: requiresSignature,
        audience_discord_ids: audienceDiscordIds,
        signature_deadline: signatureDeadline,
      }).select("*").single();
      if (error) throw error;
      let notification = null;
      if (data.is_active) {
        try {
          notification = await sendAnnouncementDirectMessages({
            supabaseAdmin,
            staffTable: "players",
            announcement: data,
            companyName: "深夜不關燈",
            siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "https://salary.wearestilllhere.com",
          });
        } catch (notifyError) {
          console.error("[深夜公告私訊失敗]", notifyError);
          notification = { targetCount: 0, sentCount: 0, failedCount: 0, failures: [], systemError: notifyError?.message || "公告私訊發送失敗" };
        }
      }
      return NextResponse.json({ ok: true, announcement: data, notification });
    } catch (error) {
      if (attachmentPath) await removeAdminFilePath(attachmentPath).catch(() => {});
      throw error;
    }
  } catch (error) {
    return jsonError(error, "新增公告失敗");
  }
}

export async function PATCH(request) {
  try {
    await requireAdmin(request);
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "").trim();
    const title = String(body.title || "").trim();
    const content = String(body.content || "").trim();
    if (!id || !title || !content) throw new Error("公告資料不完整");
    const audienceDiscordIds = parseAudience(body.audienceDiscordIds);
    const { data: existing } = await supabaseAdmin.from("salary_announcements").select("*").eq("id", id).eq("organization_code", ORG).maybeSingle();
    if (!existing) throw new Error("找不到公告");
    if (existing.requires_signature) {
      const { count } = await supabaseAdmin.from("salary_announcement_signatures").select("id", { count: "exact", head: true }).eq("announcement_id", id).eq("status", "signed");
      if (count && (title !== existing.title || content !== existing.content || JSON.stringify(audienceDiscordIds) !== JSON.stringify(existing.audience_discord_ids || []))) throw new Error("已有員工完成簽署，不能修改公告內容或簽署對象；請建立新版公告");
    }
    const { data, error } = await supabaseAdmin.from("salary_announcements").update({
      title,
      content,
      is_active: body.isActive !== false,
      audience_discord_ids: audienceDiscordIds,
      signature_deadline: String(body.signatureDeadline || "").trim() || null,
      updated_at: new Date().toISOString(),
    }).eq("id", id).eq("organization_code", ORG).select("*").single();
    if (error) throw error;
    return NextResponse.json({ ok: true, announcement: data });
  } catch (error) {
    return jsonError(error, "更新公告失敗");
  }
}

export async function DELETE(request) {
  try {
    await requireAdmin(request);
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "").trim();
    if (!id) throw new Error("缺少公告 ID");
    const { data, error } = await supabaseAdmin.from("salary_announcements").delete().eq("id", id).eq("organization_code", ORG).select("id,attachment_path").maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("找不到可刪除的公告，請重新整理後再試");
    if (data.attachment_path) await removeAdminFilePath(data.attachment_path).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error, "刪除公告失敗");
  }
}
