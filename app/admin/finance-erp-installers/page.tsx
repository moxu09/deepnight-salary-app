"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useErpAccess } from "@/lib/useErpAccess";

const OWNER_DISCORD_ID = "847840193859682304";
type Installer = { platform: string; label: string; filename: string; size: number; sha256: string };

export default function FinanceErpInstallersPage() {
  const { loading, access } = useErpAccess("qiunai");
  const owner = access?.discordId === OWNER_DISCORD_ID;
  const [files, setFiles] = useState<Installer[]>([]);
  const [message, setMessage] = useState("");
  const [downloading, setDownloading] = useState("");

  useEffect(() => {
    if (loading || !owner) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const response = await fetch("/api/finance-erp-installers", {
        headers: { Authorization: `Bearer ${data.session?.access_token || ""}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (cancelled) return;
      if (response.ok) setFiles(payload.files || []);
      else setMessage(payload.message || "無法載入安裝包");
    })();
    return () => { cancelled = true; };
  }, [loading, owner]);

  async function download(file: Installer) {
    setDownloading(file.platform);
    setMessage("");
    try {
      const { data } = await supabase.auth.getSession();
      const response = await fetch(`/api/finance-erp-installers?download=${encodeURIComponent(file.platform)}`, {
        headers: { Authorization: `Bearer ${data.session?.access_token || ""}` },
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || "下載失敗");
      }
      const blob = await response.blob();
      if (blob.size !== file.size) throw new Error("下載檔案大小不正確，請重新下載");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.filename;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "下載失敗");
    } finally {
      setDownloading("");
    }
  }

  if (loading) return <main className="p-8">正在驗證權限…</main>;
  if (!owner) return <main className="p-8">此區域僅供擁有者使用。</main>;

  return (
    <main className="mx-auto max-w-4xl p-6 sm:p-10">
      <h1 className="text-2xl font-black text-slate-900">財務 ERP 安裝包</h1>
      <p className="mt-2 text-sm text-slate-600">0.2.3 原生介面測試版，支援 Discord 跳轉登入。此頁及檔案僅你的帳號可存取，員工資料下載區不會顯示。</p>
      {message ? <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{message}</p> : null}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {files.map((file) => (
          <div key={file.platform} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-bold text-slate-900">{file.label}</h2>
            <p className="mt-1 text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(1)} MB · ZIP</p>
            <button type="button" onClick={() => void download(file)} disabled={Boolean(downloading)} className="mt-4 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
              {downloading === file.platform ? "下載中…" : "下載安裝包"}
            </button>
          </div>
        ))}
      </div>
      <p className="mt-6 text-xs leading-6 text-slate-500">Mac 與 Windows 安裝包尚未正式簽章；Android 為測試簽章，安裝前請確認裝置與版本。下載後可用頁面所列 SHA-256 校驗。</p>
      {files.length ? <details className="mt-3 text-xs text-slate-500"><summary>檔案 SHA-256</summary>{files.map((file) => <p key={file.platform} className="mt-2 break-all">{file.label}：{file.sha256}</p>)}</details> : null}
    </main>
  );
}
