import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthUserFromRequest } from "@/lib/salaryWallet";
import {
  erpErrorResponse,
  getErpAccessByDiscordId,
} from "@/lib/erpAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const auth = await getAuthUserFromRequest(supabaseAdmin, request);
    const access = await getErpAccessByDiscordId(
      supabaseAdmin,
      "qiunai",
      auth.discordId,
    );
    return NextResponse.json({ ok: true, access });
  } catch (error) {
    return erpErrorResponse(error);
  }
}
