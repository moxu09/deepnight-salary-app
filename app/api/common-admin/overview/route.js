import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  authorizeErpRequest,
  erpErrorResponse,
  ERP_OWNER_DISCORD_ID,
} from "@/lib/erpAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEEPNIGHT_GUILD_ID =
  process.env.NEXT_PUBLIC_DEEPNIGHT_GUILD_ID ||
  process.env.NEXT_PUBLIC_GUILD_ID ||
  "1501098191813214312";

function taipeiMonthRange() {
  const monthKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  const [year, month] = monthKey.split("-").map(Number);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  return {
    month: monthKey,
    start: new Date(`${monthKey}-01T00:00:00+08:00`).toISOString(),
    end: new Date(
      `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00+08:00`,
    ).toISOString(),
  };
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function summarize(activeStaff, orders, bonuses) {
  const bonusTotal = (bonuses || []).reduce(
    (sum, item) => sum + number(item.amount),
    0,
  );
  const orderSalary = (orders || []).reduce(
    (sum, item) => sum + number(item.staff_salary),
    0,
  );
  const orderBonus = (orders || []).reduce(
    (sum, item) => sum + number(item.bonus_amount),
    0,
  );

  return {
    activeStaff: number(activeStaff),
    orderCount: (orders || []).length,
    revenue: (orders || []).reduce(
      (sum, item) => sum + number(item.order_amount || item.price),
      0,
    ),
    salary: orderSalary,
    bonus: orderBonus + bonusTotal,
    unpaid:
      (orders || [])
        .filter((item) => item.status !== "已發薪")
        .reduce(
          (sum, item) =>
            sum + number(item.staff_salary) + number(item.bonus_amount),
          0,
        ) + bonusTotal,
  };
}

function merge(deepnight, qiunai) {
  return Object.fromEntries(
    Object.keys(deepnight).map((key) => [
      key,
      number(deepnight[key]) + number(qiunai[key]),
    ]),
  );
}

export async function GET(request) {
  try {
    const actor = await authorizeErpRequest(
      supabaseAdmin,
      request,
      "deepnight",
      "canViewAllAdmin",
    );
    if (actor.discordId !== ERP_OWNER_DISCORD_ID) {
      return NextResponse.json(
        { ok: false, message: "只有共同後台擁有者可查看跨部門資料" },
        { status: 403 },
      );
    }

    const range = taipeiMonthRange();
    const [
      deepnightStaff,
      qiunaiStaff,
      deepnightOrders,
      qiunaiOrders,
      deepnightBonuses,
      qiunaiBonuses,
    ] = await Promise.all([
      supabaseAdmin
        .from("players")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true),
      supabaseAdmin
        .from("qiunai_staff")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true),
      supabaseAdmin
        .from("play_orders")
        .select(
          "order_amount, price, staff_salary, bonus_amount, status, order_finished_at",
        )
        .or(`guild_id.eq.${DEEPNIGHT_GUILD_ID},guild_id.is.null`)
        .or("is_deleted.eq.false,is_deleted.is.null")
        .gte("order_finished_at", range.start)
        .lt("order_finished_at", range.end),
      supabaseAdmin
        .from("qiunai_salary_orders")
        .select(
          "order_amount, staff_salary, bonus_amount, status, order_finished_at",
        )
        .or("is_deleted.eq.false,is_deleted.is.null")
        .gte("order_finished_at", range.start)
        .lt("order_finished_at", range.end),
      supabaseAdmin
        .from("players_bonus")
        .select("amount, created_at")
        .gte("created_at", range.start)
        .lt("created_at", range.end),
      supabaseAdmin
        .from("qiunai_staff_bonus")
        .select("amount, created_at")
        .gte("created_at", range.start)
        .lt("created_at", range.end),
    ]);

    const results = [
      deepnightStaff,
      qiunaiStaff,
      deepnightOrders,
      qiunaiOrders,
      deepnightBonuses,
      qiunaiBonuses,
    ];
    const failed = results.find((result) => result.error);
    if (failed?.error) throw failed.error;

    const deepnight = summarize(
      deepnightStaff.count,
      deepnightOrders.data,
      deepnightBonuses.data,
    );
    const qiunai = summarize(
      qiunaiStaff.count,
      qiunaiOrders.data,
      qiunaiBonuses.data,
    );

    return NextResponse.json({
      ok: true,
      month: range.month,
      combined: merge(deepnight, qiunai),
      departments: { deepnight, qiunai },
    });
  } catch (error) {
    return erpErrorResponse(error, "讀取共同後台總覽失敗");
  }
}
