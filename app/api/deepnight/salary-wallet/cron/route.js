import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { settleSalaryWallet } from "@/lib/salaryWallet";

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

function requireCronSecret(request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    throw new Error("缺少 CRON_SECRET");
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    throw new Error("無權限執行排程");
  }
}

async function runSettlement(request) {
  try {
    requireCronSecret(request);
    await settleSalaryWallet(supabaseAdmin, walletConfig);

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error.message || "薪資錢包排程結算失敗",
      },
      { status: 400 }
    );
  }
}

export async function GET(request) {
  return runSettlement(request);
}

export async function POST(request) {
  return runSettlement(request);
}
