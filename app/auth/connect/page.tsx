"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ErpAuthLinkManager from "@/components/ErpAuthLinkManager";

export default function AuthConnectPage() {
  return (
    <Suspense fallback={<ConnectLoading />}>
      <ConnectContent />
    </Suspense>
  );
}

function ConnectContent() {
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") === "/admin" ? "/admin" : "/staff";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef7fd] px-4 py-10">
      <ErpAuthLinkManager
        organization="deepnight"
        mode="onboarding"
        nextPath={nextPath}
      />
    </main>
  );
}

function ConnectLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef7fd] text-sm font-semibold text-slate-500">
      讀取登入連結設定中...
    </main>
  );
}
