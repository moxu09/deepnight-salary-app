// Publish only the Windows update; retain the existing Mac/Android files and ACLs.
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {FINANCE_ERP_INSTALLER_BUCKET as bucket,FINANCE_ERP_INSTALLER_PREFIX as prefix,FINANCE_ERP_INSTALLER_VERSION as version,validateFinanceInstallerManifest,financeInstallerPartPath} from '../lib/financeErpInstallers.js';
const env=JSON.parse(execFileSync('/Users/moxu/.npm/_npx/d991ede4b4a6395c/node_modules/@railway/cli/bin/railway',['variables','--json'],{encoding:'utf8'}));
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY);
const info=await db.storage.getBucket(bucket);if(info.error||info.data.public)throw Error('Private bucket required');
const storage=db.storage.from(bucket),oldPrefix='releases/0.2.18-restored-20261017';
const old=await storage.download(`${oldPrefix}/manifest.json`);if(old.error)throw old.error;
const manifest=JSON.parse(await old.data.text());manifest.version=version;
for(const file of manifest.files){
 if(file.platform==='windows-x64'){
  const bytes=await readFile('/Users/moxu/Documents/Codex/2026-08-31/new-chat-2/finance-erp-desktop/build/releases/0.2.19/publish/win-x64/FinanceERP.exe');
  if(bytes[0]!==77||bytes[1]!==90)throw Error('Expected Windows PE');
  const partSize=16*1024*1024;
  Object.assign(file,{filename:'財務-ERP-0.2.19-windows-x64.exe',version,size:bytes.length,parts:Math.ceil(bytes.length/partSize),sha256:createHash('sha256').update(bytes).digest('hex')});
  for(let i=0;i<file.parts;i++){
   const result=await storage.upload(financeInstallerPartPath(file.platform,i),bytes.subarray(i*partSize,(i+1)*partSize),{upsert:true,contentType:'application/octet-stream',cacheControl:'0'});
   if(result.error)throw result.error;console.log(`Windows upload ${i+1}/${file.parts}`);
  }
 }else{
  for(let i=0;i<file.parts;i++){
   const oldPath=`${oldPrefix}/${file.platform}/part-${String(i).padStart(2,'0')}`;
   const result=await storage.copy(oldPath,financeInstallerPartPath(file.platform,i));
   if(result.error&&!/already exists|duplicate/i.test(result.error.message))throw result.error;
  }
 }
 const hash=createHash('sha256');let size=0;
 for(let i=0;i<file.parts;i++){
  const result=await storage.download(financeInstallerPartPath(file.platform,i));if(result.error)throw result.error;
  const bytes=Buffer.from(await result.data.arrayBuffer());size+=bytes.length;hash.update(bytes);
 }
 if(size!==file.size||hash.digest('hex')!==file.sha256)throw Error(`${file.platform}: cloud verification failed`);
 console.log(`${file.platform} ${file.version}: verified ${size} bytes`);
}
validateFinanceInstallerManifest(manifest);
const result=await storage.upload(`${prefix}/manifest.json`,Buffer.from(JSON.stringify(manifest)),{upsert:true,cacheControl:'0',contentType:'application/json'});if(result.error)throw result.error;
console.log('New private manifest published; all original release files retained');
