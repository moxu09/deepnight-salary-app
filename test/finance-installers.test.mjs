import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createFinanceInstallerHandler,FINANCE_ERP_OWNER,FINANCE_ERP_INSTALLER_VERSION,validateFinanceInstallerManifest,financeInstallerPartPath} from '../lib/financeErpInstallers.js';
function fixture({owner=FINANCE_ERP_OWNER,missing=false,corrupt=false,empty=false}={}){
 const binary=Buffer.alloc(2048,1);binary.write('MZ');
 const files=['mac-arm64','mac-x64','windows-x64','android'].map(platform=>({platform,filename:`finance-${platform}.${platform==='windows-x64'?'exe':'zip'}`,size:binary.length,parts:1,version:FINANCE_ERP_INSTALLER_VERSION,sha256:createHash('sha256').update(binary).digest('hex')}));
 let reads=0;
 const storage={from(){return {async download(path){reads++;if(path.endsWith('manifest.json'))return {data:new Blob([JSON.stringify({version:FINANCE_ERP_INSTALLER_VERSION,files})])};if(missing)return {error:Error('missing')};return {data:new Blob([empty?Buffer.alloc(0):corrupt?Buffer.alloc(2048):binary])};}};}};
 return {files,binary,get reads(){return reads;},handler:createFinanceInstallerHandler({storage,authorize:async()=>({discordId:owner})})};
}
const request=(auth='Bearer valid',suffix='')=>new Request('https://eip.example/api/finance-erp-installers'+suffix,{headers:auth?{authorization:auth}:{}});
test('未登入與非擁有者（含一般管理員）不得讀取檔案或清單',async()=>{
 const no=fixture();assert.equal((await no.handler(request(''))).status,401);assert.equal(no.reads,0);
 const other=fixture({owner:'someone-else'});assert.equal((await other.handler(request())).status,403);assert.equal(other.reads,0);
});
test('擁有者取得清單及非空 EXE；回應長度、檔名與完整性一致',async()=>{
 const f=fixture();const list=await f.handler(request());assert.equal((await list.json()).files.length,4);
 const r=await f.handler(request('Bearer valid','?download=windows-x64'));assert.equal(r.status,200);assert.match(r.headers.get('content-disposition'),/\.exe/);assert.equal(Number(r.headers.get('content-length')),2048);assert.deepEqual(Buffer.from(await r.arrayBuffer()),f.binary);assert.match(r.headers.get('cache-control'),/private/);
});
test('缺少分段與校驗損壞不回傳假成功或空安裝檔',async()=>{
 for(const options of [{missing:true},{corrupt:true},{empty:true}]){const f=fixture(options);const r=await f.handler(request('Bearer valid','?download=windows-x64'));assert.equal(r.status,500);assert.match(r.headers.get('content-type'),/json/);}
});
test('清單拒絕舊 Windows ZIP、重複平台、缺平台與路徑穿越',()=>{
 const {files}=fixture();assert.equal(validateFinanceInstallerManifest({version:FINANCE_ERP_INSTALLER_VERSION,files}).length,4);
 for(const filename of ['old.zip','../evil.exe','evil\r\n.exe'])assert.throws(()=>validateFinanceInstallerManifest({version:FINANCE_ERP_INSTALLER_VERSION,files:files.map(f=>f.platform==='windows-x64'?{...f,filename}:f)}));
 assert.throws(()=>validateFinanceInstallerManifest({version:FINANCE_ERP_INSTALLER_VERSION,files:files.slice(1)}));
 assert.throws(()=>validateFinanceInstallerManifest({version:FINANCE_ERP_INSTALLER_VERSION,files:[files[0],files[0],files[2],files[3]]}));
 assert.throws(()=>financeInstallerPartPath('../../private',0));assert.throws(()=>financeInstallerPartPath('windows-x64',16));
});
