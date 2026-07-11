"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BellRing,
  Loader2,
  Save,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getDiscordIdFromSession } from "@/lib/discordSession";
import { formatTaipeiDateTime } from "@/lib/taipeiTime";

type SalarySettings = {
  id: string;
  report_channel_id?: string | null;
  daily_report_enabled?: boolean | null;
  payday_day?: number | null;
  payday_note?: string | null;
  updated_at?: string | null;
};

function formatDateTime(value?: string | null) {
  const formatted = formatTaipeiDateTime(value, {
    hour12: true,
  });
  return formatted === "-" ? "尚未更新" : formatted;
}

export default function AdminSettingsPage() {
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [settings, setSettings] = useState<SalarySettings>({
    id: "main",
    report_channel_id: "",
    daily_report_enabled: true,
    payday_day: 10,
    payday_note: "",
  });

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

      await loadSettings();
    } catch (error) {
      console.error("admin settings boot error:", error);
      alert("檢查後台權限失敗");
      window.location.href = "/staff";
    } finally {
      setChecking(false);
    }
  }

  async function loadSettings() {
    setLoading(true);

    const { data, error } = await supabase
      .from("salary_settings")
      .select("*")
      .eq("id", "main")
      .maybeSingle();

    setLoading(false);

    if (error) {
      console.error("load salary settings error:", error);
      alert("讀取系統設定失敗");
      return;
    }

    if (!data) {
      const { data: created, error: createError } = await supabase
        .from("salary_settings")
        .insert({
          id: "main",
          report_channel_id: "",
          daily_report_enabled: true,
          payday_day: 10,
          payday_note: "",
          updated_at: new Date().toISOString(),
        })
        .select("*")
        .single();

      if (createError) {
        console.error("create salary settings error:", createError);
        alert("建立系統設定失敗");
        return;
      }

      setSettings(created as SalarySettings);
      return;
    }

    setSettings(data as SalarySettings);
  }

  function updateField<K extends keyof SalarySettings>(
    key: K,
    value: SalarySettings[K]
  ) {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  async function saveSettings() {
    setSaving(true);

    const { data, error } = await supabase
      .from("salary_settings")
      .upsert(
        {
          id: "main",
          report_channel_id: settings.report_channel_id || null,
          daily_report_enabled: Boolean(settings.daily_report_enabled),
          payday_day: Number(settings.payday_day || 10),
          payday_note: settings.payday_note || null,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "id",
        }
      )
      .select("*")
      .single();

    setSaving(false);

    if (error) {
      console.error("save salary settings error:", error);
      alert("儲存系統設定失敗");
      return;
    }

    setSettings(data as SalarySettings);
    alert("系統設定已儲存");
  }

  if (checking || loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#eef7fd]">
        <div className="rounded-[28px] border border-sky-100 bg-white px-8 py-7 text-center shadow-sm shadow-sky-100">
          <Loader2 className="mx-auto animate-spin text-sky-500" size={34} />
          <p className="mt-4 text-sm font-semibold text-slate-600">
            正在讀取系統設定...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#eef7fd] px-5 py-6 text-slate-900">
      <div className="mx-auto max-w-5xl space-y-5">
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
                系統設定
              </h1>

              <p className="mt-2 text-sm text-slate-500">
                設定每日薪資報告、管理總頻道與發薪相關資訊。
              </p>
            </div>

            <button
              onClick={saveSettings}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-sky-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm shadow-sky-200 hover:bg-sky-600 disabled:opacity-60"
            >
              <Save size={16} />
              {saving ? "儲存中..." : "儲存設定"}
            </button>
          </div>
        </header>

        <section className="grid gap-5 md:grid-cols-3">
          <InfoCard
            icon={<BellRing size={24} />}
            title="每日報告"
            value={settings.daily_report_enabled ? "已啟用" : "已停用"}
            desc="每日 23:59 發送薪資統計。"
          />

          <InfoCard
            icon={<Settings size={24} />}
            title="發薪日"
            value={`每月 ${settings.payday_day || 10} 號`}
            desc="顯示給員工參考的發薪日。"
          />

          <InfoCard
            icon={<ShieldCheck size={24} />}
            title="最後更新"
            value={formatDateTime(settings.updated_at)}
            desc="最近一次儲存設定的時間。"
          />
        </section>

        <section className="rounded-[30px] border border-sky-100 bg-white p-6 shadow-sm shadow-sky-100">
          <h2 className="text-lg font-black text-slate-900">通知設定</h2>

          <p className="mt-2 text-sm leading-7 text-slate-500">
            這裡會影響機器人每日薪資報表的發送位置。個人薪資頻道請到「員工管理」設定每位員工的
            salary_channel_id。
          </p>

          <div className="mt-6 space-y-5">
            <Field label="管理總報告頻道 ID">
              <input
                value={settings.report_channel_id || ""}
                onChange={(event) =>
                  updateField("report_channel_id", event.target.value)
                }
                placeholder="請貼上 Discord 管理頻道 ID"
              />
            </Field>

            <div className="rounded-[24px] border border-sky-100 bg-sky-50/50 p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-black text-slate-800">
                    每日薪資報告
                  </p>

                  <p className="mt-1 text-sm text-slate-500">
                    開啟後，機器人會在設定時間傳送每日統計。
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    updateField(
                      "daily_report_enabled",
                      !settings.daily_report_enabled
                    )
                  }
                  className={`rounded-full px-5 py-2.5 text-sm font-bold text-white ${
                    settings.daily_report_enabled
                      ? "bg-emerald-500 hover:bg-emerald-600"
                      : "bg-slate-500 hover:bg-slate-600"
                  }`}
                >
                  {settings.daily_report_enabled ? "目前啟用" : "目前停用"}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[30px] border border-sky-100 bg-white p-6 shadow-sm shadow-sky-100">
          <h2 className="text-lg font-black text-slate-900">發薪設定</h2>

          <p className="mt-2 text-sm leading-7 text-slate-500">
            這裡是薪資網顯示用設定，不會自動轉帳，只用於提醒與報表。
          </p>

          <div className="mt-6 grid gap-5 md:grid-cols-[0.45fr_1fr]">
            <Field label="每月發薪日">
              <input
                type="number"
                min={1}
                max={31}
                value={settings.payday_day || 10}
                onChange={(event) =>
                  updateField("payday_day", Number(event.target.value || 10))
                }
                placeholder="例如：10"
              />
            </Field>

            <Field label="發薪備註">
              <textarea
                value={settings.payday_note || ""}
                onChange={(event) =>
                  updateField("payday_note", event.target.value)
                }
                placeholder="例如：每月 10 號發放上月薪資，遇假日順延。"
              />
            </Field>
          </div>
        </section>
      </div>
    </main>
  );
}

function InfoCard({
  icon,
  title,
  value,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  desc: string;
}) {
  return (
    <div className="rounded-[26px] border border-sky-100 bg-white p-5 shadow-sm shadow-sky-100">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
        {icon}
      </div>

      <p className="mt-4 text-sm font-bold text-sky-600">{title}</p>

      <p className="mt-2 text-xl font-black text-slate-900">{value}</p>

      <p className="mt-2 text-sm leading-6 text-slate-500">{desc}</p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
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
