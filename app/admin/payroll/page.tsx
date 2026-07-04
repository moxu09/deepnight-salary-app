"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  Clipboard,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

const DEEPNIGHT_GUILD_ID =
  process.env.NEXT_PUBLIC_DEEPNIGHT_GUILD_ID ||
  process.env.NEXT_PUBLIC_GUILD_ID ||
  "1501098191813214312";
const DEEPNIGHT_PLAY_ORDER_FILTER =
  `guild_id.eq.${DEEPNIGHT_GUILD_ID},guild_id.is.null`;

type Staff = {
  id?: string;
  discord_id: string;
  discord_name?: string | null;
  display_name?: string | null;
  real_name?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  is_active?: boolean | null;
};

type SalaryOrder = {
  id: string;
  discord_id?: string | null;
  staff_name?: string | null;
  staff_salary?: number | null;
  bonus_amount?: number | null;
  status?: string | null;
  order_finished_at?: string | null;
  is_deleted?: boolean | null;
};

type Bonus = {
  id: string;
  discord_id: string;
  staff_name?: string | null;
  bonus_type?: string | null;
  description?: string | null;
  amount?: number | null;
  created_at?: string | null;
};

type PayrollRow = {
  discordId: string;
  staffName: string;
  accountName: string;
  bankName: string;
  bankAccount: string;
  salary: number;
  bonus: number;
  total: number;
  orderCount: number;
  bonusCount: number;
};

type SessionLike = {
  user?: {
    user_metadata?: Record<string, unknown>;
    identities?: Array<{
      identity_data?: {
        sub?: unknown;
        id?: unknown;
      };
    }>;
  };
};

function getTodayInput() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function getMonthStartInput() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const offset = start.getTimezoneOffset();
  const local = new Date(start.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function dateToStartIso(value: string) {
  if (!value) return null;
  return new Date(`${value}T00:00:00`).toISOString();
}

function dateToEndIso(value: string) {
  if (!value) return null;
  return new Date(`${value}T23:59:59`).toISOString();
}

function money(value: number | string | null | undefined) {
  return `$${Number(value || 0).toLocaleString("zh-TW")}`;
}

function getDisplayName(staff?: Staff | null, fallback?: string | null) {
  return (
    staff?.display_name ||
    staff?.real_name ||
    staff?.discord_name ||
    fallback ||
    staff?.discord_id ||
    "未知員工"
  );
}

function getAccountName(staff?: Staff | null, fallback?: string | null) {
  return staff?.real_name || staff?.display_name || fallback || "-";
}

function stringValue(value: unknown) {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  return "";
}

function getDiscordIdFromSession(session: unknown) {
  const user = (session as SessionLike | null)?.user;
  const metadata = user?.user_metadata || {};

  return String(
    stringValue(metadata.provider_id) ||
      stringValue(metadata.sub) ||
      stringValue(metadata.user_id) ||
      stringValue(user?.identities?.[0]?.identity_data?.sub) ||
      stringValue(user?.identities?.[0]?.identity_data?.id) ||
      ""
  ).trim();
}

function buildCopyText(rows: PayrollRow[]) {
  return rows
    .map((row, index) => {
      return [
        `${index + 1}. ${row.staffName}`,
        `戶名：${row.accountName}`,
        `銀行：${row.bankName || "-"}`,
        `帳號：${row.bankAccount || "-"}`,
        `薪水：${money(row.salary)}`,
        `獎金/扣除：${money(row.bonus)}`,
        `應發：${money(row.total)}`,
      ].join("\n");
    })
    .join("\n\n");
}

export default function AdminPayrollPage() {
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(true);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [orders, setOrders] = useState<SalaryOrder[]>([]);
  const [bonuses, setBonuses] = useState<Bonus[]>([]);
  const [keyword, setKeyword] = useState("");
  const [startDate, setStartDate] = useState(getMonthStartInput());
  const [endDate, setEndDate] = useState(getTodayInput());

  const rows = useMemo(() => {
    const staffMap = new Map<string, Staff>();

    for (const staff of staffList) {
      if (staff.discord_id) {
        staffMap.set(staff.discord_id, staff);
      }
    }

    const rowMap = new Map<string, PayrollRow>();

    function ensureRow(discordId: string, fallbackName?: string | null) {
      const staff = staffMap.get(discordId);
      const existing = rowMap.get(discordId);

      if (existing) return existing;

      const row: PayrollRow = {
        discordId,
        staffName: getDisplayName(staff, fallbackName),
        accountName: getAccountName(staff, fallbackName),
        bankName: staff?.bank_name || "",
        bankAccount: staff?.bank_account || "",
        salary: 0,
        bonus: 0,
        total: 0,
        orderCount: 0,
        bonusCount: 0,
      };

      rowMap.set(discordId, row);
      return row;
    }

    for (const order of orders) {
      const discordId = String(order.discord_id || "").trim();
      if (!discordId) continue;

      const row = ensureRow(discordId, order.staff_name);
      row.salary += Number(order.staff_salary || 0);
      row.bonus += Number(order.bonus_amount || 0);
      row.orderCount += 1;
    }

    for (const bonus of bonuses) {
      const discordId = String(bonus.discord_id || "").trim();
      if (!discordId) continue;

      const row = ensureRow(discordId, bonus.staff_name);
      row.bonus += Number(bonus.amount || 0);
      row.bonusCount += 1;
    }

    let result = Array.from(rowMap.values())
      .map((row) => ({
        ...row,
        total: row.salary + row.bonus,
      }))
      .filter((row) => row.total > 0);

    const key = keyword.trim().toLowerCase();
    if (key) {
      result = result.filter((row) =>
        [
          row.discordId,
          row.staffName,
          row.accountName,
          row.bankName,
          row.bankAccount,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(key)
      );
    }

    return result.sort((a, b) => b.total - a.total);
  }, [staffList, orders, bonuses, keyword]);

  const totals = useMemo(() => {
    return {
      staffCount: rows.length,
      salary: rows.reduce((sum, row) => sum + row.salary, 0),
      bonus: rows.reduce((sum, row) => sum + row.bonus, 0),
      total: rows.reduce((sum, row) => sum + row.total, 0),
    };
  }, [rows]);

  useEffect(() => {
    boot();
  }, []);

  async function boot() {
    setChecking(true);

    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session) {
        window.location.href = "/admin-login";
        return;
      }

      const discordId = getDiscordIdFromSession(session);

      if (!discordId) {
        alert("無法取得 Discord ID，請重新登入。");
        await supabase.auth.signOut();
        window.location.href = "/admin-login";
        return;
      }

      const { data: admin, error } = await supabase
        .from("admins")
        .select("*")
        .eq("discord_id", discordId)
        .eq("is_active", true)
        .maybeSingle();

      if (error || !admin) {
        alert(error ? "檢查後台權限失敗" : "你沒有後台管理權限");
        window.location.href = "/staff";
        return;
      }

      await loadPayrollData();
    } catch (error) {
      console.error("admin payroll boot error:", error);
      alert("檢查後台權限失敗");
      window.location.href = "/staff";
    } finally {
      setChecking(false);
    }
  }

  async function loadPayrollData() {
    setLoading(true);

    const startIso = dateToStartIso(startDate);
    const endIso = dateToEndIso(endDate);

    let orderQuery = supabase
      .from("play_orders")
      .select(
        "id, discord_id, staff_name, staff_salary, bonus_amount, status, order_finished_at, is_deleted"
      )
      .or(DEEPNIGHT_PLAY_ORDER_FILTER)
      .or("is_deleted.eq.false,is_deleted.is.null")
      .or("status.neq.已發薪,status.is.null")
      .order("order_finished_at", { ascending: false });

    if (startIso) orderQuery = orderQuery.gte("order_finished_at", startIso);
    if (endIso) orderQuery = orderQuery.lte("order_finished_at", endIso);

    let bonusQuery = supabase
      .from("players_bonus")
      .select("id, discord_id, staff_name, bonus_type, description, amount, created_at")
      .order("created_at", { ascending: false });

    if (startIso) bonusQuery = bonusQuery.gte("created_at", startIso);
    if (endIso) bonusQuery = bonusQuery.lte("created_at", endIso);

    const [staffRes, orderRes, bonusRes] = await Promise.all([
      supabase
        .from("players")
        .select(
          "id, discord_id, discord_name, display_name, real_name, bank_name, bank_account, is_active"
        )
        .order("created_at", { ascending: false }),
      orderQuery,
      bonusQuery,
    ]);

    setLoading(false);

    if (staffRes.error) {
      console.error("load staff error:", staffRes.error);
      alert("讀取員工資料失敗");
      return;
    }

    if (orderRes.error) {
      console.error("load payroll orders error:", orderRes.error);
      alert("讀取待發薪訂單失敗");
      return;
    }

    if (bonusRes.error) {
      console.error("load payroll bonuses error:", bonusRes.error);
      alert("讀取獎金 / 扣除失敗");
      return;
    }

    setStaffList((staffRes.data || []) as Staff[]);
    setOrders((orderRes.data || []) as SalaryOrder[]);
    setBonuses((bonusRes.data || []) as Bonus[]);
  }

  async function copyPayrollList() {
    if (!rows.length) {
      alert("目前沒有可複製的發薪資料");
      return;
    }

    await navigator.clipboard.writeText(buildCopyText(rows));
    alert("已複製發薪清單");
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#eef7fd]">
        <div className="rounded-[28px] border border-sky-100 bg-white px-8 py-7 text-center shadow-sm shadow-sky-100">
          <Loader2 className="mx-auto animate-spin text-sky-500" size={34} />
          <p className="mt-4 text-sm font-semibold text-slate-600">
            正在檢查後台權限...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#eef7fd] px-5 py-6 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-[30px] border border-sky-100 bg-white px-6 py-5 shadow-sm shadow-sky-100">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 text-sm font-bold text-sky-600 hover:text-sky-700"
              >
                <ArrowLeft size={16} />
                回管理後台
              </Link>

              <p className="mt-4 text-sm font-bold text-sky-600">
                DeepNight Payroll
              </p>

              <h1 className="mt-1 text-2xl font-black text-slate-900 md:text-3xl">
                發薪模式
              </h1>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={copyPayrollList}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-sky-100 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-sky-50"
              >
                <Clipboard size={16} />
                複製清單
              </button>

              <button
                onClick={loadPayrollData}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-sky-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm shadow-sky-200 hover:bg-sky-600 disabled:opacity-60"
              >
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                重新整理
              </button>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <StatCard title="待發人數" value={`${totals.staffCount} 人`} />
          <StatCard title="薪水" value={money(totals.salary)} />
          <StatCard title="獎金 / 扣除" value={money(totals.bonus)} />
          <StatCard title="應發總額" value={money(totals.total)} />
        </section>

        <section className="rounded-[28px] border border-sky-100 bg-white p-5 shadow-sm shadow-sky-100">
          <div className="grid gap-4 md:grid-cols-4">
            <Field label="開始日期">
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </Field>

            <Field label="結束日期">
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </Field>

            <Field label="搜尋">
              <div className="flex items-center gap-2 rounded-xl border border-sky-100 bg-sky-50/60 px-3">
                <Search size={16} className="text-sky-500" />
                <input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="姓名、銀行、帳號"
                  className="min-h-0 flex-1 border-none bg-transparent p-0 focus:shadow-none"
                />
              </div>
            </Field>

            <div className="flex items-end">
              <button
                onClick={loadPayrollData}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-sky-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-sky-600 disabled:opacity-60"
              >
                <CalendarDays size={16} />
                查詢
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-sky-100 bg-white shadow-sm shadow-sky-100">
          <div className="border-b border-sky-100 px-5 py-4">
            <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
              <Banknote size={20} className="text-sky-500" />
              待發薪清單
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              只顯示指定區間內應發金額大於 0 的員工。
            </p>
          </div>

          {loading ? (
            <div className="px-5 py-12 text-center text-sm font-semibold text-slate-400">
              讀取中...
            </div>
          ) : rows.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm font-semibold text-slate-400">
              目前沒有需要發薪的員工
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>名字</th>
                    <th>銀行</th>
                    <th>帳號</th>
                    <th>戶名</th>
                    <th>薪水</th>
                    <th>獎金 / 扣除</th>
                    <th>應發</th>
                    <th>筆數</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.discordId}>
                      <td>
                        <div className="font-black text-slate-900">
                          {row.staffName}
                        </div>
                        <div className="text-xs font-semibold text-slate-400">
                          {row.discordId}
                        </div>
                      </td>
                      <td>{row.bankName || "-"}</td>
                      <td>{row.bankAccount || "-"}</td>
                      <td>{row.accountName}</td>
                      <td>{money(row.salary)}</td>
                      <td
                        className={
                          row.bonus < 0 ? "text-rose-500" : "text-emerald-600"
                        }
                      >
                        {money(row.bonus)}
                      </td>
                      <td className="font-black text-sky-600">
                        {money(row.total)}
                      </td>
                      <td>
                        {row.orderCount} 單 / {row.bonusCount} 筆
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-sky-100 bg-white p-5 shadow-sm shadow-sky-100">
      <p className="text-sm font-bold text-sky-600">{title}</p>
      <p className="mt-3 text-2xl font-black text-slate-900">{value}</p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-slate-600">
        {label}
      </span>
      {children}
    </label>
  );
}
