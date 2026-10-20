import { NextResponse } from "next/server";
import { authorizeErpRequest, erpErrorResponse } from "@/lib/erpAccess";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORGANIZATION = "deepnight";
const ADJUSTMENT_TABLE = "players_bonus";

export async function DELETE(request) {
  try {
    const actor = await authorizeErpRequest(
      supabaseAdmin,
      request,
      ORGANIZATION,
      "canViewAllAdmin"
    );
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "").trim();
    if (!id) throw new Error("缺少獎金或扣薪 ID");

    const { data: adjustment, error: readError } = await supabaseAdmin
      .from(ADJUSTMENT_TABLE)
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (readError) throw readError;
    if (!adjustment) {
      const error = new Error("找不到這筆獎金或扣薪，可能已被刪除");
      error.status = 404;
      throw error;
    }
    const { data: walletEntry, error: walletReadError } = await supabaseAdmin
      .from("salary_wallet_entries")
      .select("id")
      .eq("app_key", ORGANIZATION)
      .eq("source_table", ADJUSTMENT_TABLE)
      .eq("source_id", id)
      .eq("entry_type", "staff_bonus")
      .limit(1)
      .maybeSingle();
    if (walletReadError) throw walletReadError;

    if (adjustment.wallet_settled_at || walletEntry) {
      const error = new Error(
        "這筆獎金或扣薪已結算，來源與錢包明細必須保留"
      );
      error.status = 409;
      throw error;
    }

    const { error: deleteError, count: deletedCount } = await supabaseAdmin
      .from(ADJUSTMENT_TABLE)
      .delete({ count: "exact" })
      .eq("id", id)
      .is("wallet_settled_at", null);
    if (deleteError) throw deleteError;
    if (deletedCount !== 1) {
      const error = new Error(
        "刪除前資料已被結算或變更，已停止刪除"
      );
      error.status = 409;
      throw error;
    }

    return NextResponse.json({
      ok: true,
      deletedId: id,
      deletedBy: actor.discordId,
      walletEntriesRemoved: 0,
    });
  } catch (error) {
    console.error("[deepnight salary adjustments] delete failed", error);
    return erpErrorResponse(error, "刪除獎金或扣薪失敗");
  }
}
