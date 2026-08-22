"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useState } from "react";
import { CalendarDays, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";

type LogRow = {
  id: number;
  category: "order" | "money" | "system";
  table_name: string;
  record_id: string | null;
  operation: "INSERT" | "UPDATE" | "DELETE";
  summary: string;
  actor_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_at: string;
};

const FIELD_LABELS: Record<string, string> = {
  status: "狀態", order_no: "訂單編號", order_id: "訂單 ID",
  discord_id: "Discord ID", user_id: "使用者 ID", staff_name: "員工姓名",
  customer_name: "客人姓名", service: "服務內容", service_name: "服務內容",
  amount: "金額", price: "原價", original_price: "折扣前金額",
  final_price: "實付金額", order_amount: "訂單金額", staff_salary: "員工薪資",
  salary_rate: "抽成比例", salary_level: "抽成說明", commission_tier: "指定抽成",
  bonus_amount: "訂單獎金", coins: "ASD 餘額", balance: "餘額",
  service_fee: "手續費", payout_amount: "實際入帳金額", welfare_fee: "福利金",
  discount_amount: "折扣金額", paid: "是否付款", paid_at: "付款時間",
  salary_paid: "是否發薪", salary_paid_at: "發薪時間", destination: "提領目的地",
  entry_type: "錢包項目", entry_label: "錢包說明", points: "客服點數",
  app_key: "所屬 ERP", reviewed_by: "審核人", reviewed_at: "審核時間",
  review_note: "審核備註", rejection_reason: "拒絕原因", note: "備註",
  order_finished_at: "訂單完成時間", requested_at: "申請時間",
};

const TABLE_LABELS: Record<string, string> = {
  play_orders: "深夜訂單", qiunai_salary_orders: "秋奈訂單",
  salary_wallet_entries: "薪資錢包", salary_withdraw_requests: "薪資提領",
  players_bonus: "深夜獎金／扣薪", qiunai_staff_bonus: "秋奈獎金／扣薪",
  customer_service_order_points: "客服服務點數", salary_activity_commission_settings: "活動抽成設定",
  players: "深夜員工", qiunai_staff: "秋奈員工", erp_role_assignments: "ERP 權限",
};

const HIDDEN_FIELDS = new Set([
  "id", "created_at", "updated_at", "edited_at", "deleted_at",
  "avatar_url", "bank_account", "bank_account_name", "bank_name",
]);

function taipeiToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(new Date(value));
}

function changedFields(row: LogRow) {
  const before = row.old_data || {};
  const after = row.new_data || {};
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => !HIDDEN_FIELDS.has(key))
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .sort((a, b) => {
      const aKnown = FIELD_LABELS[a] ? 0 : 1;
      const bKnown = FIELD_LABELS[b] ? 0 : 1;
      return aKnown - bKnown || a.localeCompare(b);
    });
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function AdminActivityLog({ organization }: { organization: "deepnight" | "qiunai" }) {
  const [date, setDate] = useState(taipeiToday());
  const [category, setCategory] = useState("all");
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("請重新登入");
      const response = await fetch(`/api/${organization}/activity-logs?date=${date}&category=${category}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.message || "讀取異動日誌失敗");
      setRows(payload.rows || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "讀取異動日誌失敗");
    } finally {
      setLoading(false);
    }
  }, [category, date, organization]);

  const loadRowsEffect = useEffectEvent(loadRows);
  useEffect(() => {
    const timer = window.setTimeout(() => { void loadRowsEffect(); }, 0);
    return () => window.clearTimeout(timer);
  }, [category, date]);

  const counts = useMemo(() => ({
    all: rows.length,
    order: rows.filter((row) => row.category === "order").length,
    money: rows.filter((row) => row.category === "money").length,
  }), [rows]);

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-800 sm:p-7">
      <div className="mx-auto max-w-6xl space-y-5">
        <header>
          <p className="text-xs font-black tracking-[0.2em] text-violet-500">DAILY AUDIT LOG</p>
          <h1 className="mt-2 text-2xl font-black">每日異動日誌</h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">訂單、薪資、提領與錢包餘額的新增、修改及刪除都會留下紀錄。</p>
        </header>

        <section className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[minmax(0,220px)_minmax(0,220px)_auto]">
          <label className="text-xs font-black text-slate-500">日期
            <span className="relative mt-2 block"><CalendarDays className="pointer-events-none absolute left-3 top-3 text-slate-400" size={17}/><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 font-bold outline-none focus:border-violet-400"/></span>
          </label>
          <label className="text-xs font-black text-slate-500">類型
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-bold outline-none focus:border-violet-400">
              <option value="all">全部</option><option value="order">訂單</option><option value="money">金錢</option><option value="system">系統</option>
            </select>
          </label>
          <button type="button" onClick={() => void loadRows()} disabled={loading} className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-black text-white disabled:opacity-50"><RefreshCw size={16}/>{loading ? "讀取中" : "重新整理"}</button>
        </section>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-2xl bg-white p-3 shadow-sm"><p className="text-xs font-bold text-slate-400">全部</p><p className="text-xl font-black">{counts.all}</p></div>
          <div className="rounded-2xl bg-white p-3 shadow-sm"><p className="text-xs font-bold text-slate-400">訂單</p><p className="text-xl font-black text-sky-600">{counts.order}</p></div>
          <div className="rounded-2xl bg-white p-3 shadow-sm"><p className="text-xs font-bold text-slate-400">金錢</p><p className="text-xl font-black text-emerald-600">{counts.money}</p></div>
        </div>

        {error ? <p className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-600">{error}</p> : null}
        {loading ? <div className="flex justify-center p-12"><Loader2 className="animate-spin text-violet-500"/></div> : rows.length === 0 ? <p className="rounded-3xl bg-white p-10 text-center font-bold text-slate-400">這一天尚無異動紀錄</p> : (
          <section className="space-y-3">
            {rows.map((row) => {
              const fields = changedFields(row);
              return <article key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <time className="font-mono text-xs font-black text-slate-500">{formatTime(row.changed_at)}</time>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-black ${row.category === "money" ? "bg-emerald-50 text-emerald-700" : row.category === "order" ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-600"}`}>{row.category === "money" ? "金錢" : row.category === "order" ? "訂單" : "系統"}</span>
                  <span className="rounded-full bg-violet-50 px-2 py-1 text-[11px] font-black text-violet-700">{row.operation === "INSERT" ? "新增" : row.operation === "UPDATE" ? "修改" : "刪除"}</span>
                  <strong className="text-sm">{TABLE_LABELS[row.table_name] || row.table_name}{row.record_id ? ` #${row.record_id}` : ""}</strong>
                </div>
                {row.actor_id ? <p className="mt-2 text-xs font-semibold text-slate-500">關聯帳號：{row.actor_id}</p> : null}
                {fields.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{fields.map((field) => <div key={field} className="rounded-xl bg-slate-50 px-3 py-2 text-xs"><span className="font-black text-slate-500">{FIELD_LABELS[field] || field}</span><p className="mt-1 break-all"><span className="text-red-500 line-through">{displayValue(row.old_data?.[field])}</span><span className="mx-2">→</span><span className="font-bold text-emerald-700">{displayValue(row.new_data?.[field])}</span></p></div>)}</div> : <p className="mt-3 text-xs font-semibold text-slate-400">沒有可顯示的業務欄位變更</p>}
              </article>;
            })}
          </section>
        )}
      </div>
    </main>
  );
}
