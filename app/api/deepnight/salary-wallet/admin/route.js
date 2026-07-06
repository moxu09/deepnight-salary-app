import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getAuthUserFromRequest,
  manuallyDepositSalaryWallet,
  settleSalaryWallet,
} from "@/lib/salaryWallet";

const DEEPNIGHT_GUILD_ID =
  process.env.NEXT_PUBLIC_DEEPNIGHT_GUILD_ID ||
  process.env.NEXT_PUBLIC_GUILD_ID ||
  "1501098191813214312";

const walletConfig = {
  appKey: "deepnight",
  orderTable: "play_orders",
  orderDateColumn: "order_finished_at",
  orderGuildFilter: `guild_id.eq.${DEEPNIGHT_GUILD_ID},guild_id.is.null`,
  orderSelect:
    "id, discord_id, staff_name, staff_salary, bonus_amount, service_name, service, order_no, order_id, order_finished_at, is_deleted, guild_id, wallet_settled_at",
  bonusTable: "players_bonus",
  bonusSelect:
    "id, discord_id, staff_name, bonus_type, description, amount, created_at, wallet_settled_at",
};
const SALARY_WALLET_START_DATE =
  process.env.SALARY_WALLET_START_DATE || "2026-07-17";
const SALARY_WALLET_START_ISO = new Date(
  `${SALARY_WALLET_START_DATE}T00:00:00+08:00`
).toISOString();

async function requireAdmin(request) {
  const { discordId } = await getAuthUserFromRequest(supabaseAdmin, request);

  const { data, error } = await supabaseAdmin
    .from("admins")
    .select("*")
    .eq("discord_id", discordId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) {
    throw new Error("你沒有後台管理權限");
  }

  return {
    discordId,
    admin: data,
  };
}

function isDeepnightTipOrder(order) {
  return [order.service_name, order.service]
    .filter(Boolean)
    .some((value) => String(value).includes("打賞"));
}

export async function GET(request) {
  try {
    await requireAdmin(request);
    await settleSalaryWallet(supabaseAdmin, walletConfig);

    const { data, error } = await supabaseAdmin
      .from("salary_withdraw_requests")
      .select("*")
      .eq("app_key", walletConfig.appKey)
      .gte("requested_at", SALARY_WALLET_START_ISO)
      .order("requested_at", { ascending: false });

    if (error) {
      console.error("[deepnight salary wallet admin] load requests failed", error);
      throw new Error("讀取提領申請失敗");
    }

    return NextResponse.json({
      ok: true,
      requests: data || [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error.message || "讀取提領申請失敗",
      },
      { status: 400 }
    );
  }
}

export async function POST(request) {
  try {
    const { discordId } = await requireAdmin(request);
    const body = await request.json();
    const action = String(body.action || "").trim();

    if (action === "deposit-wallet") {
      const result = await manuallyDepositSalaryWallet(
        supabaseAdmin,
        {
          ...walletConfig,
          isTipOrder: isDeepnightTipOrder,
        },
        {
          discordId: body.discordId,
          staffName: body.staffName,
          types: body.types,
          startDate: body.startDate,
          endDate: body.endDate,
          note: "後台手動新增",
          adminDiscordId: discordId,
        }
      );

      return NextResponse.json({
        ok: true,
        result,
      });
    }

    const id = String(body.id || "").trim();

    if (!id) {
      throw new Error("缺少申請 ID");
    }

    if (action !== "approve" && action !== "reject") {
      throw new Error("未知的審核動作");
    }

    const payload =
      action === "approve"
        ? {
            status: "approved",
            reject_reason: null,
            reviewed_by: discordId,
            reviewed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
        : {
            status: "rejected",
            reject_reason: String(body.reason || "").trim(),
            reviewed_by: discordId,
            reviewed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

    if (action === "reject" && !payload.reject_reason) {
      throw new Error("駁回需要填寫理由");
    }

    const { error } = await supabaseAdmin
      .from("salary_withdraw_requests")
      .update(payload)
      .eq("id", id)
      .eq("app_key", walletConfig.appKey)
      .eq("status", "pending");

    if (error) {
      console.error("[deepnight salary wallet admin] update request failed", error);
      throw new Error("更新提領申請失敗");
    }

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error.message || "更新提領申請失敗",
      },
      { status: 400 }
    );
  }
}
