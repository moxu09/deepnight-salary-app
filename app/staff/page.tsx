"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
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
} from "lucide-react";

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
  其他項目: [
    { key: "pubgm", name: "PUBG M", category: "其他項目" },
    { key: "naraka", name: "NARAKA", category: "其他項目" },
    { key: "minecraft", name: "Minecraft", category: "其他項目" },
    { key: "voice_chat", name: "語音聊天", category: "其他項目" },
    { key: "song", name: "點歌服務", category: "其他項目" },
  ],
};

const ALL_SERVICES = Object.values(SERVICE_GROUPS).flat();

function getNowMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function money(value: number | null | undefined) {
  return `$${Number(value || 0).toLocaleString("zh-TW")}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("zh-TW", {
    hour12: true,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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

function getDiscordIdFromSession(session: any) {
  const user = session?.user;
  const metadata = user?.user_metadata || {};

  return String(
    metadata.provider_id ||
      metadata.sub ||
      metadata.user_id ||
      user?.identities?.[0]?.identity_data?.sub ||
      user?.identities?.[0]?.identity_data?.id ||
      ""
  ).trim();
}

function getDiscordNameFromSession(session: any) {
  const metadata = session?.user?.user_metadata || {};

  return (
    metadata.global_name ||
    metadata.full_name ||
    metadata.name ||
    metadata.preferred_username ||
    metadata.user_name ||
    metadata.username ||
    "Discord 使用者"
  );
}

function getAvatarFromSession(session: any) {
  const metadata = session?.user?.user_metadata || {};
  return metadata.avatar_url || metadata.picture || null;
}

export default function StaffPage() {
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<Staff | null>(null);
  const [salaryOrders, setSalaryOrders] = useState<SalaryOrder[]>([]);
  const [allSalaryOrders, setAllSalaryOrders] = useState<SalaryOrder[]>([]);
  const [bonuses, setBonuses] = useState<Bonus[]>([]);
  const [allowedServices, setAllowedServices] = useState<string[]>([]);
  const [profileSaving, setProfileSaving] = useState(false);
  const [serviceSaving, setServiceSaving] = useState(false);
  const [onlineSaving, setOnlineSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [profileForm, setProfileForm] = useState<ProfileForm>({
    display_name: "",
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

  const unpaidAmount = useMemo(() => {
    const orderTotal = salaryOrders
      .filter((order) => order.status !== "已發薪")
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
    return allSalaryOrders.reduce((sum, order) => sum + getOrderAmount(order), 0);
  }, [allSalaryOrders]);

  const totalYearSalary = useMemo(() => {
    const year = new Date().getFullYear();

    return allSalaryOrders
      .filter((order) => {
        const sourceDate =
          order.order_finished_at || order.completed_at || order.created_at;

        if (!sourceDate) return false;

        return new Date(sourceDate).getFullYear() === year;
      })
      .reduce((sum, order) => sum + Number(order.staff_salary || 0), 0);
  }, [allSalaryOrders]);

  const currentRate = useMemo(() => {
    const manual = getManualRate(staff?.commission_tier);

    if (manual) return manual;
    if (totalYearSalary >= 100000) return 90;
    if (totalOrderAmount >= 10000) return 85;

    return 80;
  }, [staff?.commission_tier, totalOrderAmount, totalYearSalary]);

  const progress85 = Math.min(100, Math.round((totalOrderAmount / 10000) * 100));
  const progress90 = Math.min(100, Math.round((totalYearSalary / 100000) * 100));

  useEffect(() => {
    boot();
  }, []);

  async function boot() {
    setLoading(true);

    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session) {
        window.location.href = "/login";
        return;
      }

      const discordId = getDiscordIdFromSession(session);

      if (!discordId) {
        alert("無法取得 Discord ID，請重新登入。");
        await supabase.auth.signOut();
        window.location.href = "/login";
        return;
      }

      const ensureRes = await fetch("/api/deepnight/ensure-staff", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          discord_id: discordId,
          discord_name: getDiscordNameFromSession(session),
          avatar_url: getAvatarFromSession(session),
        }),
      });

      const ensureData = await ensureRes.json();

      if (!ensureRes.ok || !ensureData.ok) {
        alert(ensureData.message || "員工身分驗證失敗");
        await supabase.auth.signOut();
        window.location.href = "/login";
        return;
      }

      const staffData = ensureData.staff as Staff;

      setStaff(staffData);
      setProfileForm({
        display_name: staffData.display_name || "",
        real_name: staffData.real_name || "",
        gender: staffData.gender || "",
        birthday: staffData.birthday || "",
        bank_name: staffData.bank_name || "",
        bank_account: staffData.bank_account || "",
      });

      await Promise.all([
        loadSalaryData(staffData.discord_id),
        loadStaffServices(staffData.discord_id, staffData.allowed_services || []),
      ]);
    } catch (error) {
      console.error("staff boot error:", error);
      alert("讀取員工資料失敗");
    } finally {
      setLoading(false);
    }
  }

  async function loadSalaryData(discordId: string) {
    const { startIso, endIso } = getNowMonthRange();

    const { data: monthOrders, error: monthError } = await supabase
      .from("play_orders")
      .select("*")
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

    const { data: allOrders, error: allError } = await supabase
      .from("play_orders")
      .select("*")
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
      .map((item: any) => String(item.service_key || "").trim())
      .filter(Boolean);

    setAllowedServices(services.length > 0 ? services : fallback || []);
  }

  async function refreshAll() {
    if (!staff) return;

    setRefreshing(true);

    try {
      await Promise.all([
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

    setStaff(data as Staff);
    alert("個人資料已儲存");
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
    <main className="min-h-screen bg-[#eef7fd] px-5 py-6 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-[30px] border border-sky-100 bg-white px-6 py-5 shadow-sm shadow-sky-100">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-3xl bg-sky-100 text-sky-600">
                {staff.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={staff.avatar_url}
                    alt="avatar"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <UserRound size={30} />
                )}
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

        <section className="grid gap-4 md:grid-cols-4">
          <StatCard title="本月訂單" value={`${monthOrderCount} 筆`} />
          <StatCard title="本月薪資" value={money(monthSalary)} />
          <StatCard title="本月獎金" value={money(monthBonus)} />
          <StatCard title="未發薪" value={money(unpaidAmount)} />
        </section>

        <section className="grid gap-5 xl:grid-cols-[0.9fr_1.4fr]">
          <div className="space-y-5">
            <div className="rounded-[28px] border border-sky-100 bg-white p-5 shadow-sm shadow-sky-100">
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
                    85% 依累積接單金額判定；90% 依年度薪資進度判定。
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

            <div className="rounded-[28px] border border-sky-100 bg-white p-5 shadow-sm shadow-sky-100">
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

            <div className="rounded-[28px] border border-sky-100 bg-white p-5 shadow-sm shadow-sky-100">
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
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-sky-500 px-4 py-3 text-sm font-bold text-white shadow-sm shadow-sky-200 hover:bg-sky-600"
                >
                  <Save size={16} />
                  {profileSaving ? "儲存中..." : "儲存個人資料"}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-[28px] border border-sky-100 bg-white p-5 shadow-sm shadow-sky-100">
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
                  className="rounded-full bg-sky-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm shadow-sky-200 hover:bg-sky-600"
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

            <div className="rounded-[28px] border border-sky-100 bg-white shadow-sm shadow-sky-100">
              <div className="border-b border-sky-100 px-5 py-4">
                <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
                  <WalletCards size={20} className="text-sky-500" />
                  本月訂單
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  顯示本月 1 號到現在的訂單。
                </p>
              </div>

              {salaryOrders.length === 0 ? (
                <div className="px-5 py-12 text-center text-sm font-semibold text-slate-400">
                  目前沒有本月訂單
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
                      {salaryOrders.map((order) => (
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
                                order.status === "已發薪"
                                  ? "bg-emerald-50 text-emerald-600"
                                  : "bg-amber-50 text-amber-600"
                              }`}
                            >
                              {order.status || "未發薪"}
                            </span>
                          </td>

                          <td data-label="發薪時間">
                            {order.status === "已發薪" ? "已發薪" : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-[28px] border border-sky-100 bg-white shadow-sm shadow-sky-100">
              <div className="border-b border-sky-100 px-5 py-4">
                <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
                  <Gift size={20} className="text-sky-500" />
                  本月獎金
                </h2>
              </div>

              {bonuses.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm font-semibold text-slate-400">
                  目前沒有本月獎金
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
                      {bonuses.map((bonus) => (
                        <tr key={bonus.id}>
                          <td data-label="時間">
                            {formatDateTime(bonus.created_at)}
                          </td>

                          <td data-label="類型">{bonus.bonus_type || "-"}</td>

                          <td data-label="說明">
                            {bonus.description || "-"}
                          </td>

                          <td
                            data-label="金額"
                            className="font-bold text-sky-600"
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