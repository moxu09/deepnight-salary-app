"use client";
import { useEffect,useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useErpAccess } from '@/lib/useErpAccess';
type Installer={platform:string;label:string;filename:string;size:number;sha256:string;version:string};
export default function FinanceInstallers(){
 const {loading,access}=useErpAccess('deepnight');
 const owner=access?.discordId==='847840193859682304';
 const [files,setFiles]=useState<Installer[]>([]),[error,setError]=useState(''),[downloading,setDownloading]=useState('');
 useEffect(()=>{
  if(loading||!owner)return;let cancelled=false;
  void(async()=>{try{const {data}=await supabase.auth.getSession();
   const r=await fetch('/api/finance-erp-installers',{headers:{Authorization:`Bearer ${data.session?.access_token||''}`},cache:'no-store'});
   const body=await r.json();if(!r.ok||!body.ok)throw Error(body.message||'無法讀取安裝包');if(!cancelled)setFiles(body.files);
  }catch(e){if(!cancelled)setError(e instanceof Error?e.message:'無法讀取安裝包');}})();
  return()=>{cancelled=true;};
 },[loading,owner]);
 async function download(file:Installer){setDownloading(file.platform);setError('');try{
  const {data}=await supabase.auth.getSession();
  const r=await fetch(`/api/finance-erp-installers?download=${encodeURIComponent(file.platform)}`,{headers:{Authorization:`Bearer ${data.session?.access_token||''}`},cache:'no-store'});
  if(!r.ok){const body=await r.json();throw Error(body.message||'下載失敗');}
  const bytes=await r.arrayBuffer();if(bytes.byteLength!==file.size)throw Error('下載檔案不完整，請重新下載');
  const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
  if(sha!==file.sha256)throw Error('下載檔案校驗不符，請重新下載');
  const url=URL.createObjectURL(new Blob([bytes]));const a=document.createElement('a');a.href=url;a.download=file.filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
 }catch(e){setError(e instanceof Error?e.message:'下載失敗');}finally{setDownloading('');}}
 if(loading)return <main className="p-8">正在驗證權限…</main>;
 if(!owner)return <main className="p-8">此區域僅供擁有者使用。</main>;
 return <main className="mx-auto max-w-5xl p-6 sm:p-10">
  <p className="text-sm font-bold text-violet-700">私人下載中心</p><h1 className="mt-2 text-3xl font-black text-slate-900">財務 ERP 下載</h1>
  <p className="mt-3 text-sm text-slate-600">原生桌面介面，各平台版本如下。Windows 0.2.19 支援直式螢幕與窄視窗。此入口及下載 API 僅限你的帳號，員工與其他管理員無法下載。</p>
  {error?<p role="alert" className="mt-5 rounded-xl bg-rose-50 p-4 text-rose-700">{error}</p>:null}
  <div className="mt-6 grid gap-4 sm:grid-cols-2">{files.map(file=><section key={file.platform} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
   <h2 className="text-lg font-black text-slate-900">{file.label}</h2><p className="mt-2 text-sm text-slate-600">版本 {file.version} · {(file.size/1024/1024).toFixed(1)} MB · {file.filename.endsWith('.exe')?'EXE':'ZIP'}</p>
   <p className="mt-2 text-xs text-slate-500">{file.platform==='windows-x64'?'下載後直接執行 EXE，不需解壓縮。':file.platform==='android'?'Android 維持原生 0.2.6 版，解壓後安裝 APK。':'解壓後將 App 放入「應用程式」。'}</p>
   <button className="mt-4 rounded-xl bg-violet-600 px-5 py-3 font-bold text-white disabled:opacity-50" disabled={Boolean(downloading)} onClick={()=>void download(file)}>{downloading===file.platform?'下載並驗證中…':`下載 ${file.label}`}</button>
   <details className="mt-4 text-xs text-slate-500"><summary>SHA-256 完整性校驗</summary><p className="mt-2 break-all">{file.sha256}</p></details>
  </section>)}</div><p className="mt-6 text-xs leading-6 text-slate-500">安裝包未完成公開散布簽章／公證。請只從此私人入口取得；下載會在伺服器及瀏覽器核對檔案大小與 SHA-256。</p>
 </main>;
}
