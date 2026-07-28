import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  authorizeErpRequest,
  erpErrorResponse,
  ERP_OWNER_DISCORD_ID,
} from "@/lib/erpAccess";
import {
  normalizeAuditOrganization,
  publicAuditRecord,
} from "@/lib/deviceAudit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organization = normalizeAuditOrganization(
      url.searchParams.get("organization"),
    );
    const actor = await authorizeErpRequest(
      supabaseAdmin,
      request,
      organization,
      "canViewDeviceAudits",
    );
    const reportId = String(url.searchParams.get("id") || "").trim();

    let query = supabaseAdmin
      .from("device_audit_reports")
      .select("*")
      .eq("organization_code", organization)
      .order("uploaded_at", { ascending: false });
    if (reportId) query = query.eq("id", reportId).limit(1);
    else query = query.limit(100);

    const { data, error } = await query;
    if (error) throw error;
    const includeRaw =
      actor.discordId === ERP_OWNER_DISCORD_ID && Boolean(reportId);
    const reports = (data || []).map((row) =>
      publicAuditRecord(row, includeRaw),
    );

    return NextResponse.json({
      ok: true,
      organization,
      reports,
      canViewRaw: actor.discordId === ERP_OWNER_DISCORD_ID,
    });
  } catch (error) {
    return erpErrorResponse(error, "讀取電腦稽核報告失敗");
  }
}
