"use client";

import { BadgeCheck, BriefcaseBusiness, ChevronDown, ClipboardCheck, Coins, FileText, Gift, HandCoins, HeartHandshake, ReceiptText, UserRound, WalletCards } from "lucide-react";

export type PortalTab = "profile" | "admin-service" | "welfare" | "orders" | "tips" | "bonuses" | "deductions" | "approval-administrative" | "approval-reimbursement" | "approval-welfare" | "approval-leave" | "approval-suspension";

const groups = [
  { title: "人事", icon: UserRound, items: [["profile", "個人資料", UserRound], ["admin-service", "行政服務申請", FileText], ["welfare", "福利申請", HeartHandshake]] },
  { title: "訂單", icon: BriefcaseBusiness, items: [["orders", "訂單明細", ReceiptText], ["tips", "打賞明細", HandCoins], ["bonuses", "獎金明細", Gift], ["deductions", "薪資扣項", Coins]] },
  { title: "簽核", icon: ClipboardCheck, items: [["approval-administrative", "行政服務簽核", BadgeCheck], ["approval-reimbursement", "報銷簽核", WalletCards], ["approval-welfare", "福利簽核", HeartHandshake], ["approval-leave", "請假單簽核", FileText], ["approval-suspension", "留職停薪簽核", ClipboardCheck]] },
] as const;

export default function StaffPortalNav({ activeTab, onSelect, employeeName, company }: { activeTab: PortalTab; onSelect: (tab: PortalTab) => void; employeeName: string; company: string }) {
  return <aside className="staff-portal-sidebar sticky top-0 z-20 self-start overflow-x-auto bg-[#17202d] text-white lg:h-screen lg:overflow-y-auto">
    <div className="staff-portal-brand hidden lg:block"><p className="text-xs font-semibold tracking-[0.2em]">STAFF CENTER</p><p className="mt-2 text-xl font-black">{company}</p><p className="mt-1 truncate text-sm">{employeeName}</p></div>
    <nav className="staff-portal-nav flex min-w-max lg:min-w-0 lg:flex-col">
      {groups.map(({ title, icon: GroupIcon, items }) => <section key={title} className="staff-portal-group">
        <p className="staff-portal-group-title flex items-center gap-2 text-xs font-black tracking-[0.18em]"><GroupIcon size={15}/>{title}<ChevronDown size={13} className="ml-auto hidden lg:block"/></p>
        <div className="flex lg:flex-col">{items.map(([tab, label, Icon]) => <button key={tab} type="button" onClick={() => { onSelect(tab); window.scrollTo({ top: 0, behavior: "smooth" }); }} className={`staff-portal-link flex items-center gap-3 text-left text-sm font-bold transition ${activeTab === tab ? "is-active" : ""}`}><Icon size={17}/><span>{label}</span></button>)}</div>
      </section>)}
    </nav>
  </aside>;
}
