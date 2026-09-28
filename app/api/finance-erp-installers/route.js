import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { authorizeErpRequest, ERP_OWNER_DISCORD_ID } from "@/lib/erpAccess";
import {
  FINANCE_ERP_INSTALLER_BUCKET,
  FINANCE_ERP_INSTALLER_PREFIX,
  FINANCE_ERP_INSTALLER_VERSION,
  financeInstallerPartPath,
  validateFinanceInstallerManifest,
} from "@/lib/financeErpInstallers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorizeOwner(request) {
  if (!/^Bearer\s+\S+/i.test(request.headers.get("authorization") || "")) {
    const error = new Error("請先登入 EIP");
    error.status = 401;
    throw error;
  }
  let access;
  try {
    access = await authorizeErpRequest(supabaseAdmin, request, "qiunai");
  } catch (error) {
    if (/登入|Discord ID/.test(error.message || "")) error.status = 401;
    throw error;
  }
  if (access.discordId !== ERP_OWNER_DISCORD_ID) {
    const error = new Error("只有擁有者可以下載財務 ERP 安裝包");
    error.status = 403;
    throw error;
  }
}

async function readManifest() {
  const { data, error } = await supabaseAdmin.storage
    .from(FINANCE_ERP_INSTALLER_BUCKET)
    .download(`${FINANCE_ERP_INSTALLER_PREFIX}/manifest.json`);
  if (error || !data) throw new Error("尚未上傳財務 ERP 安裝包");
  return validateFinanceInstallerManifest(JSON.parse(await data.text()));
}

export async function GET(request) {
  try {
    await authorizeOwner(request);
    const files = await readManifest();
    const platform = new URL(request.url).searchParams.get("download");
    if (!platform) {
      return Response.json({ ok: true, version: FINANCE_ERP_INSTALLER_VERSION, files: files.map((item) => ({
        platform: item.platform,
        label: item.label,
        filename: item.filename,
        size: item.size,
        sha256: item.sha256,
      })) }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    const file = files.find((item) => item.platform === platform);
    if (!file) return Response.json({ ok: false, message: "找不到此安裝包" }, { status: 404 });

    // Check all parts before sending headers, so a missing part cannot look like a complete ZIP.
    const parts = [];
    for (let index = 0; index < file.parts; index += 1) {
      const { data, error } = await supabaseAdmin.storage
        .from(FINANCE_ERP_INSTALLER_BUCKET)
        .download(financeInstallerPartPath(platform, index));
      if (error || !data) throw new Error("安裝包尚未上傳完整，請稍後再試");
      parts.push(data);
    }
    if (parts.reduce((sum, part) => sum + part.size, 0) !== file.size) {
      throw new Error("安裝包大小不符，請稍後再試");
    }
    let current = 0;
    const stream = new ReadableStream({
      async pull(controller) {
        if (current >= parts.length) return controller.close();
        const reader = parts[current].stream().getReader();
        current += 1;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(file.size),
        "Content-Disposition": `attachment; filename="finance-erp-${platform}-${FINANCE_ERP_INSTALLER_PREFIX.split("/")[1]}.zip"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return Response.json({ ok: false, message: error.message || "下載失敗" }, {
      status: Number(error.status || 500),
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
