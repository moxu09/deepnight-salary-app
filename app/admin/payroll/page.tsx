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
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

const DEEPNIGHT_GUILD_ID =
  process.env.NEXT_PUBLIC_DEEPNIGHT_GUILD_ID ||
  process.env.NEXT_PUBLIC_GUILD_ID ||
  "1501098191813214312";
const DEEPNIGHT_PLAY_ORDER_FILTER =
  `guild_id.eq.${DEEPNIGHT_GUILD_ID},guild_id.is.null`;
const SALARY_WALLET_START_DATE =
  process.env.NEXT_PUBLIC_SALARY_WALLET_START_DATE || "2026-07-17";
const SALARY_WALLET_START_ISO = new Date(
  `${SALARY_WALLET_START_DATE}T00:00:00+08:00`
).toISOString();
const PAYROLL_WALLET_FILTER =
  `wallet_settled_at.is.null,wallet_settled_at.lt.${SALARY_WALLET_START_ISO}`;

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

type WithdrawRequest = {
  id: string;
  discord_id: string;
  staff_name?: string | null;
  amount: number | string;
  status: string;
  reject_reason?: string | null;
  reviewed_at?: string | null;
  requested_at?: string | null;
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

function formatDateTime(value?: string | null) {
  if (!value) return "-";

  return new Date(value).toLocaleString("zh-TW", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getRequestStatusText(status: string, rejectReason?: string | null) {
  if (status === "pending") return "申請中";
  if (status === "approved") return "申請成功，請稍等三個工作日";
  if (status === "rejected") return `申請遭駁回${rejectReason ? `：${rejectReason}` : ""}`;
  return status || "-";
}

function getRequestStatusClass(status: string) {
  if (status === "pending") return "bg-amber-50 text-amber-600";
  if (status === "approved") return "bg-emerald-50 text-emerald-600";
  if (status === "rejected") return "bg-rose-50 text-rose-600";
  return "bg-slate-100 text-slate-500";
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
  const [withdrawRequests, setWithdrawRequests] = useState<WithdrawRequest[]>([]);
  const [keyword, setKeyword] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reviewingId, setReviewingId] = useState<string | null>(null);

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
    await loadWithdrawRequests();

    const startIso = dateToStartIso(startDate);
    const endIso = dateToEndIso(endDate);

    let orderQuery = supabase
      .from("play_orders")
      .select(
        "id, discord_id, staff_name, staff_salary, bonus_amount, status, order_finished_at, is_deleted, wallet_settled_at"
      )
      .or(DEEPNIGHT_PLAY_ORDER_FILTER)
      .or("is_deleted.eq.false,is_deleted.is.null")
      .or(PAYROLL_WALLET_FILTER)
      .or("status.neq.已發薪,status.is.null")
      .order("order_finished_at", { ascending: false });

    if (startIso) orderQuery = orderQuery.gte("order_finished_at", startIso);
    if (endIso) orderQuery = orderQuery.lte("order_finished_at", endIso);

    let bonusQuery = supabase
      .from("players_bonus")
      .select("id, discord_id, staff_name, bonus_type, description, amount, created_at")
      .or(PAYROLL_WALLET_FILTER)
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

  async function loadWithdrawRequests() {
    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session) return;

      const res = await fetch("/api/deepnight/salary-wallet/admin", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const payload = await res.json();

      if (!res.ok || !payload.ok) {
        throw new Error(payload.message || "讀取提領申請失敗");
      }

      setWithdrawRequests((payload.requests || []) as WithdrawRequest[]);
    } catch (error) {
      console.error("load withdraw requests error:", error);
      alert(error instanceof Error ? error.message : "讀取提領申請失敗");
    }
  }

  async function reviewWithdrawRequest(id: string, action: "approve" | "reject") {
    const reason =
      action === "reject"
        ? window.prompt("請輸入駁回理由")
        : "";

    if (action === "reject" && !reason?.trim()) {
      return;
    }

    setReviewingId(id);

    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session) {
        throw new Error("請重新登入");
      }

      const res = await fetch("/api/deepnight/salary-wallet/admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          id,
          action,
          reason,
        }),
      });

      const payload = await res.json();

      if (!res.ok || !payload.ok) {
        throw new Error(payload.message || "更新提領申請失敗");
      }

      await loadWithdrawRequests();
    } catch (error) {
      console.error("review withdraw request error:", error);
      alert(error instanceof Error ? error.message : "更新提領申請失敗");
    } finally {
      setReviewingId(null);
    }
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
              薪資錢包提領申請
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              員工按下提領後會出現在這裡；同意後員工端會顯示申請成功，駁回會顯示理由。
            </p>
          </div>

          {withdrawRequests.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm font-semibold text-slate-400">
              目前沒有提領申請
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>申請時間</th>
                    <th>員工</th>
                    <th>金額</th>
                    <th>狀態</th>
                    <th>審核時間</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {withdrawRequests.map((request) => (
                    <tr key={request.id}>
                      <td>{formatDateTime(request.requested_at)}</td>
                      <td>
                        <div className="font-black text-slate-900">
                          {request.staff_name || request.discord_id}
                        </div>
                        <div className="text-xs font-semibold text-slate-400">
                          {request.discord_id}
                        </div>
                      </td>
                      <td className="font-black text-sky-600">
                        {money(request.amount)}
                      </td>
                      <td>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${getRequestStatusClass(
                            request.status
                          )}`}
                        >
                          {getRequestStatusText(
                            request.status,
                            request.reject_reason
                          )}
                        </span>
                      </td>
                      <td>{formatDateTime(request.reviewed_at)}</td>
                      <td>
                        {request.status === "pending" ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() =>
                                reviewWithdrawRequest(request.id, "approve")
                              }
                              disabled={reviewingId === request.id}
                              className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-60"
                            >
                              <CheckCircle2 size={14} />
                              同意
                            </button>
                            <button
                              onClick={() =>
                                reviewWithdrawRequest(request.id, "reject")
                              }
                              disabled={reviewingId === request.id}
                              className="inline-flex items-center gap-1 rounded-full bg-rose-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-600 disabled:opacity-60"
                            >
                              <XCircle size={14} />
                              駁回
                            </button>
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-[28px] border border-sky-100 bg-white shadow-sm shadow-sky-100">
          <div className="border-b border-sky-100 px-5 py-4">
            <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
              <Banknote size={20} className="text-sky-500" />
              待發薪清單
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              預設顯示所有尚未發薪的員工；日期只在需要縮小查詢範圍時使用。2026/07/17 前被舊錢包標記過的資料仍會列入。
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
