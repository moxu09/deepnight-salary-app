"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ExternalLink, FileSignature, Loader2, RotateCcw, ShieldCheck, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

export type StaffAnnouncement = {
  id: string;
  title: string;
  content: string;
  is_active?: boolean;
  attachment_name?: string | null;
  has_attachment?: boolean;
  requires_signature?: boolean;
  signature_deadline?: string | null;
  signature?: { status: string; read_confirmed_at?: string | null; signed_at?: string | null } | null;
};

function SignaturePad({ onChange }: { onChange: (value: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const ink = useRef(false);
  function context() { const canvas = canvasRef.current; const ctx = canvas?.getContext("2d"); if (!ctx) return null; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = 4; ctx.strokeStyle = "#111827"; return ctx; }
  function point(event: React.PointerEvent<HTMLCanvasElement>) { const canvas = canvasRef.current!; const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left) / rect.width * canvas.width, y: (event.clientY - rect.top) / rect.height * canvas.height }; }
  function start(event: React.PointerEvent<HTMLCanvasElement>) { const ctx = context(); if (!ctx) return; event.currentTarget.setPointerCapture(event.pointerId); const next = point(event); ctx.beginPath(); ctx.moveTo(next.x, next.y); drawing.current = true; }
  function move(event: React.PointerEvent<HTMLCanvasElement>) { if (!drawing.current) return; const ctx = context(); if (!ctx) return; const next = point(event); ctx.lineTo(next.x, next.y); ctx.stroke(); ink.current = true; }
  function end() { drawing.current = false; if (ink.current && canvasRef.current) onChange(canvasRef.current.toDataURL("image/png")); }
  function clear() { const canvas = canvasRef.current; const ctx = context(); if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height); ink.current = false; onChange(""); }
  return <div><div className="mb-2 flex items-center justify-between"><p className="text-sm font-black text-slate-700">手寫正楷簽名 <span className="text-rose-600">＊必填</span></p><button type="button" onClick={clear} className="inline-flex items-center gap-1 text-xs font-bold text-slate-500"><RotateCcw size={13}/>清除重簽</button></div><div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-violet-200 bg-white"><div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="absolute inset-4 bg-contain bg-center bg-no-repeat opacity-[0.06]" style={{ backgroundImage: "url('/employment/deepnight-logo.png')" }}/><span className="rotate-[-10deg] text-xs font-black tracking-wider text-amber-800/15">僅供深夜不關燈工作室營運使用</span></div><canvas ref={canvasRef} width={900} height={260} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} className="relative z-10 h-40 w-full touch-none bg-transparent" aria-label="手寫正楷簽名"/></div></div>;
}

export default function AnnouncementSigningList({ announcements, apiPath, onComplete }: { announcements: StaffAnnouncement[]; apiPath: string; onComplete: () => Promise<void> | void }) {
  const signingApi = apiPath.replace(/\/hr(?:\?.*)?$/, "/announcement-signing");
  const [selected, setSelected] = useState<StaffAnnouncement | null>(null);
  const [documentUrl, setDocumentUrl] = useState("");
  const [ready, setReady] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [stage, setStage] = useState<"review" | "sign">("review");
  const [signature, setSignature] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { if (!selected) return; const timer = window.setTimeout(() => setReady(true), 3000); return () => window.clearTimeout(timer); }, [selected]);
  async function token() { const { data } = await supabase.auth.getSession(); if (!data.session) throw new Error("請重新登入 EIP"); return data.session.access_token; }
  async function open(item: StaffAnnouncement) {
    setBusy(true); setError(""); setReady(false); setSelected(item); setDocumentUrl(""); setConfirmed(false); setSignature("");
    setStage(item.signature?.read_confirmed_at && item.signature.status !== "signed" ? "sign" : "review");
    try { const auth = await token(); const response = await fetch(`${signingApi}?announcementId=${encodeURIComponent(item.id)}`, { headers: { Authorization: `Bearer ${auth}` }, cache: "no-store" }); const payload = await response.json().catch(() => ({})); if (!response.ok || !payload.document?.url) throw new Error(payload.message || "開啟公告文件失敗"); setDocumentUrl(payload.document.url); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "開啟公告文件失敗"); }
    finally { setBusy(false); }
  }
  async function confirmRead() {
    if (!selected || !ready || !confirmed) return;
    setBusy(true); setError("");
    try { const auth = await token(); const response = await fetch(signingApi, { method: "PATCH", headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json" }, body: JSON.stringify({ announcementId: selected.id }) }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.message || "儲存閱讀確認失敗"); setStage("sign"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "儲存閱讀確認失敗"); }
    finally { setBusy(false); }
  }
  async function submit() {
    if (!selected || !signature) return;
    setBusy(true); setError("");
    try { const auth = await token(); const response = await fetch(signingApi, { method: "POST", headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json" }, body: JSON.stringify({ announcementId: selected.id, signatureDataUrl: signature }) }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.message || "完成公告簽署失敗"); setSelected(null); await onComplete(); alert("公告文件簽署完成，PDF 已存入 EIP 員工檔案區"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "完成公告簽署失敗"); }
    finally { setBusy(false); }
  }

  return <>
    <div className="mt-4 space-y-3">{announcements.length ? announcements.map((item) => { const signed = item.signature?.status === "signed"; const overdue = item.signature_deadline && new Date(item.signature_deadline) < new Date() && !signed; return <article key={item.id} className="rounded-2xl bg-violet-50 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-black text-violet-900">{item.title}</p>{item.requires_signature ? <span className={`rounded-full px-2 py-1 text-[11px] font-black ${signed ? "bg-emerald-100 text-emerald-700" : overdue ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{signed ? "已完成簽署" : overdue ? "逾期未簽" : "需要簽署"}</span> : null}</div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{item.content}</p>{item.signature_deadline ? <p className="mt-2 text-xs font-bold text-slate-500">簽署期限：{new Date(item.signature_deadline).toLocaleString("zh-TW")}</p> : null}</div>{item.has_attachment ? <button type="button" onClick={() => void open(item)} className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-black text-violet-700 shadow-sm">{item.requires_signature && !signed ? <FileSignature size={15}/> : <ExternalLink size={15}/>} {item.requires_signature && !signed ? "詳閱並簽署" : "查看附件"}</button> : null}</div></article>; }) : <p className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">目前沒有公告</p>}</div>
    {selected ? <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-3 sm:p-6"><section className="flex max-h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"><header className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h3 className="font-black text-slate-900">{selected.title}</h3><p className="mt-1 text-xs text-slate-500">{selected.attachment_name}</p></div><button type="button" onClick={() => setSelected(null)} className="rounded-full bg-slate-100 p-2 text-slate-600"><X size={18}/></button></header><div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{error ? <p className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</p> : null}{busy && !documentUrl ? <p className="flex h-[55vh] items-center justify-center gap-2 text-slate-500"><Loader2 className="animate-spin"/>載入文件中…</p> : documentUrl ? <iframe title={selected.title} src={documentUrl} className="h-[55vh] w-full rounded-2xl border border-slate-200 bg-slate-100"/> : null}{selected.requires_signature && selected.signature?.status !== "signed" ? <div className="mt-5">{stage === "review" ? <><label className={`flex items-start gap-3 rounded-2xl border p-4 ${ready ? "cursor-pointer border-violet-200" : "cursor-not-allowed border-slate-100 opacity-50"}`}><input type="checkbox" checked={confirmed} disabled={!ready} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1 h-5 w-5"/><span className="text-sm font-bold leading-6">我已完整詳閱上述文件，並同意使用電子文件及手寫電子簽章完成簽署。</span></label><button type="button" disabled={!ready || !confirmed || busy} onClick={() => void confirmRead()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-5 py-3 font-black text-white disabled:opacity-40">{busy ? <Loader2 className="animate-spin" size={18}/> : <ShieldCheck size={18}/>}已詳閱全部內容，開始簽署</button></> : <><SignaturePad onChange={setSignature}/><p className="mt-2 text-xs font-bold text-slate-500">簽署後會產生附帶原始文件雜湊、閱讀時間、Discord 身分驗證與簽署時間的 PDF。</p><button type="button" disabled={!signature || busy} onClick={() => void submit()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-5 py-3 font-black text-white disabled:opacity-40">{busy ? <Loader2 className="animate-spin" size={18}/> : <CheckCircle2 size={18}/>}確認並完成簽署</button></>}</div> : null}</div></section></div> : null}
  </>;
}
