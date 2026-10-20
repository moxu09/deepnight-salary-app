// Upload immutable private files; manifest is published only after every chunk
// has been downloaded again and its full SHA-256 verified.
import {execFileSync} from 'node:child_process';
import {open,readFile,stat} from 'node:fs/promises';
import {basename} from 'node:path';
import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {FINANCE_ERP_INSTALLER_BUCKET as bucketName,FINANCE_ERP_INSTALLER_PREFIX as prefix,FINANCE_ERP_INSTALLER_VERSION,validateFinanceInstallerManifest,financeInstallerPartPath} from '../lib/financeErpInstallers.js';
if(FINANCE_ERP_INSTALLER_VERSION!=='0.2.18')throw Error('舊版完整發佈腳本已停用；請使用 publishFinanceWindowsUpdate.mjs，避免覆蓋新版 Windows。');
const cli='/Users/moxu/.npm/_npx/d991ede4b4a6395c/node_modules/@railway/cli/bin/railway';
const env=JSON.parse(execFileSync(cli,['variables','--json'],{encoding:'utf8'}));
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY);
const desktop='/Users/moxu/Documents/Codex/2026-08-31/new-chat-2/finance-erp-desktop/build/releases/0.2.18/dist';
const input=[['mac-arm64',`${desktop}/財務-ERP-0.2.18-osx-arm64.zip`,'0.2.18'],['mac-x64',`${desktop}/財務-ERP-0.2.18-osx-x64.zip`,'0.2.18'],['windows-x64',`${desktop}/財務-ERP-0.2.18-windows-x64.exe`,'0.2.18'],['android','/Users/moxu/Documents/Codex/2026-08-31/new-chat-2/finance-erp-native-android/build/releases/0.2.6/財務-ERP-原生-Android-0.2.6.zip','0.2.6']];
const buckets=await db.storage.listBuckets();if(buckets.error)throw buckets.error;
const bucket=buckets.data.find(x=>x.name===bucketName);if(!bucket||bucket.public)throw Error('Private installer bucket missing or unexpectedly public');
const storage=db.storage.from(bucketName);const files=[];const partSize=16*1024*1024;
for(const [platform,path,version] of input){
 const size=(await stat(path)).size,parts=Math.ceil(size/partSize),hash=createHash('sha256');const handle=await open(path,'r');
 try{for(let index=0;index<parts;index++){
  const bytes=Buffer.alloc(Math.min(partSize,size-index*partSize));const {bytesRead}=await handle.read(bytes,0,bytes.length,index*partSize);if(bytesRead!==bytes.length)throw Error('Source truncated');hash.update(bytes);
  const result=await storage.upload(financeInstallerPartPath(platform,index),bytes,{contentType:'application/octet-stream',upsert:true,cacheControl:'0'});if(result.error)throw result.error;
  console.log(`${platform} ${index+1}/${parts}`);
 }}finally{await handle.close();}
 const sha256=hash.digest('hex'),verify=createHash('sha256');let downloaded=0;
 for(let index=0;index<parts;index++){const result=await storage.download(financeInstallerPartPath(platform,index));if(result.error)throw result.error;const bytes=Buffer.from(await result.data.arrayBuffer());downloaded+=bytes.length;verify.update(bytes);}
 if(downloaded!==size||verify.digest('hex')!==sha256)throw Error(`${platform}: roundtrip verification failed`);
 files.push({platform,filename:basename(path),size,parts,sha256,version});console.log(`${platform}: verified ${size} bytes`);
}
const manifest={version:'0.2.18',files};validateFinanceInstallerManifest(manifest);
const result=await storage.upload(`${prefix}/manifest.json`,Buffer.from(JSON.stringify(manifest)),{contentType:'application/json',cacheControl:'0',upsert:true});if(result.error)throw result.error;
console.log('Private manifest published: four verified files');
