"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useErpAccess } from "@/lib/useErpAccess";

const QIUNAI_ERP_ORIGIN =
  process.env.NEXT_PUBLIC_QIUNAI_ERP_ORIGIN ||
  "https://qiunai.wearestilllhere.com";
const ERP_OWNER_DISCORD_ID = "847840193859682304";

const QIUNAI_SECTIONS: Record<string, string> = {
  staff: "/admin/staff",
  salary: "/admin/salary",
  payroll: "/admin/payroll",
  ranking: "/admin/ranking",
  approvals: "/admin/approvals",
  files: "/admin/files",
  accounting: "/admin/accounting",
  settings: "/admin/settings",
};

export default function RemoteDepartmentFrame({
  section,
}: {
  section: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const router = useRouter();
  const { loading, access } = useErpAccess("qiunai");
  const [bridgeError, setBridgeError] = useState("");
  const remotePath = QIUNAI_SECTIONS[section] || QIUNAI_SECTIONS.salary;

  useEffect(() => {
    const handleFrameMessage = async (event: MessageEvent) => {
      if (
        event.origin !== QIUNAI_ERP_ORIGIN ||
        event.source !== iframeRef.current?.contentWindow
      ) {
        return;
      }

      if (event.data?.type === "ERP_COMMON_NAVIGATE") {
        const nextSection = String(event.data.section || "");
        if (QIUNAI_SECTIONS[nextSection]) {
          router.push(`/admin/department/qiunai/${nextSection}`);
        }
        return;
      }
      if (event.data?.type !== "ERP_COMMON_SESSION_REQUEST") return;

      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) {
        setBridgeError("共同後台登入已過期，請重新登入");
        return;
      }

      iframeRef.current?.contentWindow?.postMessage(
        {
          type: "ERP_COMMON_SESSION",
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
        },
        QIUNAI_ERP_ORIGIN,
      );
    };

    window.addEventListener("message", handleFrameMessage);
    return () => window.removeEventListener("message", handleFrameMessage);
  }, [router]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fff7fb]">
        <p className="rounded-2xl bg-white px-6 py-4 text-sm font-bold text-[#80647d] shadow-sm">
          正在載入秋奈部門資料…
        </p>
      </main>
    );
  }

  if (
    !access?.isAdmin ||
    (access.discordId !== ERP_OWNER_DISCORD_ID &&
      access.role !== "super_admin" &&
      access.role !== "store_manager" &&
      access.role !== "customer_service")
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="rounded-2xl bg-white px-6 py-4 text-sm font-bold text-rose-600 shadow-sm">
          你的帳號沒有秋奈部門後台權限。
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#fff7fb]">
      {bridgeError ? (
        <p className="m-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
          {bridgeError}
        </p>
      ) : null}
      <iframe
        ref={iframeRef}
        title={`秋奈電競｜${section}`}
        src={`${QIUNAI_ERP_ORIGIN}${remotePath}?embedded=1`}
        className="block min-h-screen w-full border-0"
        style={{ height: "calc(100vh - 1px)" }}
        allow="clipboard-read; clipboard-write"
      />
    </main>
  );
}
