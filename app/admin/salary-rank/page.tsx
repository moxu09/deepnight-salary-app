"use client";

import type { ReactNode } from "react";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  Loader2,
  RefreshCw,
  Search,
  Trophy,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getDiscordIdFromSession } from "@/lib/discordSession";
import StaffAvatar from "@/components/StaffAvatar";
import {
  dateInputToTaipeiEndIso,
  dateInputToTaipeiStartIso,
  getTaipeiDateInput,
  getTaipeiMonthStartInput,
} from "@/lib/taipeiTime";

const DEEPNIGHT_GUILD_ID =
  process.env.NEXT_PUBLIC_DEEPNIGHT_GUILD_ID ||
  process.env.NEXT_PUBLIC_GUILD_ID ||
  "1501098191813214312";
const DEEPNIGHT_PLAY_ORDER_FILTER = `guild_id.eq.${DEEPNIGHT_GUILD_ID},guild_id.is.null`;

type Staff = {
  id: string;
  discord_id: string;
  discord_name?: string | null;
  display_name?: string | null;
  real_name?: string | null;
  avatar_url?: string | null;
  is_active?: boolean | null;
  is_online?: boolean | null;
  commission_tier?: string | null;
};

type SalaryOrder = {
  id: string;
  discord_id?: string | null;
  staff_name?: string | null;
  order_amount?: number | null;
  price?: number | null;
  staff_salary?: number | null;
  bonus_amount?: number | null;
  status?: string | null;
  order_finished_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  is_deleted?: boolean | null;
};

type Bonus = {
  id: string;
  discord_id: string;
  amount?: number | null;
  created_at?: string | null;
};

type StaffSalaryRow = {
  staff: Staff;
  orderCount: number;
  orderAmount: number;
  orderSalary: number;
  orderBonus: number;
  extraBonus: number;
  totalSalary: number;
  unpaidSalary: number;
};

function getTodayInput() {
  return getTaipeiDateInput();
}

function getMonthStartInput() {
  return getTaipeiMonthStartInput();
}

function dateToStartIso(value: string) {
  return dateInputToTaipeiStartIso(value);
}

function dateToEndIso(value: string) {
  return dateInputToTaipeiEndIso(value);
}

function money(value: number | string | null | undefined) {
  return `$${Number(value || 0).toLocaleString("zh-TW")}`;
}

function getDisplayName(staff: Staff | null) {
  if (!staff) return "未知員工";

  return (
    staff.display_name ||
    staff.real_name ||
    staff.discord_name ||
    staff.discord_id ||
    "未知員工"
  );
}

function getOrderAmount(order: SalaryOrder) {
  return Number(order.order_amount ?? order.price ?? 0);
}

function getOrderDate(order: SalaryOrder) {
  return (
    order.order_finished_at || order.completed_at || order.created_at || null
  );
}

function isSalaryOrder(order: SalaryOrder) {
  if (order.is_deleted === true) return false;

  const status = String(order.status || "");

  if (status === "waiting_payment") return false;
  if (status === "accepted") return false;

  return (
    status === "completed" ||
    status === "已完成" ||
    status === "未發薪" ||
    status === "已發薪" ||
    Number(order.staff_salary || 0) > 0
  );
}

function isDateInRange(
  sourceDate: string | null,
  startIso: string,
  endIso: string
) {
  if (!sourceDate) return false;

  const time = new Date(sourceDate).getTime();
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();

  if (Number.isNaN(time)) return false;

  return time >= start && time <= end;
}

function getCommissionTierLabel(value?: string | null) {
  if (value === "rate_80") return "80%";
  if (value === "rate_85") return "85%";
  if (value === "rate_90") return "90%";
  if (value === "manager_95") return "95% 主管";
  return "自動";
}

export default function SalaryRankPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(true);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [orders, setOrders] = useState<SalaryOrder[]>([]);
  const [bonuses, setBonuses] = useState<Bonus[]>([]);
  const [keyword, setKeyword] = useState("");
  const [sortMode, setSortMode] = useState("salary_desc");
  const [startDate, setStartDate] = useState(getMonthStartInput());
  const [endDate, setEndDate] = useState(getTodayInput());

  const rows = useMemo(() => {
    const startIso = dateToStartIso(startDate);
    const endIso = dateToEndIso(endDate);

    if (!startIso || !endIso) return [];

    const key = keyword.trim().toLowerCase();

    let result: StaffSalaryRow[] = staffList.map((staff) => {
      const staffOrders = orders
        .filter((order) => order.discord_id === staff.discord_id)
        .filter((order) => isSalaryOrder(order))
        .filter((order) =>
          isDateInRange(getOrderDate(order), startIso, endIso)
        );

      const staffBonuses = bonuses
        .filter((bonus) => bonus.discord_id === staff.discord_id)
        .filter((bonus) =>
          isDateInRange(bonus.created_at || null, startIso, endIso)
        );

      const orderAmount = staffOrders.reduce(
        (sum, order) => sum + getOrderAmount(order),
        0
      );

      const orderSalary = staffOrders.reduce(
        (sum, order) => sum + Number(order.staff_salary || 0),
        0
      );

      const orderBonus = staffOrders.reduce(
        (sum, order) => sum + Number(order.bonus_amount || 0),
        0
      );

      const extraBonus = staffBonuses.reduce(
        (sum, bonus) => sum + Number(bonus.amount || 0),
        0
      );

      const totalSalary = orderSalary + orderBonus + extraBonus;

      const unpaidSalary =
        staffOrders
          .filter((order) => order.status !== "已發薪")
          .reduce(
            (sum, order) =>
              sum +
              Number(order.staff_salary || 0) +
              Number(order.bonus_amount || 0),
            0
          ) + extraBonus;

      return {
        staff,
        orderCount: staffOrders.length,
        orderAmount,
        orderSalary,
        orderBonus,
        extraBonus,
        totalSalary,
        unpaidSalary,
      };
    });

    if (key) {
      result = result.filter((row) => {
        const text = [
          row.staff.discord_id,
          row.staff.discord_name,
          row.staff.display_name,
          row.staff.real_name,
          getCommissionTierLabel(row.staff.commission_tier),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return text.includes(key);
      });
    }

    if (sortMode === "salary_desc") {
      result.sort((a, b) => b.totalSalary - a.totalSalary);
    }

    if (sortMode === "salary_asc") {
      result.sort((a, b) => a.totalSalary - b.totalSalary);
    }

    if (sortMode === "order_amount_desc") {
      result.sort((a, b) => b.orderAmount - a.orderAmount);
    }

    if (sortMode === "order_amount_asc") {
      result.sort((a, b) => a.orderAmount - b.orderAmount);
    }

    if (sortMode === "order_count_desc") {
      result.sort((a, b) => b.orderCount - a.orderCount);
    }

    if (sortMode === "order_count_asc") {
      result.sort((a, b) => a.orderCount - b.orderCount);
    }

    if (sortMode === "name_asc") {
      result.sort((a, b) =>
        getDisplayName(a.staff).localeCompare(getDisplayName(b.staff))
      );
    }

    if (sortMode === "name_desc") {
      result.sort((a, b) =>
        getDisplayName(b.staff).localeCompare(getDisplayName(a.staff))
      );
    }

    return result;
  }, [staffList, orders, bonuses, keyword, sortMode, startDate, endDate]);

  const totalSalary = useMemo(() => {
    return rows.reduce((sum, row) => sum + row.totalSalary, 0);
  }, [rows]);

  const totalOrderAmount = useMemo(() => {
    return rows.reduce((sum, row) => sum + row.orderAmount, 0);
  }, [rows]);

  const totalOrderCount = useMemo(() => {
    return rows.reduce((sum, row) => sum + row.orderCount, 0);
  }, [rows]);

  const bootEffect = useEffectEvent(boot);

  useEffect(() => {
    bootEffect();
  }, []);

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

      if (error) {
        console.error("check admin error:", error);
        alert("檢查後台權限失敗");
        router.replace("/staff");
        return;
      }

      if (!admin) {
        alert("你沒有後台管理權限");
        router.replace("/staff");
        return;
      }

      await loadAll();
    } catch (error) {
      console.error("salary rank boot error:", error);
      alert("檢查後台權限失敗");
      router.replace("/staff");
    } finally {
      setChecking(false);
    }
  }

  async function loadAll() {
    setLoading(true);

    const [staffRes, orderRes, bonusRes] = await Promise.all([
      supabase
        .from("players")
        .select(
          "id, discord_id, discord_name, display_name, real_name, avatar_url, is_active, is_online, commission_tier"
        )
        .order("created_at", { ascending: false }),

      supabase
        .from("play_orders")
        .select(
          "id, discord_id, staff_name, order_amount, price, staff_salary, bonus_amount, status, order_finished_at, completed_at, created_at, is_deleted"
        )
        .or(DEEPNIGHT_PLAY_ORDER_FILTER)
        .or("is_deleted.eq.false,is_deleted.is.null")
        .order("order_finished_at", { ascending: false }),

      supabase
        .from("players_bonus")
        .select("id, discord_id, amount, created_at")
        .order("created_at", { ascending: false }),
    ]);

    setLoading(false);

    if (staffRes.error) {
      console.error("load staff error:", staffRes.error);
      alert("讀取員工資料失敗");
      return;
    }

    if (orderRes.error) {
      console.error("load orders error:", orderRes.error);
      alert("讀取訂單薪資失敗");
      return;
    }

    if (bonusRes.error) {
      console.error("load bonuses error:", bonusRes.error);
      alert("讀取獎金資料失敗");
      return;
    }

    setStaffList((staffRes.data || []) as Staff[]);
    setOrders((orderRes.data || []) as SalaryOrder[]);
    setBonuses((bonusRes.data || []) as Bonus[]);
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
                回 ERP 首頁
              </Link>

              <p className="mt-4 text-sm font-bold text-sky-600">
                DeepNight ERP
              </p>

              <h1 className="mt-1 text-2xl font-black text-slate-900 md:text-3xl">
                員工薪資排序
              </h1>

              <p className="mt-2 text-sm text-slate-500">
                查看每位員工指定時間內的薪水，並依薪資升冪或降冪排序。
              </p>
            </div>

            <button
              onClick={loadAll}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-sky-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm shadow-sky-200 hover:bg-sky-600 disabled:opacity-60"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              重新整理
            </button>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <StatCard title="顯示員工" value={`${rows.length} 人`} />
          <StatCard title="訂單總數" value={`${totalOrderCount} 筆`} />
          <StatCard title="薪水總額" value={money(totalSalary)} />
        </section>

        <section className="rounded-[28px] border border-sky-100 bg-white p-5 shadow-sm shadow-sky-100">
          <div className="grid gap-4 md:grid-cols-5">
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

            <Field label="排序方式">
              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value)}
              >
                <option value="salary_desc">薪水降冪：高到低</option>
                <option value="salary_asc">薪水升冪：低到高</option>
                <option value="order_amount_desc">接單金額降冪</option>
                <option value="order_amount_asc">接單金額升冪</option>
                <option value="order_count_desc">訂單數降冪</option>
                <option value="order_count_asc">訂單數升冪</option>
                <option value="name_asc">名稱 A 到 Z</option>
                <option value="name_desc">名稱 Z 到 A</option>
              </select>
            </Field>

            <Field label="搜尋">
              <div className="flex items-center gap-2 rounded-xl border border-sky-100 bg-sky-50/60 px-3">
                <Search size={16} className="text-sky-500" />
                <input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="搜尋員工、Discord ID"
                  className="min-h-0 flex-1 border-none bg-transparent p-0 focus:shadow-none"
                />
              </div>
            </Field>

            <div className="flex items-end">
              <button
                onClick={loadAll}
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
              <Trophy size={20} className="text-sky-500" />
              員工薪水排行榜
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              目前顯示 {rows.length} 位員工，區間接單金額共{" "}
              {money(totalOrderAmount)}。
            </p>
          </div>

          {loading ? (
            <div className="px-5 py-12 text-center text-sm font-semibold text-slate-400">
              讀取中...
            </div>
          ) : rows.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm font-semibold text-slate-400">
              沒有符合條件的員工薪資資料
            </div>
          ) : (
            <div className="mobile-table-card overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>排名</th>
                    <th>員工</th>
                    <th>檔位</th>
                    <th>訂單數</th>
                    <th>接單金額</th>
                    <th>訂單薪資</th>
                    <th>訂單獎金</th>
                    <th>額外獎金</th>
                    <th>總薪水</th>
                    <th>未發薪</th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.staff.id}>
                      <td data-label="排名">
                        <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-sky-50 px-2 text-sm font-black text-sky-600">
                          {index + 1}
                        </span>
                      </td>

                      <td data-label="員工">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-sky-100 text-sky-600">
                            <StaffAvatar
                              avatarUrl={row.staff.avatar_url}
                              discordId={row.staff.discord_id}
                              alt={getDisplayName(row.staff)}
                              iconSize={20}
                            />
                          </div>

                          <div>
                            <p className="font-black text-slate-800">
                              {getDisplayName(row.staff)}
                            </p>
                            <p className="text-xs font-semibold text-slate-400">
                              {row.staff.discord_id}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td data-label="檔位">
                        {getCommissionTierLabel(row.staff.commission_tier)}
                      </td>

                      <td data-label="訂單數">{row.orderCount} 筆</td>

                      <td
                        data-label="接單金額"
                        className="font-bold text-slate-700"
                      >
                        {money(row.orderAmount)}
                      </td>

                      <td
                        data-label="訂單薪資"
                        className="font-bold text-sky-600"
                      >
                        {money(row.orderSalary)}
                      </td>

                      <td data-label="訂單獎金">{money(row.orderBonus)}</td>

                      <td data-label="額外獎金">{money(row.extraBonus)}</td>

                      <td
                        data-label="總薪水"
                        className="text-base font-black text-sky-700"
                      >
                        {money(row.totalSalary)}
                      </td>

                      <td
                        data-label="未發薪"
                        className="font-bold text-amber-600"
                      >
                        {money(row.unpaidSalary)}
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
