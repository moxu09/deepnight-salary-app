"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getDiscordIdFromSession } from "@/lib/discordSession";
import {
  RefreshCw,
  LogOut,
  UserRound,
  WalletCards,
  Gamepad2,
  Save,
  Power,
  Gift,
  Trophy,
  HandCoins,
} from "lucide-react";
import StaffAvatar from "@/components/StaffAvatar";
import StaffPortalNav, { type PortalTab } from "@/components/StaffPortalNav";
import HrPortalPanel from "@/components/HrPortalPanel";
import {
  formatTaipeiDateTime,
  getNextTaipeiMonthText,
  getTaipeiMonthInput,
  getTaipeiMonthText,
  getTaipeiYear,
  monthInputToTaipeiRange,
} from "@/lib/taipeiTime";

const DEEPNIGHT_GUILD_ID =
  process.env.NEXT_PUBLIC_DEEPNIGHT_GUILD_ID ||
  process.env.NEXT_PUBLIC_GUILD_ID ||
  "1501098191813214312";

const DEEPNIGHT_PLAY_ORDER_FILTER = `guild_id.eq.${DEEPNIGHT_GUILD_ID},guild_id.is.null`;

type Staff = {
  id?: string;
  discord_id: string;
  discord_name?: string | null;
  display_name?: string | null;
  real_name?: string | null;
  gender?: string | null;
  birthday?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  avatar_url?: string | null;
  is_online?: boolean | null;
  is_active?: boolean | null;
  can_take_order?: boolean | null;
  allowed_services?: string[] | null;
  commission_tier?: string | null;
  commission_note?: string | null;
  created_at?: string | null;
};

type SalaryOrder = {
  id: string;
  order_no?: string | null;
  order_id?: string | null;
  discord_id: string;
  staff_name?: string | null;
  customer_name?: string | null;
  customer_id?: string | null;
  service_name?: string | null;
  service?: string | null;
  order_amount?: number | null;
  price?: number | null;
  staff_salary?: number | null;
  bonus_amount?: number | null;
  salary_rate?: number | null;
  salary_level?: string | null;
  status?: string | null;
  order_finished_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  wallet_settled_at?: string | null;
  order_type?: string | null;
  review_decision?: "approved" | "rejected" | null;
  reviewer_discord_id?: string | null;
  reviewer_name?: string | null;
  review_reason?: string | null;
  reviewed_at?: string | null;
};

type Bonus = {
  id: string;
  discord_id: string;
  staff_name?: string | null;
  bonus_type?: string | null;
  description?: string | null;
  amount?: number | null;
  created_at?: string | null;
};

type ProfileForm = {
  display_name: string;
  avatar_url: string;
  intro: string;
  invite_url: string;
  real_name: string;
  gender: string;
  birthday: string;
  bank_name: string;
  bank_account: string;
};

type ServiceItem = {
  key: string;
  name: string;
  category: string;
};

type AuthSessionLike = {
  user?: {
    user_metadata?: Record<string, unknown>;
    identities?: Array<{
      identity_data?: Record<string, unknown>;
    }>;
  };
};

type StaffServiceRow = {
  service_key?: string | null;
};

type SalaryWalletEntry = {
  id: string;
  entry_type: string;
  amount: number | string;
  source_label?: string | null;
  period_key?: string | null;
  created_at?: string | null;
};

type SalaryWithdrawRequest = {
  id: string;
  amount: number | string;
  status: string;
  reject_reason?: string | null;
  requested_at?: string | null;
  reviewed_at?: string | null;
};

type SalaryWalletData = {
  totals: {
    orderSalary: number;
    bonus: number;
    deposited: number;
    approvedWithdrawn: number;
    pendingWithdrawn: number;
    balance: number;
    available: number;
  };
  entries: SalaryWalletEntry[];
  requests: SalaryWithdrawRequest[];
  pendingRequest: SalaryWithdrawRequest | null;
  latestRequest: SalaryWithdrawRequest | null;
  withdrawWindow: {
    isOpen: boolean;
    note: string;
  };
};

const SERVICE_GROUPS: Record<string, ServiceItem[]> = {
  特戰英豪: [
    { key: "valorant_god", name: "大神陪玩", category: "特戰英豪" },
    { key: "valorant_skill", name: "技術陪玩", category: "特戰英豪" },
    { key: "valorant_entertain", name: "娛樂陪玩", category: "特戰英豪" },
    { key: "valorant_topup", name: "儲值星雨幣", category: "特戰英豪" },
  ],
  三角洲行動: [
    { key: "delta_pc", name: "電腦版", category: "三角洲行動" },
    { key: "delta_mobile", name: "手機版", category: "三角洲行動" },
    { key: "delta_topup", name: "儲值星雨幣", category: "三角洲行動" },
  ],
  Apex: [
    { key: "apex_god", name: "大神陪玩", category: "Apex" },
    { key: "apex_skill", name: "技術陪玩", category: "Apex" },
    { key: "apex_entertain", name: "娛樂陪玩", category: "Apex" },
    { key: "apex_topup", name: "儲值星雨幣", category: "Apex" },
  ],
  英雄聯盟: [
    { key: "lol_main", name: "英雄聯盟", category: "英雄聯盟" },
    { key: "lol_aram", name: "ARAM", category: "英雄聯盟" },
    { key: "lol_tft", name: "聯盟戰棋", category: "英雄聯盟" },
    { key: "lol_topup", name: "儲值星雨幣", category: "英雄聯盟" },
  ],
  Steam: [
    { key: "steam_roguelike", name: "肉鴿遊戲", category: "Steam" },
    { key: "steam_survival", name: "生存遊戲", category: "Steam" },
    { key: "steam_horror", name: "恐怖遊戲", category: "Steam" },
    { key: "steam_party", name: "派對遊戲", category: "Steam" },
  ],
  王者榮耀: [
    { key: "hok_entertain", name: "娛樂", category: "王者榮耀" },
    { key: "hok_skill", name: "技術", category: "王者榮耀" },
  ],
  第五人格: [
    { key: "identity_v_entertain", name: "娛樂", category: "第五人格" },
    { key: "identity_v_rank_4", name: "四階", category: "第五人格" },
    { key: "identity_v_rank_5", name: "五階", category: "第五人格" },
    { key: "identity_v_rank_6", name: "六階", category: "第五人格" },
    { key: "identity_v_rank_7", name: "七階", category: "第五人格" },
  ],
  其他項目: [
    { key: "pubgm", name: "PUBG M", category: "其他項目" },
    { key: "naraka", name: "NARAKA", category: "其他項目" },
    { key: "minecraft", name: "Minecraft", category: "其他項目" },
    { key: "voice_chat", name: "語音聊天", category: "其他項目" },
    { key: "song", name: "點歌服務", category: "其他項目" },
  ],
};

const ALL_SERVICES = Object.values(SERVICE_GROUPS).flat();

function getCurrentMonthInput() {
  return getTaipeiMonthInput();
}

function getMonthRange(monthText: string) {
  return monthInputToTaipeiRange(monthText);
}

function formatMonthLabel(monthText: string) {
  if (!monthText) return "所選月份";

  const [yearText, monthTextValue] = monthText.split("-");
  const month = Number(monthTextValue);

  if (!yearText || !month) return "所選月份";

  return `${yearText} 年 ${month} 月`;
}

function money(value: number | null | undefined) {
  return `$${Number(value || 0).toLocaleString("zh-TW")}`;
}

function formatDateTime(value?: string | null) {
  return formatTaipeiDateTime(value, {
    hour12: true,
  });
}

function formatEntryType(type: string) {
  if (type === "order_salary") return "訂單薪水";
  if (type === "order_bonus") return "訂單獎金";
  if (type === "staff_bonus") return "獎金 / 扣除";
  return "薪資明細";
}

function getRequestStatusText(request?: SalaryWithdrawRequest | null) {
  if (!request) return "尚未申請";
  if (request.status === "pending") return "申請中";
  if (request.status === "approved") return "申請成功，請稍等三個工作日";
  if (request.status === "rejected") {
    return `申請遭駁回${
      request.reject_reason ? `，原因是${request.reject_reason}` : ""
    }`;
  }
  return request.status || "尚未申請";
}

function getRequestStatusClass(request?: SalaryWithdrawRequest | null) {
  if (!request) return "bg-slate-100 text-slate-500";
  if (request.status === "pending") return "bg-amber-50 text-amber-600";
  if (request.status === "approved") return "bg-emerald-50 text-emerald-600";
  if (request.status === "rejected") return "bg-rose-50 text-rose-600";
  return "bg-slate-100 text-slate-500";
}

function getOrderAmount(order: SalaryOrder) {
  return Number(order.order_amount ?? order.price ?? 0);
}

function getOrderService(order: SalaryOrder) {
  return order.service_name || order.service || "-";
}

function getOrderCustomer(order: SalaryOrder) {
  return order.customer_name || order.customer_id || "-";
}

function getManualRate(tier?: string | null) {
  if (tier === "rate_80") return 80;
  if (tier === "rate_85") return 85;
  if (tier === "rate_90") return 90;
  if (tier === "manager_95") return 95;
  return null;
}

function getNextMonthTextFromIso(isoText?: string | null) {
  return isoText ? getNextTaipeiMonthText(isoText) : "";
}

function getOrderSourceDate(order: SalaryOrder) {
  return (
    order.order_finished_at || order.completed_at || order.created_at || null
  );
}

function getFirstReachAmountDate(
  orderList: SalaryOrder[],
  targetAmount: number
) {
  const sortedOrders = [...orderList]
    .filter((order) => getOrderSourceDate(order))
    .sort((a, b) => {
      const aDate = getOrderSourceDate(a);
      const bDate = getOrderSourceDate(b);

      return new Date(aDate || 0).getTime() - new Date(bDate || 0).getTime();
    });

  let total = 0;

  for (const order of sortedOrders) {
    total += getOrderAmount(order);

    if (total >= targetAmount) {
      return getOrderSourceDate(order);
    }
  }

  return null;
}

function getCurrentRateByRule(
  staff: Staff | null,
  orderList: SalaryOrder[],
  totalYearSalary: number
) {
  const now = new Date();
  const openingEnd = new Date("2026-09-01T00:00:00+08:00");
  const manual = getManualRate(staff?.commission_tier);

  if (manual) {
    return manual;
  }

  if (now < openingEnd) {
    return 90;
  }

  if (totalYearSalary >= 100000) {
    return 90;
  }

  const firstReach10kDate = getFirstReachAmountDate(orderList, 10000);

  if (firstReach10kDate) {
    const reachNextMonth = getNextMonthTextFromIso(firstReach10kDate);
    const currentMonth = getTaipeiMonthText(now);

    if (currentMonth >= reachNextMonth) {
      return 85;
    }
  }

  return 80;
}

function getDisplayName(staff: Staff | null) {
  if (!staff) return "員工";

  return (
    staff.display_name ||
    staff.real_name ||
    staff.discord_name ||
    staff.discord_id ||
    "員工"
  );
}

function getServiceName(key: string) {
  return ALL_SERVICES.find((item) => item.key === key)?.name || key;
}

function getServiceCategory(key: string) {
  return ALL_SERVICES.find((item) => item.key === key)?.category || "其他";
}

function stringValue(value: unknown) {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  return "";
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getDiscordNameFromSession(session: unknown) {
  const metadata =
    (session as AuthSessionLike | null)?.user?.user_metadata || {};

  return (
    stringValue(metadata.global_name) ||
    stringValue(metadata.full_name) ||
    stringValue(metadata.name) ||
    stringValue(metadata.preferred_username) ||
    stringValue(metadata.user_name) ||
    stringValue(metadata.username) ||
    "Discord 使用者"
  );
}

function getAvatarFromSession(session: unknown) {
  const metadata =
    (session as AuthSessionLike | null)?.user?.user_metadata || {};
  return (
    stringValue(metadata.avatar_url) || stringValue(metadata.picture) || null
  );
}

export default function StaffPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<Staff | null>(null);
  const [salaryOrders, setSalaryOrders] = useState<SalaryOrder[]>([]);
  const [allSalaryOrders, setAllSalaryOrders] = useState<SalaryOrder[]>([]);
  const [reviewedOrders, setReviewedOrders] = useState<SalaryOrder[]>([]);
  const [bonuses, setBonuses] = useState<Bonus[]>([]);
  const [allowedServices, setAllowedServices] = useState<string[]>([]);
  const [profileSaving, setProfileSaving] = useState(false);
  const [serviceSaving, setServiceSaving] = useState(false);
  const [onlineSaving, setOnlineSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [salaryWallet, setSalaryWallet] = useState<SalaryWalletData | null>(
    null
  );
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthInput());
  const [activeTab, setActiveTab] = useState<PortalTab>("profile");

  const [profileForm, setProfileForm] = useState<ProfileForm>({
    display_name: "",
    avatar_url: "",
    intro: "",
    invite_url: "",
    real_name: "",
    gender: "",
    birthday: "",
    bank_name: "",
    bank_account: "",
  });

  const monthOrderCount = salaryOrders.length;

  const monthSalary = useMemo(() => {
    return salaryOrders.reduce(
      (sum, order) => sum + Number(order.staff_salary || 0),
      0
    );
  }, [salaryOrders]);

  const monthBonus = useMemo(() => {
    return bonuses.reduce((sum, bonus) => sum + Number(bonus.amount || 0), 0);
  }, [bonuses]);

  const visibleOrders = useMemo(() => salaryOrders.filter((order) => {
    const isTip = order.order_type === "打賞" || getOrderService(order).includes("打賞");
    return activeTab === "tips" ? isTip : !isTip;
  }), [activeTab, salaryOrders]);

  const visibleBonuses = useMemo(() => bonuses.filter((bonus) =>
    activeTab === "deductions" ? Number(bonus.amount || 0) < 0 : Number(bonus.amount || 0) >= 0
  ), [activeTab, bonuses]);

  const isOrderTab = activeTab === "orders" || activeTab === "tips" || activeTab === "bonuses" || activeTab === "deductions";

  const unpaidAmount = useMemo(() => {
    const orderTotal = salaryOrders
      .filter((order) => order.status !== "已發薪" && !order.wallet_settled_at)
      .reduce(
        (sum, order) =>
          sum +
          Number(order.staff_salary || 0) +
          Number(order.bonus_amount || 0),
        0
      );

    return orderTotal + monthBonus;
  }, [salaryOrders, monthBonus]);

  const totalOrderAmount = useMemo(() => {
    return allSalaryOrders.reduce(
      (sum, order) => sum + getOrderAmount(order),
      0
    );
  }, [allSalaryOrders]);

  const totalYearSalary = useMemo(() => {
    const year = getTaipeiYear();

    return allSalaryOrders
      .filter((order) => {
        const sourceDate =
          order.order_finished_at || order.completed_at || order.created_at;

        if (!sourceDate) return false;

        return getTaipeiYear(sourceDate) === year;
      })
      .reduce((sum, order) => sum + Number(order.staff_salary || 0), 0);
  }, [allSalaryOrders]);

  const currentRate = useMemo(() => {
    return getCurrentRateByRule(staff, allSalaryOrders, totalYearSalary);
  }, [staff, allSalaryOrders, totalYearSalary]);

  const progress85 = Math.min(
    100,
    Math.round((totalOrderAmount / 10000) * 100)
  );
  const progress90 = Math.min(
    100,
    Math.round((totalYearSalary / 100000) * 100)
  );

  useEffect(() => {
    // boot is intentionally run once after the client router is ready.
    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function boot() {
    setLoading(true);

    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session) {
        router.replace("/login");
        return;
      }

      const discordId = getDiscordIdFromSession(session);

      if (!discordId) {
        alert("無法取得 Discord ID，請重新登入。");
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }

      const ensureRes = await fetch("/api/deepnight/ensure-staff", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          access_token: session.access_token,
          discord_id: discordId,
          discord_name: getDiscordNameFromSession(session),
          avatar_url: getAvatarFromSession(session),
        }),
      });

      const ensureData = await ensureRes.json();

      if (!ensureRes.ok || !ensureData.ok) {
        alert(ensureData.message || "員工身分驗證失敗");
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }

      const staffData = (ensureData.staff || ensureData.player) as Staff | null;

      if (!staffData?.discord_id) {
        alert("員工資料建立失敗，請重新登入。");
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }

      setStaff(staffData);
      setProfileForm({
        display_name: staffData.display_name || "",
        avatar_url: staffData.avatar_url || "",
        intro: "",
        invite_url: "",
        real_name: staffData.real_name || "",
        gender: staffData.gender || "",
        birthday: staffData.birthday || "",
        bank_name: staffData.bank_name || "",
        bank_account: staffData.bank_account || "",
      });

      const publicProfileRes = await fetch("/api/deepnight/public-profile", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const publicProfileData = await publicProfileRes.json().catch(() => ({}));
      if (publicProfileRes.ok && publicProfileData.profile) {
        setProfileForm((current) => ({
          ...current,
          avatar_url: publicProfileData.profile.avatar_url || current.avatar_url,
          intro: publicProfileData.profile.intro || "",
          invite_url: publicProfileData.profile.invite_url || "",
        }));
      }

      await loadWalletData();

      await Promise.all([
        loadSalaryData(staffData.discord_id),
        loadStaffServices(
          staffData.discord_id,
          staffData.allowed_services || []
        ),
      ]);
    } catch (error) {
      console.error("staff boot error:", error);
      alert("讀取員工資料失敗");
    } finally {
      setLoading(false);
    }
  }

  async function loadSalaryData(discordId: string) {
    const { startIso, endIso } = getMonthRange(selectedMonth);

    const { data: monthOrders, error: monthError } = await supabase
      .from("play_orders")
      .select("*")
      .or(DEEPNIGHT_PLAY_ORDER_FILTER)
      .eq("discord_id", discordId)
      .or("is_deleted.eq.false,is_deleted.is.null")
      .gte("order_finished_at", startIso)
      .lte("order_finished_at", endIso)
      .order("order_finished_at", { ascending: false });

    if (monthError) {
      console.error("load salary orders error:", monthError);
      setSalaryOrders([]);
    } else {
      setSalaryOrders((monthOrders || []) as SalaryOrder[]);
    }

    const { data: reviewData, error: reviewError } = await supabase
      .from("play_orders")
      .select("*")
      .or(DEEPNIGHT_PLAY_ORDER_FILTER)
      .eq("discord_id", discordId)
      .not("reviewed_at", "is", null)
      .gte("reviewed_at", startIso)
      .lte("reviewed_at", endIso)
      .order("reviewed_at", { ascending: false });

    if (reviewError) {
      console.error("load order reviews error:", reviewError);
      setReviewedOrders([]);
    } else {
      setReviewedOrders((reviewData || []) as SalaryOrder[]);
    }

    const { data: allOrders, error: allError } = await supabase
      .from("play_orders")
      .select("*")
      .or(DEEPNIGHT_PLAY_ORDER_FILTER)
      .eq("discord_id", discordId)
      .or("is_deleted.eq.false,is_deleted.is.null")
      .order("order_finished_at", { ascending: false });

    if (allError) {
      console.error("load all salary orders error:", allError);
      setAllSalaryOrders([]);
    } else {
      setAllSalaryOrders((allOrders || []) as SalaryOrder[]);
    }

    const { data: bonusData, error: bonusError } = await supabase
      .from("players_bonus")
      .select("*")
      .eq("discord_id", discordId)
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .order("created_at", { ascending: false });

    if (bonusError) {
      console.error("load bonus error:", bonusError);
      setBonuses([]);
    } else {
      setBonuses((bonusData || []) as Bonus[]);
    }
  }

  async function loadStaffServices(discordId: string, fallback: string[] = []) {
    const { data, error } = await supabase
      .from("players_services")
      .select("*")
      .eq("discord_id", discordId)
      .eq("enabled", true);

    if (error) {
      console.error("load staff services error:", error);
      setAllowedServices(fallback || []);
      return;
    }

    const services = (data || [])
      .map((item: StaffServiceRow) => String(item.service_key || "").trim())
      .filter(Boolean);

    setAllowedServices(services.length > 0 ? services : fallback || []);
  }

  async function loadWalletData() {
    setWalletLoading(true);

    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session) return;

      const res = await fetch("/api/deepnight/salary-wallet", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const payload = await res.json();

      if (!res.ok || !payload.ok) {
        throw new Error(payload.message || "讀取薪資錢包失敗");
      }

      setSalaryWallet(payload.wallet as SalaryWalletData);
    } catch (error: unknown) {
      console.error("load salary wallet error:", error);
      alert(getErrorMessage(error, "讀取薪資錢包失敗"));
    } finally {
      setWalletLoading(false);
    }
  }

  async function requestWithdraw() {
    if (!salaryWallet) return;

    const available = Math.floor(Number(salaryWallet.totals.available || 0));
    const amountNumber = Number(withdrawAmount || 0);
    const amount = Math.floor(amountNumber);

    if (!Number.isFinite(amountNumber) || amount <= 0) {
      alert("請輸入要提領的金額");
      return;
    }

    if (amount > available) {
      alert(`提領金額不能超過可提領薪資 ${money(available)}`);
      return;
    }

    if (!confirm(`確定要申請提領 ${money(amount)}？`)) {
      return;
    }

    setWithdrawing(true);

    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session) {
        throw new Error("請重新登入");
      }

      const res = await fetch("/api/deepnight/salary-wallet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ amount }),
      });

      const payload = await res.json();

      if (!res.ok || !payload.ok) {
        throw new Error(payload.message || "送出提領申請失敗");
      }

      setSalaryWallet(payload.wallet as SalaryWalletData);
      setWithdrawAmount("");
      alert("提領申請已送出");
    } catch (error: unknown) {
      console.error("request withdraw error:", error);
      alert(getErrorMessage(error, "送出提領申請失敗"));
    } finally {
      setWithdrawing(false);
    }
  }

  async function refreshAll() {
    if (!staff) return;

    setRefreshing(true);

    try {
      await Promise.all([
        loadWalletData(),
        loadSalaryData(staff.discord_id),
        loadStaffServices(staff.discord_id, staff.allowed_services || []),
      ]);
    } finally {
      setRefreshing(false);
    }
  }

  async function saveProfile() {
    if (!staff) return;

    setProfileSaving(true);

    const { data, error } = await supabase
      .from("players")
      .update({
        display_name: profileForm.display_name || null,
        avatar_url: profileForm.avatar_url || null,
        real_name: profileForm.real_name || null,
        gender: profileForm.gender || null,
        birthday: profileForm.birthday || null,
        bank_name: profileForm.bank_name || null,
        bank_account: profileForm.bank_account || null,
        updated_at: new Date().toISOString(),
      })
      .eq("discord_id", staff.discord_id)
      .select("*")
      .single();

    setProfileSaving(false);

    if (error) {
      console.error("save profile error:", error);
      alert("儲存個人資料失敗");
      return;
    }

    try {
      await syncPublicProfile({
        displayName: profileForm.display_name,
        avatarUrl: profileForm.avatar_url,
        intro: profileForm.intro,
        inviteUrl: profileForm.invite_url,
      });
    } catch (syncError) {
      console.error("sync public profile error:", syncError);
      setStaff(data as Staff);
      alert("薪資資料已儲存，但官網介紹同步失敗，請稍後再試");
      return;
    }

    setStaff(data as Staff);
    alert("個人資料已儲存");
  }

  async function syncPublicProfile(payload: Record<string, unknown>) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("登入已過期");
    const response = await fetch("/api/deepnight/public-profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
      throw new Error(result.message || "官網同步失敗");
    }
    return result.profile;
  }

  async function toggleOnline() {
    if (!staff) return;

    const nextOnline = !staff.is_online;
    setOnlineSaving(true);

    const { data, error } = await supabase
      .from("players")
      .update({
        is_online: nextOnline,
        updated_at: new Date().toISOString(),
      })
      .eq("discord_id", staff.discord_id)
      .select("*")
      .single();

    setOnlineSaving(false);

    if (error) {
      console.error("toggle online error:", error);
      alert("更新接單狀態失敗");
      return;
    }

    setStaff(data as Staff);
    await syncPublicProfile({ isOnline: nextOnline }).catch((syncError) => {
      console.error("sync online status error:", syncError);
    });
  }

  function toggleService(serviceKey: string) {
    setAllowedServices((prev) => {
      if (prev.includes(serviceKey)) {
        return prev.filter((key) => key !== serviceKey);
      }

      return [...prev, serviceKey];
    });
  }

  async function saveServices() {
    if (!staff) return;

    setServiceSaving(true);

    const { error: updateStaffError } = await supabase
      .from("players")
      .update({
        allowed_services: allowedServices,
        updated_at: new Date().toISOString(),
      })
      .eq("discord_id", staff.discord_id);

    if (updateStaffError) {
      setServiceSaving(false);
      console.error("update allowed_services error:", updateStaffError);
      alert("更新可接遊戲失敗");
      return;
    }

    const { error: deleteError } = await supabase
      .from("players_services")
      .delete()
      .eq("discord_id", staff.discord_id);

    if (deleteError) {
      setServiceSaving(false);
      console.error("delete services error:", deleteError);
      alert("更新可接遊戲失敗");
      return;
    }

    if (allowedServices.length > 0) {
      const rows = allowedServices.map((serviceKey) => ({
        discord_id: staff.discord_id,
        service_key: serviceKey,
        service_name: getServiceName(serviceKey),
        category: getServiceCategory(serviceKey),
        enabled: true,
        updated_at: new Date().toISOString(),
      }));

      const { error: insertError } = await supabase
        .from("players_services")
        .insert(rows);

      if (insertError) {
        setServiceSaving(false);
        console.error("insert services error:", insertError);
        alert("更新可接遊戲失敗");
        return;
      }
    }

    setStaff((prev) =>
      prev
        ? {
            ...prev,
            allowed_services: allowedServices,
          }
        : prev
    );

    setServiceSaving(false);
    await syncPublicProfile({
      games: Array.from(
        new Set(allowedServices.map((key) => getServiceCategory(key)))
      ),
    }).catch((syncError) => {
      console.error("sync public games error:", syncError);
    });
    alert("可接遊戲已儲存");
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#eef7fd] text-slate-700">
        <div className="rounded-[28px] border border-sky-100 bg-white px-8 py-7 text-center shadow-sm shadow-sky-100">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-sky-300 border-t-transparent" />
          <p className="text-sm font-semibold text-slate-600">
            正在讀取員工資料...
          </p>
        </div>
      </main>
    );
  }

  if (!staff) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#eef7fd] text-slate-700">
        <div className="rounded-[28px] border border-sky-100 bg-white px-8 py-7 text-center shadow-sm shadow-sky-100">
          <p className="text-sm font-semibold text-slate-600">
            找不到員工資料，請重新登入。
          </p>

          <button
            onClick={logout}
            className="mt-5 rounded-full bg-sky-500 px-5 py-2 text-sm font-bold text-white hover:bg-sky-600"
          >
            重新登入
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="staff-portal-page min-h-screen bg-[#f3f7fa] text-slate-900">
      <div className="staff-portal-shell grid lg:grid-cols-[240px_minmax(0,1fr)]">
        <StaffPortalNav activeTab={activeTab} onSelect={setActiveTab} employeeName={getDisplayName(staff)} company="深夜不關燈" />

        <div className="staff-portal-content min-w-0 space-y-5">
        <header id="overview" className="scroll-mt-24 rounded-[30px] border border-violet-100 bg-white px-6 py-5 shadow-sm shadow-violet-100">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-3xl bg-sky-100 text-sky-600">
                <StaffAvatar
                  avatarUrl={staff.avatar_url}
                  discordId={staff.discord_id}
                  alt={getDisplayName(staff)}
                  iconSize={30}
                />
              </div>

              <div>
                <p className="text-sm font-bold text-sky-600">
                  DeepNight Staff
                </p>

                <h1 className="mt-1 text-2xl font-black text-slate-900">
                  深夜不關燈｜員工薪資中心
                </h1>

                <p className="mt-1 text-sm text-slate-500">
                  {getDisplayName(staff)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={refreshAll}
                disabled={refreshing}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-sky-100 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-sky-50 disabled:opacity-60"
              >
                <RefreshCw
                  size={16}
                  className={refreshing ? "animate-spin" : ""}
                />
                重新整理
              </button>

              <button
                onClick={logout}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-sky-500 px-4 py-2 text-sm font-bold text-white shadow-sm shadow-sky-200 hover:bg-sky-600"
              >
                <LogOut size={16} />
                登出
              </button>
            </div>
          </div>
        </header>

        <HrPortalPanel activeTab={activeTab} apiPath="/api/deepnight/hr" department="深夜不關燈" staffName={getDisplayName(staff)} selectedMonth={selectedMonth} onMonthChange={setSelectedMonth} />

        <section className={activeTab === "profile" ? "grid gap-4 md:grid-cols-4" : "hidden"}>
          <StatCard title="月份訂單" value={`${monthOrderCount} 筆`} />
          <StatCard title="月份薪資" value={money(monthSalary)} />
          <StatCard title="獎金 / 扣除" value={money(monthBonus)} />
          <StatCard title="未發薪" value={money(unpaidAmount)} />
        </section>

        <section id="wallet" className={`${activeTab === "profile" ? "block" : "hidden"} rounded-[28px] border border-sky-100 bg-white p-5 shadow-sm shadow-sky-100`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
                <HandCoins size={20} className="text-sky-500" />
                薪資錢包
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                每月 17 號入帳 1-15 號薪水；每月 2 號入帳上月 16-月底薪水。
              </p>
            </div>

            <div className="flex w-full flex-col items-stretch gap-2 sm:max-w-xs sm:items-end">
              <label className="w-full text-xs font-bold text-slate-500">
                提領金額
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={withdrawAmount}
                  onChange={(event) => setWithdrawAmount(event.target.value)}
                  placeholder={
                    salaryWallet
                      ? `最多 ${money(salaryWallet.totals.available)}`
                      : "輸入金額"
                  }
                  className="mt-1"
                />
              </label>

              <button
                onClick={requestWithdraw}
                disabled={
                  withdrawing ||
                  walletLoading ||
                  !salaryWallet ||
                  !salaryWallet.withdrawWindow.isOpen ||
                  !!salaryWallet.pendingRequest ||
                  Number(salaryWallet.totals.available || 0) <= 0 ||
                  Number(withdrawAmount || 0) <= 0
                }
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-sky-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm shadow-sky-200 hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <WalletCards size={16} />
                {withdrawing ? "申請中..." : "提領"}
              </button>

              <p className="text-xs font-semibold text-slate-400">
                每月 2 到 10 號可以提領，提領需要三個工作天。
              </p>
            </div>
          </div>

          {walletLoading && !salaryWallet ? (
            <div className="mt-5 rounded-[22px] bg-sky-50 px-4 py-5 text-center text-sm font-semibold text-sky-500">
              讀取薪資錢包中...
            </div>
          ) : salaryWallet ? (
            <>
              <div className="mt-5 grid gap-3 md:grid-cols-4">
                <MiniStat
                  title="錢包餘額"
                  value={money(salaryWallet.totals.balance)}
                />
                <MiniStat
                  title="訂單薪水"
                  value={money(salaryWallet.totals.orderSalary)}
                />
                <MiniStat
                  title="獎金 / 扣除"
                  value={money(salaryWallet.totals.bonus)}
                />
                <MiniStat
                  title="使用的薪水"
                  value={money(salaryWallet.totals.approvedWithdrawn)}
                />
              </div>

              <div className="mt-4 flex flex-col gap-3 rounded-[22px] border border-sky-100 bg-sky-50/60 px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-black text-slate-700">提領狀態</p>
                  <p className="mt-1 text-sm text-slate-500">
                    可提領：{money(salaryWallet.totals.available)}
                    {salaryWallet.totals.pendingWithdrawn > 0
                      ? `，申請中：${money(
                          salaryWallet.totals.pendingWithdrawn
                        )}`
                      : ""}
                  </p>
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${getRequestStatusClass(
                    salaryWallet.latestRequest
                  )}`}
                >
                  {getRequestStatusText(salaryWallet.latestRequest)}
                </span>
              </div>

              <div className="mt-5 overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>時間</th>
                      <th>項目</th>
                      <th>期別</th>
                      <th>金額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salaryWallet.entries.slice(0, 8).map((entry) => (
                      <tr key={entry.id}>
                        <td>{formatDateTime(entry.created_at)}</td>
                        <td>
                          <p className="font-bold text-slate-700">
                            {formatEntryType(entry.entry_type)}
                          </p>
                          <p className="text-xs text-slate-400">
                            {entry.source_label || "-"}
                          </p>
                        </td>
                        <td>{entry.period_key || "-"}</td>
                        <td
                          className={
                            Number(entry.amount || 0) < 0
                              ? "font-bold text-rose-500"
                              : "font-bold text-sky-600"
                          }
                        >
                          {money(Number(entry.amount || 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </section>

        <section className={`${isOrderTab ? "block" : "hidden"} rounded-[28px] border border-sky-100 bg-white p-5 shadow-sm shadow-sky-100`}>
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <Field label="薪資月份">
              <input
                type="month"
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
              />
            </Field>

            <button
              onClick={refreshAll}
              disabled={refreshing}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-sky-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm shadow-sky-200 hover:bg-sky-600 disabled:opacity-60"
            >
              <RefreshCw
                size={16}
                className={refreshing ? "animate-spin" : ""}
              />
              查詢月份
            </button>
          </div>
        </section>

        <section className={activeTab === "profile" ? "grid gap-5 xl:grid-cols-[0.9fr_1.4fr]" : "block"}>
          <div className="space-y-5">
            <div className={`${activeTab === "profile" ? "block" : "hidden"} rounded-[28px] border border-sky-100 bg-white p-5 shadow-sm shadow-sky-100`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="flex items-center gap-2 text-sm font-bold text-sky-600">
                    <Trophy size={18} />
                    我的抽成檔位
                  </p>

                  <div className="mt-4 flex items-end gap-2">
                    <p className="text-4xl font-black text-slate-900">
                      {currentRate}%
                    </p>

                    <p className="pb-1 text-sm font-semibold text-slate-500">
                      {staff.commission_tier === "auto" ||
                      !staff.commission_tier
                        ? "自動判定"
                        : "後台設定"}
                    </p>
                  </div>

                  <p className="mt-3 text-sm leading-6 text-slate-500">
                    2026/09/01 前未手動設定者預設 90%；後台設定會優先套用。9
                    月後預設 80%，累積接單滿 10,000 後下個月
                    85%，年度薪資達標後隔年 90%。
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <ProgressBar
                  title="升級 85% 進度"
                  current={totalOrderAmount}
                  target={10000}
                  percent={progress85}
                />

                <ProgressBar
                  title="升級隔年 90% 進度"
                  current={totalYearSalary}
                  target={100000}
                  percent={progress90}
                />
              </div>
            </div>

            <div className={`${activeTab === "profile" ? "block" : "hidden"} rounded-[28px] border border-sky-100 bg-white p-5 shadow-sm shadow-sky-100`}>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-black text-slate-900">
                    接單狀態
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    客人選陪陪時會看到你的狀態。
                  </p>
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    staff.is_online
                      ? "bg-emerald-50 text-emerald-600"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {staff.is_online ? "上線中" : "下線中"}
                </span>
              </div>

              <button
                onClick={toggleOnline}
                disabled={onlineSaving}
                className={`mt-5 flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-bold text-white ${
                  staff.is_online
                    ? "bg-slate-500 hover:bg-slate-600"
                    : "bg-emerald-500 hover:bg-emerald-600"
                }`}
              >
                <Power size={16} />
                {onlineSaving
                  ? "更新中..."
                  : staff.is_online
                  ? "切換為下線"
                  : "切換為上線"}
              </button>
            </div>

            <div id="profile" className={`${activeTab === "profile" ? "block" : "hidden"} rounded-[28px] border border-sky-100 bg-white p-5 shadow-sm shadow-sky-100`}>
              <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
                <UserRound size={20} className="text-sky-500" />
                個人資料
              </h2>

              <div className="mt-5 space-y-4">
                <Field label="顯示名稱">
                  <input
                    value={profileForm.display_name}
                    onChange={(event) =>
                      setProfileForm((prev) => ({
                        ...prev,
                        display_name: event.target.value,
                      }))
                    }
                    placeholder="例如：阿陌"
                  />
                </Field>

                <Field label="官網頭像網址">
                  <input
                    type="url"
                    value={profileForm.avatar_url}
                    onChange={(event) =>
                      setProfileForm((prev) => ({
                        ...prev,
                        avatar_url: event.target.value,
                      }))
                    }
                    placeholder="https://..."
                  />
                </Field>

                <Field label="官網自我介紹">
                  <textarea
                    rows={4}
                    value={profileForm.intro}
                    onChange={(event) =>
                      setProfileForm((prev) => ({
                        ...prev,
                        intro: event.target.value,
                      }))
                    }
                    placeholder="介紹你的個性、擅長遊戲與陪玩風格"
                  />
                </Field>

                <Field label="專屬邀請連結">
                  <input
                    type="url"
                    value={profileForm.invite_url}
                    onChange={(event) =>
                      setProfileForm((prev) => ({
                        ...prev,
                        invite_url: event.target.value,
                      }))
                    }
                    placeholder="Discord 邀請或預約連結"
                  />
                </Field>

                <Field label="真實姓名">
                  <input
                    value={profileForm.real_name}
                    onChange={(event) =>
                      setProfileForm((prev) => ({
                        ...prev,
                        real_name: event.target.value,
                      }))
                    }
                    placeholder="用於發薪紀錄"
                  />
                </Field>

                <Field label="性別">
                  <select
                    value={profileForm.gender}
                    onChange={(event) =>
                      setProfileForm((prev) => ({
                        ...prev,
                        gender: event.target.value,
                      }))
                    }
                  >
                    <option value="">未填寫</option>
                    <option value="男">男</option>
                    <option value="女">女</option>
                    <option value="其他">其他</option>
                  </select>
                </Field>

                <Field label="生日">
                  <input
                    type="date"
                    value={profileForm.birthday}
                    onChange={(event) =>
                      setProfileForm((prev) => ({
                        ...prev,
                        birthday: event.target.value,
                      }))
                    }
                  />
                </Field>

                <Field label="銀行名稱">
                  <input
                    value={profileForm.bank_name}
                    onChange={(event) =>
                      setProfileForm((prev) => ({
                        ...prev,
                        bank_name: event.target.value,
                      }))
                    }
                    placeholder="例如：玉山銀行"
                  />
                </Field>

                <Field label="銀行帳號">
                  <input
                    value={profileForm.bank_account}
                    onChange={(event) =>
                      setProfileForm((prev) => ({
                        ...prev,
                        bank_account: event.target.value,
                      }))
                    }
                    placeholder="請輸入薪轉帳號"
                  />
                </Field>

                <button
                  onClick={saveProfile}
                  disabled={profileSaving}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-sky-500 px-4 py-3 text-sm font-bold text-white shadow-sm shadow-sky-200 hover:bg-sky-600 disabled:opacity-60"
                >
                  <Save size={16} />
                  {profileSaving ? "儲存中..." : "儲存個人資料"}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div id="games" className={`${activeTab === "profile" ? "block" : "hidden"} rounded-[28px] border border-sky-100 bg-white p-5 shadow-sm shadow-sky-100`}>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
                    <Gamepad2 size={20} className="text-sky-500" />
                    可接遊戲 / 服務
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    勾選後，機器人派單時會依你的可接服務篩選。
                  </p>
                </div>

                <button
                  onClick={saveServices}
                  disabled={serviceSaving}
                  className="rounded-full bg-sky-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm shadow-sky-200 hover:bg-sky-600 disabled:opacity-60"
                >
                  {serviceSaving ? "儲存中..." : "儲存可接服務"}
                </button>
              </div>

              <div className="mobile-service-grid mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                {Object.entries(SERVICE_GROUPS).map(([groupName, items]) => (
                  <div
                    key={groupName}
                    className="mobile-service-card rounded-[22px] border border-sky-100 bg-sky-50/40 p-4"
                  >
                    <h3 className="mobile-service-title font-black text-sky-700">
                      {groupName}
                    </h3>

                    <div className="mt-3 space-y-2">
                      {items.map((item) => {
                        const checked = allowedServices.includes(item.key);

                        return (
                          <label
                            key={item.key}
                            className="mobile-service-option grid w-full cursor-pointer grid-cols-[32px_1fr] items-center gap-3 rounded-[16px] border border-sky-100 bg-white px-3 py-2.5 text-sm transition hover:bg-sky-50"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleService(item.key)}
                            />

                            <span className="min-w-0 break-words font-semibold text-slate-700">
                              {item.name}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="hidden">
              <div className="border-b border-sky-100 px-5 py-4">
                <h2 className="text-lg font-black text-slate-900">訂單審核紀錄</h2>
                <p className="mt-1 text-sm text-slate-500">
                  核准與駁回都會顯示審核人及審核時間。
                </p>
              </div>

              {reviewedOrders.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm font-semibold text-slate-400">
                  這個月份尚無審核紀錄
                </div>
              ) : (
                <div className="mobile-table-card overflow-x-auto">
                  <table>
                    <thead>
                      <tr>
                        <th>審核時間</th>
                        <th>服務</th>
                        <th>結果</th>
                        <th>審核人</th>
                        <th>原因</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reviewedOrders.map((order) => (
                        <tr key={`review-${order.id}`}>
                          <td data-label="審核時間">
                            {formatDateTime(order.reviewed_at)}
                          </td>
                          <td data-label="服務">{getOrderService(order)}</td>
                          <td data-label="結果">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-bold ${
                                order.review_decision === "approved"
                                  ? "bg-emerald-50 text-emerald-600"
                                  : "bg-rose-50 text-rose-600"
                              }`}
                            >
                              {order.review_decision === "approved"
                                ? "已核准"
                                : "已駁回"}
                            </span>
                          </td>
                          <td data-label="審核人">
                            <p className="font-bold text-slate-700">
                              {order.reviewer_name || "未知審核人"}
                            </p>
                            {order.reviewer_discord_id ? (
                              <p className="mt-1 text-xs text-slate-400">
                                {order.reviewer_discord_id}
                              </p>
                            ) : null}
                          </td>
                          <td data-label="原因">
                            {order.review_reason || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className={`${activeTab === "orders" || activeTab === "tips" ? "block" : "hidden"} rounded-[28px] border border-sky-100 bg-white shadow-sm shadow-sky-100`}>
              <div className="border-b border-sky-100 px-5 py-4">
                <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
                  <WalletCards size={20} className="text-sky-500" />
                  {formatMonthLabel(selectedMonth)}訂單
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  顯示所選月份的薪資訂單。
                </p>
              </div>

              {visibleOrders.length === 0 ? (
                <div className="px-5 py-12 text-center text-sm font-semibold text-slate-400">
                  目前沒有這個月份的訂單
                </div>
              ) : (
                <div className="mobile-table-card overflow-x-auto">
                  <table>
                    <thead>
                      <tr>
                        <th>完成時間</th>
                        <th>客人</th>
                        <th>服務</th>
                        <th>訂單金額</th>
                        <th>薪資</th>
                        <th>獎金</th>
                        <th>狀態</th>
                        <th>發薪時間</th>
                      </tr>
                    </thead>

                    <tbody>
                      {visibleOrders.map((order) => (
                        <tr key={order.id}>
                          <td data-label="完成時間">
                            {formatDateTime(
                              order.order_finished_at ||
                                order.completed_at ||
                                order.created_at
                            )}
                          </td>

                          <td data-label="客人">{getOrderCustomer(order)}</td>

                          <td data-label="服務">{getOrderService(order)}</td>

                          <td
                            data-label="訂單金額"
                            className="font-bold text-slate-700"
                          >
                            {money(getOrderAmount(order))}
                          </td>

                          <td
                            data-label="薪資"
                            className="font-bold text-sky-600"
                          >
                            {money(order.staff_salary)}
                          </td>

                          <td data-label="獎金">{money(order.bonus_amount)}</td>

                          <td data-label="狀態">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-bold ${
                                order.status === "已發薪" ||
                                order.wallet_settled_at
                                  ? "bg-emerald-50 text-emerald-600"
                                  : "bg-amber-50 text-amber-600"
                              }`}
                            >
                              {order.wallet_settled_at
                                ? "已入錢包"
                                : order.status || "未發薪"}
                            </span>
                          </td>

                          <td data-label="發薪時間">
                            {order.wallet_settled_at
                              ? formatDateTime(order.wallet_settled_at)
                              : order.status === "已發薪"
                              ? "已發薪"
                              : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className={`${activeTab === "bonuses" || activeTab === "deductions" ? "block" : "hidden"} rounded-[28px] border border-sky-100 bg-white shadow-sm shadow-sky-100`}>
              <div className="border-b border-sky-100 px-5 py-4">
                <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
                  <Gift size={20} className="text-sky-500" />
                  {formatMonthLabel(selectedMonth)}獎金 / 扣除
                </h2>
              </div>

              {visibleBonuses.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm font-semibold text-slate-400">
                  目前沒有這個月份的獎金或扣除
                </div>
              ) : (
                <div className="mobile-table-card overflow-x-auto">
                  <table>
                    <thead>
                      <tr>
                        <th>時間</th>
                        <th>類型</th>
                        <th>說明</th>
                        <th>金額</th>
                      </tr>
                    </thead>

                    <tbody>
                      {visibleBonuses.map((bonus) => (
                        <tr key={bonus.id}>
                          <td data-label="時間">
                            {formatDateTime(bonus.created_at)}
                          </td>

                          <td data-label="類型">{bonus.bonus_type || "-"}</td>

                          <td data-label="說明">{bonus.description || "-"}</td>

                          <td
                            data-label="金額"
                            className={`font-bold ${
                              Number(bonus.amount || 0) < 0
                                ? "text-red-500"
                                : "text-sky-600"
                            }`}
                          >
                            {money(bonus.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </section>
        </div>
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

function MiniStat({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-sky-100 bg-sky-50/70 px-4 py-3">
      <p className="text-xs font-bold text-sky-600">{title}</p>
      <p className="mt-2 text-xl font-black text-slate-900">{value}</p>
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

function ProgressBar({
  title,
  current,
  target,
  percent,
}: {
  title: string;
  current: number;
  target: number;
  percent: number;
}) {
  return (
    <div className="rounded-[20px] border border-sky-100 bg-sky-50/40 p-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-black text-slate-700">{title}</p>
        <p className="text-sm font-bold text-sky-600">{percent}%</p>
      </div>

      <div className="mt-3 h-3 overflow-hidden rounded-full bg-sky-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-400 to-blue-500"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-xs font-semibold text-slate-500">
        <span>
          {money(current)} / {money(target)}
        </span>
        <span>還差 {money(Math.max(target - current, 0))}</span>
      </div>
    </div>
  );
}
