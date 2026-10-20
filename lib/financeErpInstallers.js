import { createHash } from 'node:crypto';

export const FINANCE_ERP_INSTALLER_BUCKET = 'finance-erp-installers';
export const FINANCE_ERP_INSTALLER_VERSION = '0.2.19';
export const FINANCE_ERP_INSTALLER_PREFIX = 'releases/0.2.19-windows-portrait-20261017';
export const FINANCE_ERP_OWNER = '847840193859682304';
const PLATFORMS = {'mac-arm64':'Mac（Apple 晶片）','mac-x64':'Mac（Intel）','windows-x64':'Windows（64 位元）',android:'Android'};

export function validateFinanceInstallerManifest(raw) {
  if(raw?.version!==FINANCE_ERP_INSTALLER_VERSION || !Array.isArray(raw.files)) throw Error('安裝包清單版本不正確');
  const seen=new Set();
  const files=raw.files.map(file=>{
    const extension=file.platform==='windows-x64'?'.exe':'.zip';
    if(!Object.hasOwn(PLATFORMS,file.platform)||seen.has(file.platform)||typeof file.filename!=='string'||
      !file.filename.endsWith(extension)||/[\\/\r\n\u0000]/.test(file.filename)||
      !Number.isSafeInteger(file.size)||file.size<1024||file.size>200*1024*1024||
      !Number.isInteger(file.parts)||file.parts<1||file.parts>16||!/^[a-f0-9]{64}$/.test(file.sha256)||
      !/^\d+\.\d+\.\d+$/.test(file.version)) throw Error('安裝包清單內容不正確');
    seen.add(file.platform);
    return {platform:file.platform,label:PLATFORMS[file.platform],filename:file.filename,size:file.size,parts:file.parts,sha256:file.sha256,version:file.version};
  });
  if(seen.size!==Object.keys(PLATFORMS).length) throw Error('安裝包清單不完整');
  return files;
}
export function financeInstallerPartPath(platform,index) {
  if(!Object.hasOwn(PLATFORMS,platform)||!Number.isInteger(index)||index<0||index>=16) throw Error('安裝包檔案路徑不正確');
  return `${FINANCE_ERP_INSTALLER_PREFIX}/${platform}/part-${String(index).padStart(2,'0')}`;
}
export function createFinanceInstallerHandler({storage,authorize}) {
  return async function GET(request) {
    const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
    try {
      if(!/^Bearer\s+\S+$/i.test(request.headers.get('authorization')||'')) return Response.json({ok:false,message:'請先登入 EIP'},{status:401,headers});
      const access=await authorize(request);
      if(access?.discordId!==FINANCE_ERP_OWNER) return Response.json({ok:false,message:'只有擁有者可以下載財務 ERP 安裝包'},{status:403,headers});
      const bucket=storage.from(FINANCE_ERP_INSTALLER_BUCKET);
      const manifest=await bucket.download(`${FINANCE_ERP_INSTALLER_PREFIX}/manifest.json`);
      if(manifest.error||!manifest.data) throw Error('尚未上傳完整的安裝包清單');
      const files=validateFinanceInstallerManifest(JSON.parse(await manifest.data.text()));
      const platform=new URL(request.url).searchParams.get('download');
      if(!platform) return Response.json({ok:true,version:FINANCE_ERP_INSTALLER_VERSION,files:files.map(({parts,...file})=>file)},{headers});
      const file=files.find(x=>x.platform===platform);
      if(!file) return Response.json({ok:false,message:'找不到此安裝包'},{status:404,headers});
      const chunks=[];const hash=createHash('sha256');let size=0;
      for(let index=0;index<file.parts;index++) {
        const part=await bucket.download(financeInstallerPartPath(platform,index));
        if(part.error||!part.data) throw Error('安裝包分段遺失，請稍後再試');
        const chunk=new Uint8Array(await part.data.arrayBuffer());
        if(!chunk.length) throw Error('安裝包分段為空，請稍後再試');
        chunks.push(chunk);size+=chunk.length;hash.update(chunk);
      }
      if(size!==file.size||hash.digest('hex')!==file.sha256) throw Error('安裝包完整性驗證失敗，請稍後再試');
      const magic=chunks[0];
      if(platform==='windows-x64'?(magic[0]!==77||magic[1]!==90):(magic[0]!==80||magic[1]!==75)) throw Error('安裝包格式不正確');
      let current=0;
      const stream=new ReadableStream({pull(controller){if(current===chunks.length)controller.close();else controller.enqueue(chunks[current++]);}});
      return new Response(stream,{headers:{...headers,'Content-Type':platform==='windows-x64'?'application/octet-stream':'application/zip','Content-Length':String(size),
        'Content-Disposition':`attachment; filename="finance-erp-${platform}-${file.version}.${platform==='windows-x64'?'exe':'zip'}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`}});
    } catch(error) {
      const status=Number(error.status)||(/登入|token|JWT|Discord ID/i.test(error.message||'')?401:500);
      return Response.json({ok:false,message:status===401?'登入已失效，請重新登入':error.message||'下載失敗'},{status,headers});
    }
  };
}
