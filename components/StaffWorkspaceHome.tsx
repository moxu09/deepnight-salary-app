"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BellRing,
  CalendarDays,
  ClipboardCheck,
  FileText,
  HeartHandshake,
  ListTodo,
  Megaphone,
  MessageSquareText,
  Pin,
  PinOff,
  ReceiptText,
  Search,
  Sparkles,
  UserRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import type { PortalTab } from "@/components/StaffPortalNav";

type Organization = "qiunai" | "deepnight";
type WorkApp = {
  tab: PortalTab;
  label: string;
  description: string;
  category: string;
  icon: LucideIcon;
};

const BASE_APPS: WorkApp[] = [
  { tab: "activities", label: "活動報名", description: "回覆活動、查看場次與報名狀態", category: "協作", icon: CalendarDays },
  { tab: "downloads", label: "App 下載", description: "下載所屬店家的員工端安裝包", category: "資源", icon: FileText },
  { tab: "messages", label: "員工訊息", description: "聯絡同事並查看一對一對話", category: "協作", icon: MessageSquareText },
  { tab: "profile", label: "個人資料", description: "查看資料、薪資錢包與設定", category: "人事", icon: UserRound },
  { tab: "orders", label: "訂單明細", description: "查看本月訂單與薪資", category: "訂單", icon: ReceiptText },
  { tab: "tips", label: "打賞明細", description: "查看收到的打賞紀錄", category: "訂單", icon: Sparkles },
  { tab: "admin-service", label: "行政服務", description: "提出行政需求與查詢進度", category: "人事", icon: FileText },
  { tab: "welfare", label: "福利申請", description: "查看及申請員工福利", category: "人事", icon: HeartHandshake },
  { tab: "approval-reimbursement", label: "報銷簽核", description: "處理報銷申請", category: "簽核", icon: WalletCards },
  { tab: "approval-leave", label: "請假簽核", description: "查看請假申請狀態", category: "簽核", icon: ClipboardCheck },
];

type RecentOrder = {
  id: string;
  service: string;
  status: string;
  amount: number;
  date: string;
};

export type WorkspaceFeed = {
  error?: boolean;
  announcements: Array<{ id: string; title: string; created_at?: string | null; requires_signature?: boolean; signature_deadline?: string | null; signature?: { status: string } | null }>;
  requests: Array<{ id: string; request_type: string; approval_category: string; status: string; needed_date?: string | null; application_date?: string | null }>;
};

type Props = {
  organization: Organization;
  employeeId: string;
  employeeName: string;
  month: string;
  orderCount: number;
  salary: number;
  unpaid: number;
  walletAvailable: number | null;
  pendingWithdrawalCount: number;
  recentOrders: RecentOrder[];
  feed: WorkspaceFeed | null;
  onSelect: (tab: PortalTab) => void;
};

const money = (value: number) => `NT$${Math.round(value).toLocaleString("zh-TW")}`;
const REQUEST_TABS: Record<string, PortalTab> = {
  administrative: "approval-administrative",
  reimbursement: "approval-reimbursement",
  welfare: "approval-welfare",
  leave: "approval-leave",
  suspension: "approval-suspension",
};
const requestTab = (category: string): PortalTab => REQUEST_TABS[category] || "approval-administrative";

export default function StaffWorkspaceHome({
  organization,
  employeeId,
  employeeName,
  month,
  orderCount,
  salary,
  unpaid,
  walletAvailable,
  pendingWithdrawalCount,
  recentOrders,
  feed,
  onSelect,
}: Props) {
  const apps = useMemo(() => BASE_APPS, []);
  const appIds = useMemo(() => new Set(apps.map((app) => app.tab)), [apps]);
  const storageKey = `eip-workspace-pins:v1:${organization}:${employeeId}`;
  const [pinned, setPinned] = useState<PortalTab[]>(["orders", "profile", "approval-leave"]);
  const [query, setQuery] = useState("");
  const [currentTime, setCurrentTime] = useState<number | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setCurrentTime(Date.now()), 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = JSON.parse(window.localStorage.getItem(storageKey) || "null");
        if (Array.isArray(saved)) {
          setPinned(saved.filter((tab): tab is PortalTab => typeof tab === "string" && appIds.has(tab as PortalTab)));
        } else {
          setPinned(["orders", "profile", "approval-leave"]);
        }
      } catch {
        setPinned(["orders", "profile", "approval-leave"]);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [appIds, organization, storageKey]);

  const normalizedQuery = query.trim().toLocaleLowerCase("zh-TW");
  const visibleApps = apps.filter((app) =>
    !normalizedQuery ||
    [app.label, app.description, app.category].some((text) =>
      text.toLocaleLowerCase("zh-TW").includes(normalizedQuery),
    ),
  );
  const pinnedApps = apps.filter((app) => pinned.includes(app.tab));
  const feedReady = feed !== null && !feed.error;
  const announcements = feed?.announcements || [];
  const pendingSignatures = announcements.filter((item) => item.requires_signature && item.signature?.status !== "signed");
  const pendingRequests = (feed?.requests || []).filter((item) => item.status === "pending");
  const actionCount = pendingSignatures.length;
  const searchAnnouncements = normalizedQuery ? announcements.filter((item) => item.title.toLocaleLowerCase("zh-TW").includes(normalizedQuery)).slice(0, 4) : [];
  const searchOrders = normalizedQuery ? recentOrders.filter((item) => [item.service, item.status, item.id].some((value) => value.toLocaleLowerCase("zh-TW").includes(normalizedQuery))).slice(0, 4) : [];
  const timeline = [
    ...pendingSignatures.filter((item) => item.signature_deadline).map((item) => ({ id: `sign-${item.id}`, title: item.title, date: item.signature_deadline!, type: "公告簽署", tab: "profile" as PortalTab })),
    ...pendingRequests.filter((item) => item.needed_date).map((item) => ({ id: `request-${item.id}`, title: item.request_type, date: item.needed_date!, type: "申請需求日", tab: requestTab(item.approval_category) })),
  ].filter((item) => Number.isFinite(new Date(item.date).getTime()) && (currentTime === null || new Date(item.date).getTime() >= currentTime - 86400000))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(0, 5);
  const dateText = (date: string) => new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(date));

  function select(tab: PortalTab) {
    onSelect(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function togglePin(tab: PortalTab) {
    const next = pinned.includes(tab)
      ? pinned.filter((item) => item !== tab)
      : [...pinned, tab];
    setPinned(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Private-browsing storage can be unavailable; the current session still works.
    }
  }

  return (
    <div className={`eip-workbench ${organization === "qiunai" ? "eip-workbench-qiunai" : "eip-workbench-deepnight"}`}>
      <section className="eip-workbench-hero">
        <div>
          <p className="eip-workbench-eyebrow"><Sparkles size={15} /> MY WORKSPACE · 員工工作台</p>
          <h2>歡迎回來，{employeeName}</h2>
          <p>待辦、公告、日程與常用工作，集中在你的工作台。</p>
          <div className="eip-workbench-hero-actions">
            <button type="button" onClick={() => select("orders")}>查看訂單 <ArrowRight size={16} /></button>
            <button type="button" onClick={() => select("profile")}>我的資料</button>
          </div>
        </div>
        <div className="eip-workbench-hero-mark" aria-hidden="true"><span>WORK</span><strong>SPACE</strong></div>
      </section>

      <section className="eip-workbench-stats" aria-label="個人概況">
        <Stat label={`${month.replace("-", " / ")} 訂單`} value={`${orderCount} 筆`} hint="依目前查詢月份" />
        <Stat label="月份薪資" value={money(salary)} hint="依目前查詢月份" />
        <Stat label="尚未入帳" value={money(unpaid)} hint="以既有薪資資料計算" />
        <Stat label="可提領餘額" value={walletAvailable === null ? "讀取中" : money(walletAvailable)} hint={pendingWithdrawalCount > 0 ? `${pendingWithdrawalCount} 筆提領待審` : "薪資錢包"} />
      </section>

      <div className="eip-workbench-columns">
        <div className="eip-workbench-main">
          <section className="eip-workbench-panel">
            <div className="eip-workbench-section-heading">
              <div><p>ACTION CENTER</p><h3><ListTodo size={19} /> 我的工作</h3></div>
              <span>{feed === null ? "同步中" : feed.error ? "讀取失敗" : `${actionCount} 件待處理`}</span>
            </div>
            <div className="eip-workbench-action-grid">
              <button type="button" onClick={() => select("profile")}><BellRing size={19} /><strong>{feedReady ? pendingSignatures.length : "—"}</strong><span>待簽公告</span></button>
              <button type="button" onClick={() => select(requestTab(pendingRequests[0]?.approval_category || "administrative"))}><ClipboardCheck size={19} /><strong>{feedReady ? pendingRequests.length : "—"}</strong><span>處理中申請</span></button>
            </div>
            {pendingSignatures.length || pendingRequests.length ? (
              <div className="eip-workbench-action-list">
                {pendingSignatures.slice(0, 2).map((item) => <button type="button" key={item.id} onClick={() => select("profile")}><span>待簽公告</span><strong>{item.title}</strong><ArrowRight size={15} /></button>)}
                {pendingRequests.slice(0, 2).map((item) => <button type="button" key={item.id} onClick={() => select(requestTab(item.approval_category))}><span>處理中申請</span><strong>{item.request_type}</strong><ArrowRight size={15} /></button>)}
              </div>
            ) : feed?.error ? <p className="eip-workbench-empty">工作資料暫時讀取失敗，請稍後重新整理。</p> : feedReady ? <p className="eip-workbench-empty">目前沒有需要立即處理的事項。</p> : null}
          </section>
          <section className="eip-workbench-panel">
            <div className="eip-workbench-section-heading">
              <div><p>YOUR FAVORITES</p><h3>常用入口</h3></div>
              <span>點選圖釘可調整</span>
            </div>
            {pinnedApps.length ? (
              <div className="eip-workbench-app-grid">
                {pinnedApps.map((app) => <AppCard key={app.tab} app={app} pinned onOpen={select} onPin={togglePin} />)}
              </div>
            ) : <p className="eip-workbench-empty">尚未固定入口，可從下方應用清單加入。</p>}
          </section>

          <section className="eip-workbench-panel">
            <div className="eip-workbench-section-heading">
              <div><p>SEARCH & APPLICATIONS</p><h3>搜尋與應用</h3></div>
              <span>{apps.length} 個功能</span>
            </div>
            <label className="eip-workbench-search">
              <Search size={17} />
              <span className="sr-only">搜尋應用、公告與最近訂單</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋應用、公告、最近訂單…" />
            </label>
            {normalizedQuery && (searchAnnouncements.length > 0 || searchOrders.length > 0) ? <div className="eip-workbench-search-results">
              {searchAnnouncements.map((item) => <button type="button" key={item.id} onClick={() => select("profile")}><Megaphone size={15} /><span>公告 · {item.title}</span><ArrowRight size={14} /></button>)}
              {searchOrders.map((item) => <button type="button" key={item.id} onClick={() => select("orders")}><ReceiptText size={15} /><span>訂單 · {item.service || item.id}</span><ArrowRight size={14} /></button>)}
            </div> : null}
            <div className="eip-workbench-app-grid">
              {visibleApps.map((app) => <AppCard key={app.tab} app={app} pinned={pinned.includes(app.tab)} onOpen={select} onPin={togglePin} />)}
            </div>
            {!visibleApps.length && !searchAnnouncements.length && !searchOrders.length ? <p className="eip-workbench-empty">找不到符合的內容，試試其他關鍵字。</p> : null}
          </section>
        </div>

        <aside className="eip-workbench-side">
          <section className="eip-workbench-panel">
            <div className="eip-workbench-section-heading"><div><p>UPCOMING</p><h3><CalendarDays size={19} /> 接下來</h3></div></div>
            {timeline.length ? <div className="eip-workbench-timeline">{timeline.map((item) => <button type="button" key={item.id} onClick={() => select(item.tab)}><time dateTime={item.date}>{dateText(item.date)}</time><span><small>{item.type}</small><strong>{item.title}</strong></span></button>)}</div> : <p className="eip-workbench-empty">{feed === null ? "同步日程中…" : feed.error ? "日程暫時讀取失敗。" : "目前沒有近期截止事項。"}</p>}
          </section>
          <section className="eip-workbench-panel">
            <div className="eip-workbench-section-heading"><div><p>ANNOUNCEMENTS</p><h3><Megaphone size={19} /> 最新公告</h3></div><button type="button" onClick={() => select("profile")}>查看全部 <ArrowRight size={14} /></button></div>
            {announcements.length ? <div className="eip-workbench-news">{announcements.slice(0, 3).map((item) => <button type="button" key={item.id} onClick={() => select("profile")}><strong>{item.title}</strong><span>{item.requires_signature && item.signature?.status !== "signed" ? "待簽署" : "查看公告"} <ArrowRight size={13} /></span></button>)}</div> : <p className="eip-workbench-empty">{feed === null ? "同步公告中…" : feed.error ? "公告暫時讀取失敗。" : "目前沒有公告。"}</p>}
          </section>
          <section className="eip-workbench-panel">
            <div className="eip-workbench-section-heading">
              <div><p>RECENT ACTIVITY</p><h3>最近訂單</h3></div>
              <button type="button" onClick={() => select("orders")}>查看全部 <ArrowRight size={14} /></button>
            </div>
            {recentOrders.length ? (
              <div className="eip-workbench-order-list">
                {recentOrders.slice(0, 4).map((order) => (
                  <button type="button" key={order.id} onClick={() => select("orders")} className="eip-workbench-order">
                    <span className="eip-workbench-order-icon"><ReceiptText size={18} /></span>
                    <span className="eip-workbench-order-info">
                      <strong>{order.service || "陪玩服務"}</strong>
                      <small>{order.date ? order.date.slice(0, 10) : "日期未提供"} · {order.status || "狀態待更新"}</small>
                    </span>
                    <span className="eip-workbench-order-amount">{money(order.amount)}</span>
                  </button>
                ))}
              </div>
            ) : <p className="eip-workbench-empty">目前查詢月份沒有訂單。</p>}
          </section>
          <section className="eip-workbench-tip">
            <ClipboardCheck size={20} />
            <div>
              <strong>個人提醒</strong>
              <p>{walletAvailable === null
                ? "正在讀取薪資錢包資料，可先使用其他工作台入口。"
                : pendingWithdrawalCount > 0
                  ? `有 ${pendingWithdrawalCount} 筆提領申請等待審核，可至個人資料查看進度。`
                  : "目前沒有待審的提領申請。可從左側快速進入各項申請與簽核。"}</p>
              <button type="button" onClick={() => select("profile")}>前往個人資料 <ArrowRight size={14} /></button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className="eip-workbench-stat"><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>;
}

function AppCard({ app, pinned, onOpen, onPin }: {
  app: WorkApp;
  pinned: boolean;
  onOpen: (tab: PortalTab) => void;
  onPin: (tab: PortalTab) => void;
}) {
  const Icon = app.icon;
  return (
    <div className="eip-workbench-app">
      <button type="button" className="eip-workbench-app-open" onClick={() => onOpen(app.tab)}>
        <span className="eip-workbench-app-icon"><Icon size={21} /></span>
        <span><small>{app.category}</small><strong>{app.label}</strong><em>{app.description}</em></span>
      </button>
      <button
        type="button"
        className="eip-workbench-pin"
        onClick={() => onPin(app.tab)}
        aria-label={`${pinned ? "取消固定" : "固定"}${app.label}`}
        title={`${pinned ? "取消固定" : "固定"}${app.label}`}
      >
        {pinned ? <PinOff size={16} /> : <Pin size={16} />}
      </button>
    </div>
  );
}
