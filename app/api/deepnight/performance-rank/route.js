import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthUserFromRequest } from "@/lib/salaryWallet";
import {
  getTaipeiMonthInput,
  monthInputToTaipeiRange,
} from "@/lib/taipeiTime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GUILD_ID =
  process.env.NEXT_PUBLIC_DEEPNIGHT_GUILD_ID ||
  process.env.NEXT_PUBLIC_GUILD_ID ||
  "1501098191813214312";

function validMonth(value) {
  const text = String(value || "");
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(text)
    ? text
    : getTaipeiMonthInput();
}

function isRankedOrder(order) {
  if (order.is_deleted === true) return false;
  const status = String(order.status || "");
  if (status === "waiting_payment" || status === "accepted") return false;
  return (
    status === "completed" ||
    status === "已完成" ||
    status === "未發薪" ||
    status === "已發薪" ||
    Number(order.staff_salary || 0) > 0
  );
}

export async function GET(request) {
  try {
    const { discordId } = await getAuthUserFromRequest(supabaseAdmin, request);
    const month = validMonth(new URL(request.url).searchParams.get("month"));
    const { startIso, endIso } = monthInputToTaipeiRange(month);

    const [{ data: staff, error: staffError }, { data: orders, error: orderError }] =
      await Promise.all([
        supabaseAdmin
          .from("players")
          .select("discord_id")
          .eq("is_active", true),
        supabaseAdmin
          .from("play_orders")
          .select(
            "discord_id, order_amount, price, staff_salary, status, is_deleted",
          )
          .or(`guild_id.eq.${GUILD_ID},guild_id.is.null`)
          .or("is_deleted.eq.false,is_deleted.is.null")
          .gte("order_finished_at", startIso)
          .lte("order_finished_at", endIso),
      ]);

    if (staffError) throw staffError;
    if (orderError) throw orderError;

    const activeIds = new Set((staff || []).map((row) => row.discord_id));
    if (!activeIds.has(discordId)) {
      throw new Error("找不到已啟用的員工資料");
    }

    const totals = new Map(
      [...activeIds].map((activeDiscordId) => [activeDiscordId, 0]),
    );
    for (const order of orders || []) {
      if (!activeIds.has(order.discord_id) || !isRankedOrder(order)) continue;
      const amount = Number(order.order_amount ?? order.price ?? 0);
      totals.set(order.discord_id, (totals.get(order.discord_id) || 0) + amount);
    }

    const performanceAmount = totals.get(discordId) || 0;
    const higherAmounts = [...totals.values()].filter(
      (amount) => amount > performanceAmount,
    );
    const previousAmount =
      higherAmounts.length > 0 ? Math.min(...higherAmounts) : null;

    return NextResponse.json({
      ok: true,
      ranking: {
        month,
        rank: higherAmounts.length + 1,
        participantCount: totals.size,
        performanceAmount,
        gapToPrevious:
          previousAmount === null ? 0 : previousAmount - performanceAmount,
        isFirst: previousAmount === null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error?.message || "讀取業績排名失敗",
      },
      { status: 400 },
    );
  }
}
