"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Building2,
  ClipboardCheck,
  Coins,
  Cpu,
  FileSpreadsheet,
  FolderDown,
  Settings,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { ERP_ROLE_LABELS } from "@/lib/erpRoles";
import { supabase } from "@/lib/supabase";
import { useErpAccess } from "@/lib/useErpAccess";

const ERP_OWNER_DISCORD_ID = "847840193859682304";

type Organization = "deepnight" | "qiunai";
type AdminLink = {
  href: string;
  label: string;
  icon: typeof UsersRound;
};

type NotificationCounts = {
  payroll: number;
  approvals: number;
};

const EMPTY_NOTIFICATION_COUNTS: NotificationCounts = {
  payroll: 0,
  approvals: 0,
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

function organizationFromPath(pathname: string): Organization {
  return pathname.startsWith("/admin/department/qiunai")
    ? "qiunai"
    : "deepnight";
}

function sectionHref(organization: Organization, section: string) {
  if (organization === "qiunai") {
    return `/admin/department/qiunai/${section}`;
  }
  if (section === "ranking") return "/admin/salary-rank";
  return `/admin/${section}`;
}

function makeAdminLinks(organization: Organization): AdminLink[] {
  return SECTIONS.map(({ key, label, icon }) => ({
    href: sectionHref(organization, key),
    label,
    icon,
  }));
}

export default function AdminShell({
  children,
}: {
  children: React.ReactNode;
  company: string;
  rankingPath: string;
  organization: "deepnight" | "qiunai";
}) {
  const pathname = usePathname();
  const router = useRouter();
  const currentOrganization = organizationFromPath(pathname);
  const { loading, access } = useErpAccess(currentOrganization);
  const supportOnly = access?.role === "customer_service";
  const auditOnly = access?.role === "audit_reviewer";
  const salaryHref = sectionHref(currentOrganization, "salary");
  const deviceAuditHref = sectionHref(currentOrganization, "device-audit");
  const fallbackHref = auditOnly ? deviceAuditHref : salaryHref;
  const allowedPath =
    (!supportOnly && !auditOnly) ||
    (supportOnly &&
      (pathname === salaryHref || pathname.startsWith(`${salaryHref}/`))) ||
    (auditOnly &&
      (pathname === deviceAuditHref ||
        pathname.startsWith(`${deviceAuditHref}/`)));
  const links = makeAdminLinks(currentOrganization).filter(
    (link) =>
      (!supportOnly && !auditOnly) ||
      (supportOnly && link.href === salaryHref) ||
      (auditOnly && link.href === deviceAuditHref),
  );
  const owner = access?.discordId === ERP_OWNER_DISCORD_ID;
  const company =
    currentOrganization === "qiunai" ? "秋奈電競" : "深夜不關燈";
  const [notificationCounts, setNotificationCounts] = useState(
    EMPTY_NOTIFICATION_COUNTS,
  );

  const loadNotificationCounts = useCallback(async () => {
    if (loading || !access?.isAdmin || supportOnly || auditOnly) {
      setNotificationCounts(EMPTY_NOTIFICATION_COUNTS);
      return;
    }

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;

    const response = await fetch(
      `/api/${currentOrganization}/admin-notifications`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) return;

    setNotificationCounts({
      payroll: Number(payload.payroll || 0),
      approvals: Number(payload.approvals || 0),
    });
  }, [access?.isAdmin, auditOnly, currentOrganization, loading, supportOnly]);

  useEffect(() => {
    if (!loading && access && (!access.isAdmin || !allowedPath)) {
      router.replace(access.isAdmin ? fallbackHref : "/staff");
    }
  }, [access, allowedPath, fallbackHref, loading, router]);

  useEffect(() => {
    if (loading || !access?.isAdmin || supportOnly || auditOnly) return;

    const refresh = () => void loadNotificationCounts();
    refresh();
    const intervalId = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("erp-notifications-changed", refresh);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("erp-notifications-changed", refresh);
    };
  }, [access?.isAdmin, auditOnly, loadNotificationCounts, loading, supportOnly]);

  if (loading || !access?.isAdmin || !allowedPath) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="rounded-2xl bg-white px-6 py-4 text-sm font-bold text-slate-500 shadow-sm">
          正在驗證共同 ERP 權限…
        </p>
      </main>
    );
  }

  return (
    <div className="admin-portal-shell min-h-screen bg-slate-100 lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="admin-portal-sidebar sticky top-0 z-50 overflow-x-auto bg-[#17202d] text-white lg:h-screen lg:overflow-y-auto">
        <Link
          href={owner && !supportOnly && !auditOnly ? "/admin" : fallbackHref}
          className="admin-portal-brand hidden lg:block"
        >
          <p className="text-xs font-bold tracking-[0.18em]">共同 ERP 後台</p>
          <p className="mt-2 text-lg font-black">{company}</p>
          <p className="mt-2 text-xs font-bold text-slate-400">
            {ERP_ROLE_LABELS[access.role as keyof typeof ERP_ROLE_LABELS]}
          </p>
        </Link>

        {owner ? (
          <div className="mx-3 mb-3 mt-3 rounded-2xl border border-slate-700 bg-slate-800/80 p-2 lg:mt-0">
            <Link
              href="/admin"
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black transition ${
                pathname === "/admin"
                  ? "bg-violet-500 text-white"
                  : "text-slate-300 hover:bg-slate-700"
              }`}
            >
              <Building2 size={14} />
              兩家合併總覽
            </Link>
          </div>
        ) : null}

        <nav className="admin-portal-nav flex min-w-max lg:min-w-0 lg:flex-col">
          {links.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href || pathname.startsWith(`${href}/`);
            const notificationCount = href.endsWith("/payroll")
              ? notificationCounts.payroll
              : href.endsWith("/approvals")
                ? notificationCounts.approvals
                : 0;
            return (
              <Link
                key={href}
                href={href}
                className={`admin-portal-link flex items-center gap-3 text-sm font-bold transition ${
                  active ? "is-active" : ""
                }`}
              >
                <Icon size={18} />
                <span className="min-w-0 flex-1">{label}</span>
                {notificationCount > 0 ? (
                  <span
                    aria-label={`${label}有 ${notificationCount} 筆待處理`}
                    className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-black leading-none text-white shadow-sm shadow-red-950/30"
                  >
                    {notificationCount > 99 ? "99+" : notificationCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="admin-portal-content min-w-0 overflow-x-hidden">
        {children}
      </div>
    </div>
  );
}
