"use client";

import { supabase } from "@/lib/supabase";
import { ShieldCheck, Sparkles, LockKeyhole } from "lucide-react";

export default function AdminLoginPage() {
  async function loginWithDiscord() {
    const redirectTo = `${window.location.origin}/auth/callback?next=/admin`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: {
        redirectTo,
      },
    });

    if (error) {
      console.error(error);
      alert("Discord 登入失敗");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef7fd] px-4 py-10 text-slate-900">
      <div className="w-full max-w-md">
        <div className="mb-5 flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-[28px] border border-sky-100 bg-white shadow-sm shadow-sky-100">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-300 via-sky-400 to-blue-500 text-white shadow-md shadow-sky-200">
              <ShieldCheck size={30} />
            </div>
          </div>
        </div>

        <div className="rounded-[30px] border border-sky-100 bg-white p-7 shadow-xl shadow-sky-100/70">
          <div className="flex items-center justify-center gap-2">
            <span className="rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700">
              DeepNight Admin
            </span>

            <span className="flex items-center gap-1 rounded-full border border-sky-100 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
              <Sparkles size={13} />
              Admin Only
            </span>
          </div>

          <div className="mt-6 text-center">
            <h1 className="text-3xl font-black tracking-tight text-slate-900">
              深夜不關燈管理後台
            </h1>

            <p className="mt-4 text-sm leading-7 text-slate-600">
              請使用 Discord 登入。系統會檢查你的後台管理員白名單，
              通過後即可管理員工資料、薪資總表與系統設定。
            </p>
          </div>

          <button
            onClick={loginWithDiscord}
            className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-sky-400 to-blue-500 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-sky-200 transition hover:-translate-y-0.5 hover:from-sky-500 hover:to-blue-600 hover:shadow-sky-300"
          >
            <LockKeyhole size={18} />
            使用 Discord 登入後台
          </button>

          <div className="mt-6 rounded-2xl border border-sky-100 bg-sky-50/80 p-4 text-center">
            <p className="text-xs leading-6 text-slate-500">
              僅限已授權管理員使用。
              <br />
              若無法進入後台，請確認 admins 白名單是否已加入你的 Discord ID。
            </p>
          </div>
        </div>

        <p className="mt-5 text-center text-xs font-semibold text-slate-400">
          © 深夜不關燈 We Are Still Here
        </p>
      </div>
    </main>
  );
}
