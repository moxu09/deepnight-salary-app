"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, ClipboardCheck, Coins, FileSpreadsheet, FolderDown, Settings, UsersRound, WalletCards } from "lucide-react";
import { ERP_ROLE_LABELS } from "@/lib/erpRoles";
import { useErpAccess } from "@/lib/useErpAccess";

type AdminLink = { href: string; label: string; icon: typeof UsersRound };
const makeAdminLinks = (rankingPath: string): AdminLink[] => [
  { href: "/admin/staff", label: "員工管理", icon: UsersRound }, { href: "/admin/salary", label: "訂單總覽", icon: FileSpreadsheet },
  { href: "/admin/payroll", label: "發薪模式", icon: WalletCards }, { href: rankingPath, label: "薪資排序", icon: BarChart3 },
  { href: "/admin/approvals", label: "簽核申請", icon: ClipboardCheck }, { href: "/admin/files", label: "資料下載", icon: FolderDown },
  { href: "/admin/accounting", label: "會計報表", icon: Coins },
  { href: "/admin/settings", label: "系統設定", icon: Settings },
];

export default function AdminShell({ children, company, rankingPath, organization }: { children: React.ReactNode; company: string; rankingPath: string; organization: "deepnight" | "qiunai" }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, access } = useErpAccess(organization);
  const supportOnly = access?.role === "customer_service";
  const allowedPath = !supportOnly || pathname === "/admin/salary" || pathname.startsWith("/admin/salary/");
  const links = makeAdminLinks(rankingPath).filter((link) => !supportOnly || link.href === "/admin/salary");

  useEffect(() => {
    if (!loading && access && (!access.isAdmin || !allowedPath)) {
      router.replace(access.isAdmin ? "/admin/salary" : "/staff");
    }
  }, [access, allowedPath, loading, router]);

  if (loading || !access?.isAdmin || !allowedPath) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-100"><p className="rounded-2xl bg-white px-6 py-4 text-sm font-bold text-slate-500 shadow-sm">正在驗證 ERP 權限…</p></main>;
  }

  return <div className="admin-portal-shell min-h-screen bg-slate-100 lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
    <aside className="admin-portal-sidebar sticky top-0 z-50 overflow-x-auto bg-[#17202d] text-white lg:h-screen lg:overflow-y-auto">
      <Link href={supportOnly ? "/admin/salary" : "/admin"} className="admin-portal-brand hidden lg:block"><p className="text-xs font-bold tracking-[0.18em]">ERP</p><p className="mt-2 text-lg font-black">{company}</p><p className="mt-2 text-xs font-bold text-slate-400">{ERP_ROLE_LABELS[access.role as keyof typeof ERP_ROLE_LABELS]}</p></Link>
      <nav className="admin-portal-nav flex min-w-max lg:min-w-0 lg:flex-col">{links.map(({ href, label, icon: Icon }) => { const active = pathname === href || pathname.startsWith(`${href}/`); return <Link key={href} href={href} className={`admin-portal-link flex items-center gap-3 text-sm font-bold transition ${active ? "is-active" : ""}`}><Icon size={18}/><span>{label}</span></Link>; })}</nav>
    </aside>
    <div className="admin-portal-content min-w-0 overflow-x-hidden">{children}</div>
  </div>;
}
