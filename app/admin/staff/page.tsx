"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft,
  CheckCircle2,
  Gamepad2,
  Loader2,
  RefreshCw,
  Save,
  Search,
  Settings2,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";

type Staff = {
  id: string;
  discord_id: string;
  discord_name?: string | null;
  display_name?: string | null;
  real_name?: string | null;
  gender?: string | null;
  birthday?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  salary_channel_id?: string | null;
  avatar_url?: string | null;
  is_active?: boolean | null;
  is_online?: boolean | null;
  can_take_order?: boolean | null;
  allowed_services?: string[] | null;
  commission_tier?: string | null;
  commission_note?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type StaffForm = {
  display_name: string;
  real_name: string;
  gender: string;
  birthday: string;
  bank_name: string;
  bank_account: string;
  salary_channel_id: string;
  commission_tier: string;
  commission_note: string;
  is_active: boolean;
  is_online: boolean;
  can_take_order: boolean;
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

function getServiceName(key: string) {
  return ALL_SERVICES.find((item) => item.key === key)?.name || key;
}

function getServiceCategory(key: string) {
  return ALL_SERVICES.find((item) => item.key === key)?.category || "其他";
}

function getDisplayName(staff: Staff | null) {
  if (!staff) return "未選擇員工";

  return (
    staff.display_name ||
    staff.real_name ||
    staff.discord_name ||
    staff.discord_id ||
    "未知員工"
  );
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

function makeForm(staff: Staff | null): StaffForm {
  return {
    display_name: staff?.display_name || "",
    real_name: staff?.real_name || "",
    gender: staff?.gender || "",
    birthday: staff?.birthday || "",
    bank_name: staff?.bank_name || "",
    bank_account: staff?.bank_account || "",
    salary_channel_id: staff?.salary_channel_id || "",
    commission_tier: staff?.commission_tier || "auto",
    commission_note: staff?.commission_note || "",
    is_active: staff?.is_active !== false,
    is_online: Boolean(staff?.is_online),
    can_take_order: staff?.can_take_order !== false,
  };
}

export default function AdminStaffPage() {
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(true);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [form, setForm] = useState<StaffForm>(makeForm(null));
  const [allowedServices, setAllowedServices] = useState<string[]>([]);
  const [keyword, setKeyword] = useState("");
  const [saving, setSaving] = useState(false);
  const [serviceSaving, setServiceSaving] = useState(false);

  const filteredStaff = useMemo(() => {
    const key = keyword.trim().toLowerCase();

    if (!key) return staffList;

    return staffList.filter((staff) => {
      const text = [
        staff.discord_id,
        staff.discord_name,
        staff.display_name,
        staff.real_name,
        staff.salary_channel_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return text.includes(key);
    });
  }, [staffList, keyword]);

  const activeCount = staffList.filter((staff) => staff.is_active !== false).length;
  const onlineCount = staffList.filter((staff) => staff.is_online).length;

  useEffect(() => {
    boot();
  }, []);

  async function boot() {
    setChecking(true);

    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session) {
        window.location.href = "/admin-login";
        return;
      }

      const discordId = getDiscordIdFromSession(session);

      if (!discordId) {
        alert("無法取得 Discord ID，請重新登入。");
        await supabase.auth.signOut();
        window.location.href = "/admin-login";
        return;
      }

      const { data: admin, error } = await supabase
        .from("admins")
        .select("*")
        .eq("discord_id", discordId)
        .eq("is_active", true)
        .maybeSingle();

      if (error) {
        console.error("check admin error:", error);
        alert("檢查後台權限失敗");
        window.location.href = "/staff";
        return;
      }

      if (!admin) {
        alert("你沒有後台管理權限");
        window.location.href = "/staff";
        return;
      }

      await loadStaff();
    } catch (error) {
      console.error("admin staff boot error:", error);
      alert("檢查後台權限失敗");
      window.location.href = "/staff";
    } finally {
      setChecking(false);
    }
  }

  async function loadStaff() {
    setLoading(true);

    const { data, error } = await supabase
      .from("players")
      .select("*")
      .order("created_at", { ascending: false });

    setLoading(false);

    if (error) {
      console.error("load staff error:", error);
      alert("讀取員工資料失敗");
      return;
    }

    const list = (data || []) as Staff[];
    setStaffList(list);

    if (!selectedStaff && list.length > 0) {
      selectStaff(list[0]);
    } else if (selectedStaff) {
      const updated = list.find((item) => item.id === selectedStaff.id);
      if (updated) selectStaff(updated);
    }
  }

  async function selectStaff(staff: Staff) {
    setSelectedStaff(staff);
    setForm(makeForm(staff));

    const services = Array.isArray(staff.allowed_services)
      ? staff.allowed_services
      : [];

    const { data, error } = await supabase
      .from("players_services")
      .select("*")
      .eq("discord_id", staff.discord_id)
      .eq("enabled", true);

    if (error) {
      console.error("load staff services error:", error);
      setAllowedServices(services);
      return;
    }

    const serviceKeys = (data || [])
      .map((item: any) => String(item.service_key || "").trim())
      .filter(Boolean);

    setAllowedServices(serviceKeys.length > 0 ? serviceKeys : services);
  }

  function updateForm<K extends keyof StaffForm>(key: K, value: StaffForm[K]) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function toggleService(serviceKey: string) {
    setAllowedServices((prev) => {
      if (prev.includes(serviceKey)) {
        return prev.filter((key) => key !== serviceKey);
      }

      return [...prev, serviceKey];
    });
  }

  async function saveStaff() {
    if (!selectedStaff) return;

    setSaving(true);

    const { data, error } = await supabase
      .from("players")
      .update({
        display_name: form.display_name || null,
        real_name: form.real_name || null,
        gender: form.gender || null,
        birthday: form.birthday || null,
        bank_name: form.bank_name || null,
        bank_account: form.bank_account || null,
        salary_channel_id: form.salary_channel_id || null,
        commission_tier: form.commission_tier || "auto",
        commission_note: form.commission_note || null,
        is_active: form.is_active,
        is_online: form.is_online,
        can_take_order: form.can_take_order,
        updated_at: new Date().toISOString(),
      })
      .eq("id", selectedStaff.id)
      .select("*")
      .single();

    setSaving(false);

    if (error) {
      console.error("save staff error:", error);
      alert("儲存員工資料失敗");
      return;
    }

    const updated = data as Staff;

    setSelectedStaff(updated);
    setStaffList((prev) =>
      prev.map((staff) => (staff.id === updated.id ? updated : staff))
    );

    alert("員工資料已儲存");
  }

  async function saveServices() {
    if (!selectedStaff) return;

    setServiceSaving(true);

    const { error: updateStaffError } = await supabase
      .from("players")
      .update({
        allowed_services: allowedServices,
        updated_at: new Date().toISOString(),
      })
      .eq("id", selectedStaff.id);

    if (updateStaffError) {
      setServiceSaving(false);
      console.error("update staff services error:", updateStaffError);
      alert("儲存可接服務失敗");
      return;
    }

    const { error: deleteError } = await supabase
      .from("players_services")
      .delete()
      .eq("discord_id", selectedStaff.discord_id);

    if (deleteError) {
      setServiceSaving(false);
      console.error("delete services error:", deleteError);
      alert("儲存可接服務失敗");
      return;
    }

    if (allowedServices.length > 0) {
      const rows = allowedServices.map((serviceKey) => ({
        discord_id: selectedStaff.discord_id,
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
        alert("儲存可接服務失敗");
        return;
      }
    }

    setStaffList((prev) =>
      prev.map((staff) =>
        staff.id === selectedStaff.id
          ? {
              ...staff,
              allowed_services: allowedServices,
            }
          : staff
      )
    );

    setSelectedStaff((prev) =>
      prev
        ? {
            ...prev,
            allowed_services: allowedServices,
          }
        : prev
    );

    setServiceSaving(false);
    alert("可接服務已儲存");
  }

  async function refresh() {
    await loadStaff();
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#eef7fd]">
        <div className="rounded-[28px] border border-sky-100 bg-white px-8 py-7 text-center shadow-sm shadow-sky-100">
          <Loader2 className="mx-auto animate-spin text-sky-500" size={34} />
          <p className="mt-4 text-sm font-semibold text-slate-600">
            正在檢查後台權限...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#eef7fd] px-5 py-6 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-[30px] border border-sky-100 bg-white px-6 py-5 shadow-sm shadow-sky-100">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 text-sm font-bold text-sky-600 hover:text-sky-700"
              >
                <ArrowLeft size={16} />
                回管理後台
              </Link>

              <p className="mt-4 text-sm font-bold text-sky-600">
                DeepNight Admin
              </p>

              <h1 className="mt-1 text-2xl font-black text-slate-900 md:text-3xl">
                員工管理
              </h1>

              <p className="mt-2 text-sm text-slate-500">
                管理員工資料、上下線狀態、抽成檔位、薪資頻道與可接服務。
              </p>
            </div>

            <button
              onClick={refresh}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-sky-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm shadow-sky-200 hover:bg-sky-600 disabled:opacity-60"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              重新整理
            </button>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <StatCard title="員工總數" value={`${staffList.length} 人`} />
          <StatCard title="啟用中" value={`${activeCount} 人`} />
          <StatCard title="目前上線" value={`${onlineCount} 人`} />
        </section>

        <section className="grid gap-5 xl:grid-cols-[0.85fr_1.4fr]">
          <div className="rounded-[28px] border border-sky-100 bg-white shadow-sm shadow-sky-100">
            <div className="border-b border-sky-100 p-5">
              <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
                <Users size={20} className="text-sky-500" />
                員工列表
              </h2>

              <div className="mt-4 flex items-center gap-2 rounded-2xl border border-sky-100 bg-sky-50/60 px-3 py-2">
                <Search size={17} className="text-sky-500" />
                <input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="搜尋名稱、Discord ID、頻道 ID"
                  className="min-h-0 flex-1 border-none bg-transparent p-0 text-sm outline-none focus:shadow-none"
                />
              </div>
            </div>

            <div className="max-h-[720px] overflow-y-auto p-3">
              {loading ? (
                <div className="py-12 text-center text-sm font-semibold text-slate-400">
                  讀取中...
                </div>
              ) : filteredStaff.length === 0 ? (
                <div className="py-12 text-center text-sm font-semibold text-slate-400">
                  沒有符合的員工
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredStaff.map((staff) => {
                    const active = selectedStaff?.id === staff.id;

                    return (
                      <button
                        key={staff.id}
                        onClick={() => selectStaff(staff)}
                        className={`w-full rounded-[20px] border px-4 py-3 text-left transition ${
                          active
                            ? "border-sky-300 bg-sky-50 shadow-sm"
                            : "border-sky-100 bg-white hover:bg-sky-50"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-sky-100 text-sky-600">
                            {staff.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={staff.avatar_url}
                                alt="avatar"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <UserRound size={22} />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-black text-slate-900">
                              {getDisplayName(staff)}
                            </p>

                            <p className="mt-0.5 truncate text-xs font-semibold text-slate-400">
                              {staff.discord_id}
                            </p>
                          </div>

                          <div className="flex flex-col items-end gap-1">
                            <span
                              className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                                staff.is_active !== false
                                  ? "bg-emerald-50 text-emerald-600"
                                  : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {staff.is_active !== false ? "啟用" : "停用"}
                            </span>

                            <span
                              className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                                staff.is_online
                                  ? "bg-sky-50 text-sky-600"
                                  : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {staff.is_online ? "上線" : "下線"}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-[28px] border border-sky-100 bg-white p-5 shadow-sm shadow-sky-100">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
                    <Settings2 size={20} className="text-sky-500" />
                    員工資料
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    目前選擇：{getDisplayName(selectedStaff)}
                  </p>
                </div>

                <button
                  onClick={saveStaff}
                  disabled={!selectedStaff || saving}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-sky-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm shadow-sky-200 hover:bg-sky-600 disabled:opacity-60"
                >
                  <Save size={16} />
                  {saving ? "儲存中..." : "儲存員工資料"}
                </button>
              </div>

              {!selectedStaff ? (
                <div className="mt-8 rounded-2xl bg-sky-50 px-5 py-8 text-center text-sm font-semibold text-slate-400">
                  請先選擇一位員工
                </div>
              ) : (
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <Field label="顯示名稱">
                    <input
                      value={form.display_name}
                      onChange={(event) =>
                        updateForm("display_name", event.target.value)
                      }
                      placeholder="顯示於薪資網"
                    />
                  </Field>

                  <Field label="真實姓名">
                    <input
                      value={form.real_name}
                      onChange={(event) =>
                        updateForm("real_name", event.target.value)
                      }
                      placeholder="用於發薪紀錄"
                    />
                  </Field>

                  <Field label="性別">
                    <select
                      value={form.gender}
                      onChange={(event) => updateForm("gender", event.target.value)}
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
                      value={form.birthday}
                      onChange={(event) =>
                        updateForm("birthday", event.target.value)
                      }
                    />
                  </Field>

                  <Field label="銀行名稱">
                    <input
                      value={form.bank_name}
                      onChange={(event) =>
                        updateForm("bank_name", event.target.value)
                      }
                      placeholder="例如：玉山銀行"
                    />
                  </Field>

                  <Field label="銀行帳號">
                    <input
                      value={form.bank_account}
                      onChange={(event) =>
                        updateForm("bank_account", event.target.value)
                      }
                      placeholder="薪轉帳號"
                    />
                  </Field>

                  <Field label="個人薪資頻道 ID">
                    <input
                      value={form.salary_channel_id}
                      onChange={(event) =>
                        updateForm("salary_channel_id", event.target.value)
                      }
                      placeholder="Discord 頻道 ID"
                    />
                  </Field>

                  <Field label="抽成檔位">
                    <select
                      value={form.commission_tier}
                      onChange={(event) =>
                        updateForm("commission_tier", event.target.value)
                      }
                    >
                      <option value="auto">自動判定</option>
                      <option value="rate_80">80%</option>
                      <option value="rate_85">85%</option>
                      <option value="rate_90">90%</option>
                      <option value="manager_95">主管津貼 95%</option>
                    </select>
                  </Field>

                  <Field label="抽成備註">
                    <textarea
                      value={form.commission_note}
                      onChange={(event) =>
                        updateForm("commission_note", event.target.value)
                      }
                      placeholder="可填寫後台備註"
                      className="md:col-span-2"
                    />
                  </Field>

                  <div className="md:col-span-2 grid gap-3 md:grid-cols-3">
                    <SwitchBox
                      title="帳號啟用"
                      desc="關閉後不列入可管理員工"
                      checked={form.is_active}
                      onChange={() => updateForm("is_active", !form.is_active)}
                    />

                    <SwitchBox
                      title="目前上線"
                      desc="控制客人選陪陪看到的狀態"
                      checked={form.is_online}
                      onChange={() => updateForm("is_online", !form.is_online)}
                    />

                    <SwitchBox
                      title="允許接單"
                      desc="關閉後不列入派單名單"
                      checked={form.can_take_order}
                      onChange={() =>
                        updateForm("can_take_order", !form.can_take_order)
                      }
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-[28px] border border-sky-100 bg-white p-5 shadow-sm shadow-sky-100">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
                    <Gamepad2 size={20} className="text-sky-500" />
                    可接服務
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    這會同步寫入 players.allowed_services 與 players_services。
                  </p>
                </div>

                <button
                  onClick={saveServices}
                  disabled={!selectedStaff || serviceSaving}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-sky-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm shadow-sky-200 hover:bg-sky-600 disabled:opacity-60"
                >
                  <CheckCircle2 size={16} />
                  {serviceSaving ? "儲存中..." : "儲存可接服務"}
                </button>
              </div>

              {!selectedStaff ? (
                <div className="mt-8 rounded-2xl bg-sky-50 px-5 py-8 text-center text-sm font-semibold text-slate-400">
                  請先選擇一位員工
                </div>
              ) : (
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  {Object.entries(SERVICE_GROUPS).map(([groupName, items]) => (
                    <div
                      key={groupName}
                      className="rounded-[22px] border border-sky-100 bg-sky-50/40 p-4"
                    >
                      <h3 className="font-black text-sky-700">{groupName}</h3>

                      <div className="mt-3 space-y-2">
                        {items.map((item) => {
                          const checked = allowedServices.includes(item.key);

                          return (
                            <label
                              key={item.key}
                              className="flex cursor-pointer items-center justify-between gap-3 rounded-[16px] border border-sky-100 bg-white px-3 py-2 text-sm transition hover:bg-sky-50"
                            >
                              <span className="font-semibold text-slate-700">
                                {item.name}
                              </span>

                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleService(item.key)}
                              />
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
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

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-slate-600">
        {label}
      </span>

      {children}
    </label>
  );
}

function SwitchBox({
  title,
  desc,
  checked,
  onChange,
}: {
  title: string;
  desc: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`rounded-[20px] border px-4 py-3 text-left transition ${
        checked
          ? "border-sky-200 bg-sky-50"
          : "border-slate-200 bg-white hover:bg-slate-50"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-800">{title}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">{desc}</p>
        </div>

        <span
          className={`h-5 w-5 rounded-full border ${
            checked ? "border-sky-500 bg-sky-500" : "border-slate-300 bg-white"
          }`}
        />
      </div>
    </button>
  );
}