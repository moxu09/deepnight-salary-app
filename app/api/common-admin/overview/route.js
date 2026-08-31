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
const SALARY_WALLET_START_DATE =
  process.env.SALARY_WALLET_START_DATE || "2026-07-17";
const PAGE_SIZE = 1000;

async function loadAllPages(buildQuery) {
  const rows = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) return { data: rows, error };

    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return { data: rows, error: null };
  }
}

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

function summarize(activeStaff, orders, bonuses, settledStatus, unwithdrawn) {
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
        .filter(
          (item) =>
            !item.wallet_settled_at && item.status !== settledStatus,
        )
        .reduce(
          (sum, item) =>
            sum + number(item.staff_salary) + number(item.bonus_amount),
          0,
        ) +
      (bonuses || [])
        .filter((item) => !item.wallet_settled_at)
        .reduce((sum, item) => sum + number(item.amount), 0),
    unwithdrawn: number(unwithdrawn),
  };
}

function unwithdrawnByDepartment(entries, requests) {
  const totals = {
    deepnight: { deposited: 0, withdrawn: 0 },
    qiunai: { deposited: 0, withdrawn: 0 },
  };

  for (const entry of entries || []) {
    if (totals[entry.app_key]) {
      totals[entry.app_key].deposited += number(entry.amount);
    }
  }

  for (const request of requests || []) {
    if (totals[request.app_key] && request.status === "approved") {
      totals[request.app_key].withdrawn += number(request.amount);
    }
  }

  return Object.fromEntries(
    Object.entries(totals).map(([appKey, total]) => [
      appKey,
      total.deposited - total.withdrawn,
    ]),
  );
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
      walletEntries,
      approvedWithdrawals,
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
          "order_amount, price, staff_salary, bonus_amount, status, order_finished_at, wallet_settled_at",
        )
        .or(`guild_id.eq.${DEEPNIGHT_GUILD_ID},guild_id.is.null`)
        .or("is_deleted.eq.false,is_deleted.is.null")
        .gte("order_finished_at", range.start)
        .lt("order_finished_at", range.end),
      supabaseAdmin
        .from("qiunai_salary_orders")
        .select(
          "order_amount, staff_salary, bonus_amount, status, order_finished_at, wallet_settled_at",
        )
        .or("is_deleted.eq.false,is_deleted.is.null")
        .gte("order_finished_at", range.start)
        .lt("order_finished_at", range.end),
      supabaseAdmin
        .from("players_bonus")
        .select("amount, created_at, wallet_settled_at")
        .gte("created_at", range.start)
        .lt("created_at", range.end),
      supabaseAdmin
        .from("qiunai_staff_bonus")
        .select("amount, created_at, wallet_settled_at")
        .gte("created_at", range.start)
        .lt("created_at", range.end),
      loadAllPages((from, to) =>
        supabaseAdmin
          .from("salary_wallet_entries")
          .select("app_key, amount")
          .in("app_key", ["deepnight", "qiunai"])
          .gte("settlement_date", SALARY_WALLET_START_DATE)
          .range(from, to),
      ),
      loadAllPages((from, to) =>
        supabaseAdmin
          .from("salary_withdraw_requests")
          .select("app_key, amount, status")
          .in("app_key", ["deepnight", "qiunai"])
          .eq("status", "approved")
          .gte(
            "requested_at",
            `${SALARY_WALLET_START_DATE}T00:00:00+08:00`,
          )
          .range(from, to),
      ),
    ]);

    const results = [
      deepnightStaff,
      qiunaiStaff,
      deepnightOrders,
      qiunaiOrders,
      deepnightBonuses,
      qiunaiBonuses,
      walletEntries,
      approvedWithdrawals,
    ];
    const failed = results.find((result) => result.error);
    if (failed?.error) throw failed.error;

    const unwithdrawn = unwithdrawnByDepartment(
      walletEntries.data,
      approvedWithdrawals.data,
    );
    const deepnight = summarize(
      deepnightStaff.count,
      deepnightOrders.data,
      deepnightBonuses.data,
      "已發薪",
      unwithdrawn.deepnight,
    );
    const qiunai = summarize(
      qiunaiStaff.count,
      qiunaiOrders.data,
      qiunaiBonuses.data,
      "已入帳",
      unwithdrawn.qiunai,
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
