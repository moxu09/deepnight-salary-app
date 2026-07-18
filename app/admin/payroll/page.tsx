"use client";

import type { ReactNode } from "react";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  Clipboard,
  Loader2,
  RefreshCw,
  Search,
  CheckCircle2,
  WalletCards,
  XCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getDiscordIdFromSession } from "@/lib/discordSession";
import {
  dateInputToTaipeiEndIso,
  dateInputToTaipeiStartIso,
  formatTaipeiDateTime,
} from "@/lib/taipeiTime";

const DEEPNIGHT_GUILD_ID =
  process.env.NEXT_PUBLIC_DEEPNIGHT_GUILD_ID ||
  process.env.NEXT_PUBLIC_GUILD_ID ||
  "1501098191813214312";
const DEEPNIGHT_PLAY_ORDER_FILTER = `guild_id.eq.${DEEPNIGHT_GUILD_ID},guild_id.is.null`;
const SALARY_WALLET_START_DATE =
  process.env.NEXT_PUBLIC_SALARY_WALLET_START_DATE || "2026-07-17";
const SALARY_WALLET_START_ISO = new Date(
  `${SALARY_WALLET_START_DATE}T00:00:00+08:00`
).toISOString();
const PAYROLL_WALLET_FILTER = `wallet_settled_at.is.null,wallet_settled_at.lt.${SALARY_WALLET_START_ISO}`;
const APP_KEY = "deepnight";
const ORDER_TABLE = "play_orders";
const BONUS_TABLE = "players_bonus";

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
  service_name?: string | null;
  service?: string | null;
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

type WalletEntrySource = {
  source_table: string | null;
  source_id: string | null;
  entry_type: string | null;
};

type PayrollRow = {
  discordId: string;
  staffName: string;
  accountName: string;
  bankName: string;
  bankAccount: string;
  orderSalary: number;
  tipSalary: number;
  bonus: number;
  deduction: number;
  total: number;
  orderCount: number;
  tipCount: number;
  bonusCount: number;
  deductionCount: number;
  recordCount: number;
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

type WalletOptionKey = "order" | "tip" | "bonus" | "deduction";

const WALLET_OPTIONS: Array<{
  key: WalletOptionKey;
  label: string;
  amountKey: keyof Pick<
    PayrollRow,
    "orderSalary" | "tipSalary" | "bonus" | "deduction"
  >;
}> = [
  { key: "order", label: "訂單", amountKey: "orderSalary" },
  { key: "tip", label: "打賞", amountKey: "tipSalary" },
  { key: "bonus", label: "獎金", amountKey: "bonus" },
  { key: "deduction", label: "扣除", amountKey: "deduction" },
];

const DEFAULT_WALLET_OPTIONS: Record<WalletOptionKey, boolean> = {
  order: true,
  tip: true,
  bonus: true,
  deduction: true,
};

function dateToStartIso(value: string) {
  return dateInputToTaipeiStartIso(value);
}

function dateToEndIso(value: string) {
  return dateInputToTaipeiEndIso(value);
}

function money(value: number | string | null | undefined) {
  return `$${Number(value || 0).toLocaleString("zh-TW")}`;
}

function formatDateTime(value?: string | null) {
  return formatTaipeiDateTime(value, {
    hour12: false,
  });
}

function getRequestStatusText(status: string, rejectReason?: string | null) {
  if (status === "pending") return "申請中";
  if (status === "approved") return "申請成功，請稍等三個工作日";
  if (status === "rejected")
    return `申請遭駁回${rejectReason ? `：${rejectReason}` : ""}`;
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

function walletEntryKey(
  table?: string | null,
  id?: string | null,
  entryType?: string | null
) {
  return `${table || ""}:${String(id || "")}:${entryType || ""}`;
}

function isTipOrder(order: SalaryOrder) {
  return [order.service_name, order.service]
    .filter(Boolean)
    .some((value) => String(value).includes("打賞"));
}

function addBonusOrDeduction(
  row: PayrollRow,
  value: number | string | null | undefined
) {
  const amount = Number(value || 0);

  if (amount > 0) {
    row.bonus += amount;
    row.bonusCount += 1;
  } else if (amount < 0) {
    row.deduction += Math.abs(amount);
    row.deductionCount += 1;
  }
}

function buildCopyText(rows: PayrollRow[]) {
  return rows
    .map((row, index) => {
      return [
        `${index + 1}. ${row.staffName}`,
        `戶名：${row.accountName}`,
        `銀行：${row.bankName || "-"}`,
        `帳號：${row.bankAccount || "-"}`,
        `訂單薪水：${money(row.orderSalary)}`,
        `打賞薪水：${money(row.tipSalary)}`,
        `獎金：${money(row.bonus)}`,
        `扣除：${money(row.deduction)}`,
        `應發總額：${money(row.total)}`,
        `筆數：${row.recordCount}`,
      ].join("\n");
    })
    .join("\n\n");
}

export default function AdminPayrollPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(true);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [orders, setOrders] = useState<SalaryOrder[]>([]);
  const [bonuses, setBonuses] = useState<Bonus[]>([]);
  const [walletEntrySources, setWalletEntrySources] = useState<
    WalletEntrySource[]
  >([]);
  const [withdrawRequests, setWithdrawRequests] = useState<WithdrawRequest[]>(
    []
  );
  const [keyword, setKeyword] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [walletModalRow, setWalletModalRow] = useState<PayrollRow | null>(null);
  const [walletOptions, setWalletOptions] = useState<
    Record<WalletOptionKey, boolean>
  >(DEFAULT_WALLET_OPTIONS);
  const [walletManualAmount, setWalletManualAmount] = useState("");
  const [walletSendingId, setWalletSendingId] = useState<string | null>(null);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const staffMap = new Map<string, Staff>();
    const walletEntryKeySet = new Set(
      walletEntrySources.map((entry) =>
        walletEntryKey(entry.source_table, entry.source_id, entry.entry_type)
      )
    );

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
        orderSalary: 0,
        tipSalary: 0,
        bonus: 0,
        deduction: 0,
        total: 0,
        orderCount: 0,
        tipCount: 0,
        bonusCount: 0,
        deductionCount: 0,
        recordCount: 0,
      };

      rowMap.set(discordId, row);
      return row;
    }

    for (const order of orders) {
      const discordId = String(order.discord_id || "").trim();
      if (!discordId) continue;

      const row = ensureRow(discordId, order.staff_name);
      const salary = Number(order.staff_salary || 0);
      const salarySent = walletEntryKeySet.has(
        walletEntryKey(ORDER_TABLE, order.id, "order_salary")
      );
      const bonusSent = walletEntryKeySet.has(
        walletEntryKey(ORDER_TABLE, order.id, "order_bonus")
      );

      if (!salarySent) {
        if (isTipOrder(order)) {
          row.tipSalary += salary;
          row.tipCount += 1;
        } else {
          row.orderSalary += salary;
          row.orderCount += 1;
        }
      }

      if (!bonusSent) {
        addBonusOrDeduction(row, order.bonus_amount);
      }
    }

    for (const bonus of bonuses) {
      const discordId = String(bonus.discord_id || "").trim();
      if (!discordId) continue;
      if (
        walletEntryKeySet.has(
          walletEntryKey(BONUS_TABLE, bonus.id, "staff_bonus")
        )
      ) {
        continue;
      }

      const row = ensureRow(discordId, bonus.staff_name);
      addBonusOrDeduction(row, bonus.amount);
    }

    let result = Array.from(rowMap.values())
      .map((row) => ({
        ...row,
        total: row.orderSalary + row.tipSalary + row.bonus - row.deduction,
        recordCount:
          row.orderCount + row.tipCount + row.bonusCount + row.deductionCount,
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
  }, [staffList, orders, bonuses, walletEntrySources, keyword]);

  const totals = useMemo(() => {
    return {
      staffCount: rows.length,
      orderSalary: rows.reduce((sum, row) => sum + row.orderSalary, 0),
      tipSalary: rows.reduce((sum, row) => sum + row.tipSalary, 0),
      bonus: rows.reduce((sum, row) => sum + row.bonus, 0),
      deduction: rows.reduce((sum, row) => sum + row.deduction, 0),
      total: rows.reduce((sum, row) => sum + row.total, 0),
    };
  }, [rows]);

  async function boot() {
    setChecking(true);

    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session) {
        router.replace("/admin-login");
        return;
      }

      const discordId = getDiscordIdFromSession(session);

      if (!discordId) {
        alert("無法取得 Discord ID，請重新登入。");
        await supabase.auth.signOut();
        router.replace("/admin-login");
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
        router.replace("/staff");
        return;
      }

      await loadPayrollData();
    } catch (error) {
      console.error("admin payroll boot error:", error);
      alert("檢查後台權限失敗");
      router.replace("/staff");
    } finally {
      setChecking(false);
    }
  }

  async function loadPayrollData({ silent = false } = {}) {
    if (!silent) {
      setLoading(true);
    }
    await loadWithdrawRequests();

    const startIso = dateToStartIso(startDate);
    const endIso = dateToEndIso(endDate);

    let orderQuery = supabase
      .from("play_orders")
      .select(
        "id, discord_id, staff_name, service_name, service, staff_salary, bonus_amount, status, order_finished_at, is_deleted, wallet_settled_at"
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
      .select(
        "id, discord_id, staff_name, bonus_type, description, amount, created_at"
      )
      .or(PAYROLL_WALLET_FILTER)
      .order("created_at", { ascending: false });

    if (startIso) bonusQuery = bonusQuery.gte("created_at", startIso);
    if (endIso) bonusQuery = bonusQuery.lte("created_at", endIso);

    const [staffRes, orderRes, bonusRes, walletEntryRes] = await Promise.all([
      supabase
        .from("players")
        .select(
          "id, discord_id, discord_name, display_name, real_name, bank_name, bank_account, is_active"
        )
        .order("created_at", { ascending: false }),
      orderQuery,
      bonusQuery,
      supabase
        .from("salary_wallet_entries")
        .select("source_table, source_id, entry_type")
        .eq("app_key", APP_KEY)
        .in("source_table", [ORDER_TABLE, BONUS_TABLE])
        .limit(10000),
    ]);

    if (!silent) {
      setLoading(false);
    }

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

    if (walletEntryRes.error) {
      console.error("load wallet entry sources error:", walletEntryRes.error);
      alert("讀取錢包入帳來源失敗");
      return;
    }

    setStaffList((staffRes.data || []) as Staff[]);
    setOrders((orderRes.data || []) as SalaryOrder[]);
    setBonuses((bonusRes.data || []) as Bonus[]);
    setWalletEntrySources((walletEntryRes.data || []) as WalletEntrySource[]);
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

  async function reviewWithdrawRequest(
    id: string,
    action: "approve" | "reject"
  ) {
    const reason = action === "reject" ? window.prompt("請輸入駁回理由") : "";

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

  function openWalletModal(row: PayrollRow) {
    setWalletModalRow(row);
    setWalletOptions(DEFAULT_WALLET_OPTIONS);
    setWalletManualAmount("");
  }

  function toggleWalletOption(key: WalletOptionKey) {
    setWalletOptions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }

  function getSelectedWalletTypes() {
    return WALLET_OPTIONS.filter((option) => walletOptions[option.key]).map(
      (option) => option.key
    );
  }

  function getWalletSelectionTotal(row: PayrollRow) {
    const selectedTotal = WALLET_OPTIONS.reduce((sum, option) => {
      if (!walletOptions[option.key]) return sum;

      const amount = Number(row[option.amountKey] || 0);
      return option.key === "deduction" ? sum - amount : sum + amount;
    }, 0);

    return selectedTotal + getWalletManualAmount();
  }

  function getWalletManualAmount() {
    const amount = Number(walletManualAmount || 0);
    return Number.isFinite(amount) ? Math.max(0, amount) : 0;
  }

  async function sendWalletToStaff() {
    if (!walletModalRow) return;

    const types = getSelectedWalletTypes();
    const manualAmount = getWalletManualAmount();
    const scrollTop = window.scrollY;

    if (types.length === 0 && manualAmount <= 0) {
      alert("請至少勾選一個發送項目，或輸入手動發送金額");
      return;
    }

    setWalletSendingId(walletModalRow.discordId);

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
          action: "deposit-wallet",
          discordId: walletModalRow.discordId,
          staffName: walletModalRow.staffName,
          types,
          manualAmount,
          startDate,
          endDate,
        }),
      });

      const payload = await res.json();

      if (!res.ok || !payload.ok) {
        throw new Error(payload.message || "發送到錢包失敗");
      }

      setWalletModalRow(null);
      await loadPayrollData({ silent: true });
      window.scrollTo({ top: scrollTop, behavior: "auto" });
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollTop, behavior: "auto" });
      });
      setTimeout(() => {
        window.scrollTo({ top: scrollTop, behavior: "auto" });
      }, 120);
      alert(
        `已發送到員工錢包：${money(payload.result?.amount || 0)}（${
          payload.result?.count || 0
        } 筆）`
      );
    } catch (error) {
      console.error("send wallet failed:", error);
      alert(error instanceof Error ? error.message : "發送到錢包失敗");
    } finally {
      setWalletSendingId(null);
    }
  }

  async function markStaffPaid(row: PayrollRow) {
    const ok = confirm(
      `確定要將「${row.staffName}」目前查詢範圍內的未發薪訂單標記為已發薪嗎？`
    );
    if (!ok) return;

    setMarkingPaidId(row.discordId);
    const settledAt = new Date().toISOString();
    const orderIds = orders
      .filter((order) => order.discord_id === row.discordId)
      .map((order) => order.id);
    const bonusIds = bonuses
      .filter((bonus) => bonus.discord_id === row.discordId)
      .map((bonus) => bonus.id);
    const [orderResult, bonusResult] = await Promise.all([
      orderIds.length
        ? supabase
            .from(ORDER_TABLE)
            .update({ status: "已發薪", wallet_settled_at: settledAt })
            .in("id", orderIds)
        : Promise.resolve({ error: null }),
      bonusIds.length
        ? supabase
            .from(BONUS_TABLE)
            .update({ wallet_settled_at: settledAt })
            .in("id", bonusIds)
        : Promise.resolve({ error: null }),
    ]);
    setMarkingPaidId(null);

    if (orderResult.error || bonusResult.error) {
      console.error(
        "mark staff paid failed:",
        orderResult.error || bonusResult.error
      );
      alert("標記發薪失敗");
      return;
    }

    alert(`已將 ${row.staffName} 的薪資項目標記為已發薪`);
    await loadPayrollData({ silent: true });
  }

  const bootEffect = useEffectEvent(boot);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void bootEffect(), 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

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
                onClick={() => loadPayrollData()}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-sky-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm shadow-sky-200 hover:bg-sky-600 disabled:opacity-60"
              >
                <RefreshCw
                  size={16}
                  className={loading ? "animate-spin" : ""}
                />
                重新整理
              </button>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          <StatCard title="待發人數" value={`${totals.staffCount} 人`} />
          <StatCard title="訂單薪水" value={money(totals.orderSalary)} />
          <StatCard title="打賞薪水" value={money(totals.tipSalary)} />
          <StatCard title="獎金" value={money(totals.bonus)} />
          <StatCard title="扣除" value={money(totals.deduction)} />
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
                onClick={() => loadPayrollData()}
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
              <table className="min-w-[1280px]">
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
              預設顯示所有尚未發薪的員工；日期只在需要縮小查詢範圍時使用。2026/07/17
              前被舊錢包標記過的資料仍會列入。
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
              <table className="min-w-[1280px]">
                <thead>
                  <tr>
                    <th>名字</th>
                    <th>銀行</th>
                    <th>帳號</th>
                    <th>戶名</th>
                    <th>訂單薪水</th>
                    <th>打賞薪水</th>
                    <th>獎金</th>
                    <th>扣除</th>
                    <th>應發總額</th>
                    <th>筆數</th>
                    <th>錢包</th>
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
                      <td>{money(row.orderSalary)}</td>
                      <td>{money(row.tipSalary)}</td>
                      <td className="text-emerald-600">{money(row.bonus)}</td>
                      <td className="text-rose-500">{money(row.deduction)}</td>
                      <td className="font-black text-sky-600">
                        {money(row.total)}
                      </td>
                      <td>
                        <div className="font-bold text-slate-700">
                          {row.recordCount}
                        </div>
                        <div className="text-xs font-semibold text-slate-400">
                          {row.orderCount} 單 / {row.tipCount} 賞 /{" "}
                          {row.bonusCount + row.deductionCount} 獎扣
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openWalletModal(row)}
                            disabled={walletSendingId === row.discordId}
                            className="inline-flex items-center gap-2 rounded-full bg-sky-500 px-3 py-2 text-xs font-bold text-white hover:bg-sky-600 disabled:opacity-60"
                          >
                            <WalletCards size={14} />
                            發送
                          </button>
                          <button
                            onClick={() => markStaffPaid(row)}
                            disabled={markingPaidId === row.discordId}
                            className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-60"
                          >
                            <CheckCircle2 size={14} />
                            標記發薪
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {walletModalRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6">
          <div className="w-full max-w-md rounded-[28px] border border-sky-100 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-black text-sky-600">發送到錢包</p>
                <h3 className="mt-1 text-xl font-black text-slate-900">
                  {walletModalRow.staffName}
                </h3>
                <p className="mt-1 text-xs font-semibold text-slate-400">
                  {walletModalRow.discordId}
                </p>
              </div>

              <button
                onClick={() => setWalletModalRow(null)}
                disabled={walletSendingId === walletModalRow.discordId}
                className="rounded-full border border-sky-100 px-3 py-2 text-xs font-bold text-slate-500 hover:bg-sky-50 disabled:opacity-60"
              >
                關閉
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {WALLET_OPTIONS.map((option) => {
                const rawAmount = Number(walletModalRow[option.amountKey] || 0);
                const signedAmount =
                  option.key === "deduction" ? -rawAmount : rawAmount;

                return (
                  <label
                    key={option.key}
                    className="flex cursor-pointer items-center justify-between gap-4 rounded-[18px] border border-sky-100 bg-sky-50/60 px-4 py-3"
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={walletOptions[option.key]}
                        onChange={() => toggleWalletOption(option.key)}
                        className="h-4 w-4 accent-sky-500"
                      />
                      <span className="font-black text-slate-700">
                        {option.label}
                      </span>
                    </span>
                    <span
                      className={
                        signedAmount < 0
                          ? "font-black text-rose-500"
                          : "font-black text-sky-600"
                      }
                    >
                      {money(signedAmount)}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="mt-5 rounded-[18px] border border-sky-100 bg-white px-4 py-3">
              <label className="text-sm font-black text-slate-700">
                手動發送金額
              </label>
              <input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={walletManualAmount}
                onChange={(event) => setWalletManualAmount(event.target.value)}
                placeholder="不另外發送可留空"
                className="mt-2 w-full rounded-2xl border border-sky-100 px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-sky-400"
              />
            </div>

            <div className="mt-5 rounded-[18px] bg-slate-50 px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-black text-slate-600">總計</span>
                <span className="text-lg font-black text-sky-600">
                  {money(getWalletSelectionTotal(walletModalRow))}
                </span>
              </div>
              <p className="mt-1 text-xs font-semibold text-slate-400">
                備注：後台手動新增
              </p>
            </div>

            <button
              onClick={sendWalletToStaff}
              disabled={walletSendingId === walletModalRow.discordId}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-sky-500 px-4 py-3 text-sm font-black text-white hover:bg-sky-600 disabled:opacity-60"
            >
              <WalletCards size={16} />
              {walletSendingId === walletModalRow.discordId
                ? "發送中..."
                : "發送"}
            </button>
          </div>
        </div>
      ) : null}
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-slate-600">
        {label}
      </span>
      {children}
    </label>
  );
}
