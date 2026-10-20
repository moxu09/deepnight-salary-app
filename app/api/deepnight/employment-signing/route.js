import { NextResponse } from "next/server";
import { getAuthUserFromBearer, getDiscordIdFromUser } from "@/lib/erpAuthLinks";
import {
  completeEmploymentSigning,
  confirmEmploymentContractRead,
  getEmploymentSigning,
} from "@/lib/employmentSigning";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ORGANIZATION = "deepnight";

function responseError(error, fallback) {
  const message = error?.message || fallback;
  const status = /登入|Discord 帳號不是/.test(message) ? 401 : 400;
  return NextResponse.json({ ok: false, message }, { status });
}

export async function GET(request) {
  try {
    const token = new URL(request.url).searchParams.get("token");
    let includePrefill = false;
    const authorization = request.headers.get("authorization") || "";
    if (/^Bearer\s+/i.test(authorization)) {
      const user = await getAuthUserFromBearer(supabaseAdmin, request);
      const signing = await getEmploymentSigning(token);
      includePrefill = getDiscordIdFromUser(user) === signing.discordId;
    }
    return NextResponse.json({
      ok: true,
      signing: await getEmploymentSigning(token, {
        markOpened: true,
        includePrefill,
      }),
    });
  } catch (error) {
    return responseError(error, "讀取簽署邀請失敗");
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json({
      ok: true,
      signing: await confirmEmploymentContractRead(body.token),
    });
  } catch (error) {
    return responseError(error, "儲存閱讀確認失敗");
  }
}

export async function POST(request) {
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 4 * 1024 * 1024) throw new Error("簽署內容過大");
    const user = await getAuthUserFromBearer(supabaseAdmin, request);
    const authDiscordId = getDiscordIdFromUser(user);
    if (!authDiscordId) throw new Error("必須使用 Discord 登入後才能簽署");
    const body = await request.json().catch(() => ({}));
    const forwardedFor = request.headers.get("x-forwarded-for") || "";
    const ipAddress = forwardedFor.split(",")[0]?.trim() || "";
    return NextResponse.json({
      ok: true,
      signing: await completeEmploymentSigning({
        token: body.token,
        organization: ORGANIZATION,
        authUserId: user.id,
        authDiscordId,
        body,
        userAgent: request.headers.get("user-agent"),
        ipAddress,
      }),
    });
  } catch (error) {
    console.error("[employment-signing] submit failed", error);
    return responseError(error, "完成契約簽署失敗");
  }
}
