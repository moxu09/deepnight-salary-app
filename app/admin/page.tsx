"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Building2,
  ClipboardCheck,
  Coins,
  Cpu,
  FileSpreadsheet,
  FolderDown,
  Loader2,
  MoonStar,
  RefreshCw,
  Settings,
  Sparkles,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { useErpAccess } from "@/lib/useErpAccess";
import { supabase } from "@/lib/supabase";

const ERP_OWNER_DISCORD_ID = "847840193859682304";

type DepartmentSummary = {
  activeStaff: number;
  orderCount: number;
  revenue: number;
  salary: number;
  bonus: number;
  unpaid: number;
};

type OverviewData = {
  month: string;
  combined: DepartmentSummary;
  departments: {
    deepnight: DepartmentSummary;
    qiunai: DepartmentSummary;
  };
};

const EMPTY_SUMMARY: DepartmentSummary = {
  activeStaff: 0,
  orderCount: 0,
  revenue: 0,
  salary: 0,
  bonus: 0,
  unpaid: 0,
};

const SECTIONS = [
  { key: "staff", label: "員工管理", icon: UsersRound },
  { key: "salary", label: "訂單總覽", icon: FileSpreadsheet },
  { key: "payroll", label: "發薪模式", icon: WalletCards },
  { key: "ranking", label: "薪資排序", icon: BarChart3 },
  { key: "approvals", label: "簽核申請", icon: ClipboardCheck },
  { key: "device-audit", label: "電腦稽核", icon: Cpu },
  { key: "files", label: "資料下載", icon: FolderDown },
  { key: "accounting", label: "會計報表", icon: Coins },
  { key: "settings", label: "系統設定", icon: Settings },
] as const;

function money(value: number) {
  return `NT$${Math.round(Number(value || 0)).toLocaleString("zh-TW")}`;
}

function monthLabel(value: string) {
  const [year, month] = value.split("-");
  return year && month ? `${year} 年 ${Number(month)} 月` : "本月";
}

export default function AdminHomePage() {
  const { loading, access } = useErpAccess("deepnight");
  const owner = access?.discordId === ERP_OWNER_DISCORD_ID;
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [error, setError] = useState("");

  const loadOverview = useCallback(async () => {
    if (!owner) return;
    setOverviewLoading(true);
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("共同後台登入已過期");
      const response = await fetch("/api/common-admin/overview", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || "讀取共同後台總覽失敗");
      }
      setOverview(payload as OverviewData);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "讀取共同後台總覽失敗",
      );
    } finally {
      setOverviewLoading(false);
    }
  }, [owner]);

  useEffect(() => {
    if (loading || !owner) return;
    const timer = window.setTimeout(() => {
      void loadOverview();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadOverview, loading, owner]);

  if (loading || !access?.isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="rounded-2xl bg-white px-6 py-4 text-sm font-bold text-slate-500 shadow-sm">
          正在載入共同 ERP 後台…
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-pink-50 p-5 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <section className="rounded-[32px] border border-white bg-white/90 p-7 shadow-xl shadow-slate-200/60 sm:p-10">
          <p className="flex items-center gap-2 text-sm font-black tracking-[0.16em] text-slate-500">
            <Building2 size={18} />
            WE ARE STILL HERE
          </p>
          <h1 className="mt-3 text-3xl font-black text-slate-900 sm:text-4xl">
            共同 ERP 後台
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
            不用切換部門，同一頁同時查看兩家合計與各部門資料。
          </p>
          {owner ? (
            <button
              type="button"
              onClick={() => void loadOverview()}
              disabled={overviewLoading}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-black text-white transition hover:bg-slate-700 disabled:opacity-50"
            >
              {overviewLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <RefreshCw size={16} />
              )}
              重新整理
            </button>
          ) : null}
        </section>

        {owner ? (
          <>
            {error ? (
              <p className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-bold text-rose-700">
                {error}
              </p>
            ) : null}

            <SummarySection
              title="兩家合併"
              subtitle={`${monthLabel(overview?.month || "")}共同營運數據`}
              summary={overview?.combined || EMPTY_SUMMARY}
              color="violet"
              icon={Building2}
              loading={overviewLoading && !overview}
            />

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <DepartmentSection
                organization="deepnight"
                title="深夜不關燈"
                summary={overview?.departments.deepnight || EMPTY_SUMMARY}
                icon={MoonStar}
                color="sky"
                loading={overviewLoading && !overview}
              />
              <DepartmentSection
                organization="qiunai"
                title="秋奈電競"
                summary={overview?.departments.qiunai || EMPTY_SUMMARY}
                icon={Sparkles}
                color="pink"
                loading={overviewLoading && !overview}
              />
            </div>
          </>
        ) : (
          <DepartmentSection
            organization="deepnight"
            title="深夜不關燈"
            summary={EMPTY_SUMMARY}
            icon={MoonStar}
            color="sky"
            loading={false}
            hideSummary
          />
        )}
      </div>
    </main>
  );
}

function SummarySection({
  title,
  subtitle,
  summary,
  icon,
  color,
  loading,
}: {
  title: string;
  subtitle: string;
  summary: DepartmentSummary;
  icon: LucideIcon;
  color: "violet" | "sky" | "pink";
  loading: boolean;
}) {
  const Icon = icon;
  const styles = {
    violet: "border-violet-200 bg-violet-50/80 text-violet-800",
    sky: "border-sky-200 bg-sky-50/80 text-sky-800",
    pink: "border-pink-200 bg-pink-50/80 text-pink-800",
  }[color];

  return (
    <section className={`mt-6 rounded-[30px] border p-6 ${styles}`}>
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
          <Icon size={25} />
        </span>
        <div>
          <h2 className="text-2xl font-black">{title}</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">{subtitle}</p>
        </div>
      </div>
      <SummaryGrid summary={summary} loading={loading} />
    </section>
  );
}

function DepartmentSection({
  organization,
  title,
  summary,
  icon,
  color,
  loading,
  hideSummary = false,
}: {
  organization: "deepnight" | "qiunai";
  title: string;
  summary: DepartmentSummary;
  icon: LucideIcon;
  color: "sky" | "pink";
  loading: boolean;
  hideSummary?: boolean;
}) {
  const Icon = icon;
  const sectionHref = (section: (typeof SECTIONS)[number]["key"]) => {
    if (organization === "qiunai") {
      return `/admin/department/qiunai/${section}`;
    }
    if (section === "ranking") return "/admin/salary-rank";
    return `/admin/${section}`;
  };
  const styles =
    color === "pink"
      ? "border-pink-200 bg-pink-50/70 text-pink-800"
      : "border-sky-200 bg-sky-50/70 text-sky-800";

  return (
    <section className={`rounded-[30px] border p-6 ${styles}`}>
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
          <Icon size={25} />
        </span>
        <h2 className="text-2xl font-black">{title}</h2>
      </div>

      {!hideSummary ? (
        <SummaryGrid summary={summary} loading={loading} compact />
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4">
        {SECTIONS.map(({ key, label, icon: SectionIcon }) => (
          <Link
            key={key}
            href={sectionHref(key)}
            className="flex items-center gap-2 rounded-2xl border border-white/80 bg-white/90 px-3 py-3 text-xs font-black text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <SectionIcon size={16} />
            {label}
          </Link>
        ))}
      </div>
    </section>
  );
}

function SummaryGrid({
  summary,
  loading,
  compact = false,
}: {
  summary: DepartmentSummary;
  loading: boolean;
  compact?: boolean;
}) {
  const rows = [
    ["在職員工", `${summary.activeStaff.toLocaleString("zh-TW")} 人`],
    ["本月訂單", `${summary.orderCount.toLocaleString("zh-TW")} 筆`],
    ["本月營收", money(summary.revenue)],
    ["訂單薪資", money(summary.salary)],
    ["獎金", money(summary.bonus)],
    ["待發金額", money(summary.unpaid)],
  ];

  return (
    <div
      className={`mt-5 grid gap-3 ${
        compact ? "grid-cols-2 2xl:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-3"
      }`}
    >
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="rounded-2xl border border-white/80 bg-white/90 px-4 py-4 shadow-sm"
        >
          <p className="text-xs font-black text-slate-500">{label}</p>
          <p className="mt-2 text-xl font-black text-slate-900">
            {loading ? "讀取中…" : value}
          </p>
        </div>
      ))}
    </div>
  );
}
