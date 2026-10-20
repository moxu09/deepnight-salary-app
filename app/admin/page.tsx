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
  Search,
  ArrowUpRight,
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
  unwithdrawn: number;
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
  unwithdrawn: 0,
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

function adminSectionHref(organization: "deepnight" | "qiunai", section: (typeof SECTIONS)[number]["key"]) {
  if (organization === "qiunai") return `/admin/department/qiunai/${section}`;
  if (section === "ranking") return "/admin/salary-rank";
  return `/admin/${section}`;
}

export default function AdminHomePage() {
  const { loading, access } = useErpAccess("deepnight");
  const owner = access?.discordId === ERP_OWNER_DISCORD_ID;
  const [appQuery, setAppQuery] = useState("");
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
          正在載入共同 EIP 後台…
        </p>
      </main>
    );
  }

  const roleSections = access.role === "customer_service"
    ? SECTIONS.filter(({ key }) => key === "salary")
    : access.role === "audit_reviewer"
      ? SECTIONS.filter(({ key }) => key === "device-audit")
      : SECTIONS;
  const searchableApps = (owner
    ? (["deepnight", "qiunai"] as const)
    : (["deepnight"] as const)
  ).flatMap((organization) => roleSections
    .map((section) => ({
      ...section,
      organization,
      href: adminSectionHref(organization, section.key),
    })));
  const filteredApps = searchableApps.filter((app) =>
    !appQuery.trim() ||
    `${app.organization === "qiunai" ? "秋奈電競" : "深夜不關燈"} ${app.label}`
      .toLocaleLowerCase("zh-TW")
      .includes(appQuery.trim().toLocaleLowerCase("zh-TW")),
  );

  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-pink-50 p-5 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <section className="relative overflow-hidden rounded-[30px] bg-gradient-to-r from-[#173a5c] via-[#28577b] to-[#587a98] p-7 text-white shadow-xl shadow-slate-200/60 sm:p-10">
          <div className="pointer-events-none absolute -right-16 -top-28 h-80 w-80 rounded-full border border-white/15 shadow-[0_0_0_55px_rgba(255,255,255,0.045),0_0_0_110px_rgba(255,255,255,0.025)]" />
          <p className="relative flex items-center gap-2 text-xs font-black tracking-[0.16em] text-sky-100/80">
            <Building2 size={18} />
            WE ARE STILL HERE · MANAGER WORKSPACE
          </p>
          <h1 className="relative mt-4 text-3xl font-black sm:text-4xl">
            管理工作台
          </h1>
          <p className="relative mt-3 max-w-2xl text-sm leading-7 text-sky-50/80">
            {owner ? "深夜與秋奈的營運概況、常用系統入口都集中在這裡。" : "快速進入你有權使用的管理功能。"}
          </p>
          {owner ? (
            <button
              type="button"
              onClick={() => void loadOverview()}
              disabled={overviewLoading}
              className="relative mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-black text-[#173a5c] transition hover:bg-sky-50 disabled:opacity-50"
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

        <section className="mt-6 rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/70">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-black tracking-[0.16em] text-sky-600">APPLICATIONS</p>
              <h2 className="mt-1 text-xl font-black text-slate-900">我的應用</h2>
            </div>
            <label className="flex min-w-[220px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-400 focus-within:ring-2 focus-within:ring-sky-500">
              <Search size={16} />
              <span className="sr-only">搜尋管理功能</span>
              <input
                value={appQuery}
                onChange={(event) => setAppQuery(event.target.value)}
                placeholder="搜尋部門或功能"
                className="w-full bg-transparent text-sm text-slate-800 outline-none"
              />
            </label>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredApps.map(({ key, label, icon: Icon, organization, href }) => (
              <Link
                key={`${organization}-${key}`}
                href={href}
                className="group flex min-h-24 items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md"
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${organization === "qiunai" ? "bg-pink-50 text-pink-600" : "bg-sky-50 text-sky-600"}`}>
                  <Icon size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <small className="text-[11px] font-bold text-slate-400">{organization === "qiunai" ? "秋奈電競" : "深夜不關燈"}</small>
                  <strong className="mt-1 block text-sm font-black text-slate-800">{label}</strong>
                </span>
                <ArrowUpRight size={15} className="shrink-0 text-slate-300 transition group-hover:text-sky-600" />
              </Link>
            ))}
          </div>
          {!filteredApps.length ? <p className="mt-5 text-sm text-slate-500">找不到符合的功能。</p> : null}
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
            sections={roleSections}
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
  sections = SECTIONS,
}: {
  organization: "deepnight" | "qiunai";
  title: string;
  summary: DepartmentSummary;
  icon: LucideIcon;
  color: "sky" | "pink";
  loading: boolean;
  hideSummary?: boolean;
  sections?: ReadonlyArray<(typeof SECTIONS)[number]>;
}) {
  const Icon = icon;
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
        {sections.map(({ key, label, icon: SectionIcon }) => (
          <Link
            key={key}
            href={adminSectionHref(organization, key)}
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
    ["尚未提領總金額", money(summary.unwithdrawn)],
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
