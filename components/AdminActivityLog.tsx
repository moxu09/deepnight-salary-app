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

const IMPORTANT_FIELDS = [
  "status", "order_no", "order_id", "discord_id", "user_id", "amount",
  "price", "final_price", "order_amount", "staff_salary", "salary_rate",
  "coins", "balance", "service_fee", "payout_amount", "discount_amount",
];

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
  return IMPORTANT_FIELDS.filter((key) => before[key] !== after[key] && (key in before || key in after));
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
                  <strong className="text-sm">{row.table_name}{row.record_id ? ` #${row.record_id}` : ""}</strong>
                </div>
                {row.actor_id ? <p className="mt-2 text-xs font-semibold text-slate-500">關聯帳號：{row.actor_id}</p> : null}
                {fields.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{fields.map((field) => <div key={field} className="rounded-xl bg-slate-50 px-3 py-2 text-xs"><span className="font-black text-slate-500">{field}</span><p className="mt-1 break-all"><span className="text-red-500 line-through">{displayValue(row.old_data?.[field])}</span><span className="mx-2">→</span><span className="font-bold text-emerald-700">{displayValue(row.new_data?.[field])}</span></p></div>)}</div> : null}
              </article>;
            })}
          </section>
        )}
      </div>
    </main>
  );
}
