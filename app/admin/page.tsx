"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  Loader2,
  Settings,
  Users,
  WalletCards,
  Trophy,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

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

export default function AdminHomePage() {
  const [checking, setChecking] = useState(true);

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
    } catch (error) {
      console.error("admin boot error:", error);
      alert("檢查後台權限失敗");
      window.location.href = "/staff";
    } finally {
      setChecking(false);
    }
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
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="rounded-[36px] border border-sky-100 bg-white px-8 py-10 shadow-sm shadow-sky-100">
          <p className="text-sm font-black tracking-wide text-sky-600 md:text-lg">
            DeepNight Admin
          </p>

          <h1 className="mt-5 text-3xl font-black text-slate-900 md:text-4xl">
            深夜不關燈｜管理後台
          </h1>

          <p className="mt-6 text-base font-semibold leading-8 text-slate-500 md:text-lg">
            管理員可在這裡維護員工資料、薪資資料、系統通知與發薪設定。
          </p>
        </header>

        <section className="grid gap-7 md:grid-cols-2">
          <AdminCard
            href="/admin/staff"
            icon={<Users size={38} />}
            title="員工管理"
            description="設定員工資料、上線狀態、可接服務、個人薪資頻道 ID。"
          />

          <AdminCard
            href="/admin/salary"
            icon={<WalletCards size={38} />}
            title="薪資總表"
            description="查看收入、支出、獎金、訂單薪資與發薪狀態。"
          />

          <AdminCard
            href="/admin/salary-rank"
            icon={<Trophy size={38} />}
            title="員工薪資排序"
            description="查看每位員工薪水總額，可依薪資升冪或降冪排序。"
          />

          <AdminCard
            href="/admin/payroll"
            icon={<Banknote size={38} />}
            title="發薪模式"
            description="彙整有薪水要發的員工、薪水、獎金、銀行帳號與戶名。"
          />

          <AdminCard
            href="/admin/settings"
            icon={<Settings size={38} />}
            title="系統設定"
            description="設定管理總報告頻道、發薪日與薪資通知相關設定。"
          />
        </section>
      </div>
    </main>
  );
}

function AdminCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-[36px] border border-sky-100 bg-white p-8 shadow-sm shadow-sky-100 transition hover:-translate-y-1 hover:border-sky-200 hover:shadow-md hover:shadow-sky-100"
    >
      <div className="flex min-h-[260px] flex-col justify-between">
        <div>
          <div className="flex h-24 w-24 items-center justify-center rounded-[28px] bg-sky-50 text-sky-600">
            {icon}
          </div>

          <h2 className="mt-10 text-2xl font-black text-slate-900">{title}</h2>

          <p className="mt-8 text-base font-semibold leading-8 text-slate-500">
            {description}
          </p>
        </div>

        <div className="mt-6 flex justify-end text-sky-500 transition group-hover:translate-x-1">
          <ArrowRight size={30} />
        </div>
      </div>
    </Link>
  );
}
