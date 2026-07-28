"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Building2,
  ClipboardCheck,
  Coins,
  FileSpreadsheet,
  FolderDown,
  Settings,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { ERP_ROLE_LABELS } from "@/lib/erpRoles";
import { useErpAccess } from "@/lib/useErpAccess";

const ERP_OWNER_DISCORD_ID = "847840193859682304";

type Organization = "deepnight" | "qiunai";
type AdminLink = {
  href: string;
  label: string;
  icon: typeof UsersRound;
};

const SECTIONS = [
  { key: "staff", label: "員工管理", icon: UsersRound },
  { key: "salary", label: "訂單總覽", icon: FileSpreadsheet },
  { key: "payroll", label: "發薪模式", icon: WalletCards },
  { key: "ranking", label: "薪資排序", icon: BarChart3 },
  { key: "approvals", label: "簽核申請", icon: ClipboardCheck },
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
  const salaryHref = sectionHref(currentOrganization, "salary");
  const allowedPath =
    !supportOnly ||
    pathname === salaryHref ||
    pathname.startsWith(`${salaryHref}/`);
  const links = makeAdminLinks(currentOrganization).filter(
    (link) => !supportOnly || link.href === salaryHref,
  );
  const owner = access?.discordId === ERP_OWNER_DISCORD_ID;
  const company =
    currentOrganization === "qiunai" ? "秋奈電競" : "深夜不關燈";

  useEffect(() => {
    if (!loading && access && (!access.isAdmin || !allowedPath)) {
      router.replace(access.isAdmin ? salaryHref : "/staff");
    }
  }, [access, allowedPath, loading, router, salaryHref]);

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
          href={owner && !supportOnly ? "/admin" : salaryHref}
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
            return (
              <Link
                key={href}
                href={href}
                className={`admin-portal-link flex items-center gap-3 text-sm font-bold transition ${
                  active ? "is-active" : ""
                }`}
              >
                <Icon size={18} />
                <span>{label}</span>
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
