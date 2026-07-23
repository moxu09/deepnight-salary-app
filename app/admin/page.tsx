"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import ErpWelcome from "@/components/ErpWelcome";
import { supabase } from "@/lib/supabase";
import { getDiscordIdFromSession } from "@/lib/discordSession";

export default function AdminHomePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  async function boot() {
    setChecking(true);

    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session) {
        router.replace("/admin-login");
        return;
      }

      const discordId = getDiscordIdFromSession(session);

      if (!discordId) {
        alert("無法取得 Discord ID，請重新登入。");
        await supabase.auth.signOut();
        router.replace("/admin-login");
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
        router.replace("/staff");
        return;
      }

      if (!admin) {
        alert("你沒有後台管理權限");
        router.replace("/staff");
        return;
      }
    } catch (error) {
      console.error("admin boot error:", error);
      alert("檢查後台權限失敗");
      router.replace("/staff");
    } finally {
      setChecking(false);
    }
  }

  const bootEffect = useEffectEvent(boot);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void bootEffect(), 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

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

  return <ErpWelcome organization="deepnight" />;
}
