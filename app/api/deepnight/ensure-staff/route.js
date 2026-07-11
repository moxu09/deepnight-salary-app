import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DISCORD_API = "https://discord.com/api/v10";

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function splitIds(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function getBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function getAccessTokenFromRequest(request, body) {
  const auth = request.headers.get("authorization") || "";

  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }

  return String(
    body?.access_token || body?.token || body?.session?.access_token || ""
  ).trim();
}

function getDiscordIdFromUser(user) {
  const metadata = user?.user_metadata || {};
  const identityData = user?.identities?.[0]?.identity_data || {};

  return String(
    metadata.provider_id ||
      metadata.sub ||
      metadata.user_id ||
      identityData.sub ||
      identityData.id ||
      ""
  ).trim();
}

function getNameFromSupabaseUser(user) {
  const metadata = user?.user_metadata || {};
  const identityData = user?.identities?.[0]?.identity_data || {};

  return String(
    metadata.full_name ||
      metadata.name ||
      metadata.user_name ||
      metadata.preferred_username ||
      identityData.full_name ||
      identityData.name ||
      identityData.username ||
      ""
  ).trim();
}

function getDiscordAvatarUrl(discordUser) {
  const userId = discordUser?.id;
  const avatar = discordUser?.avatar;

  if (!userId || !avatar) return null;

  const ext = String(avatar).startsWith("a_") ? "gif" : "png";

  return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.${ext}`;
}

async function handler(request) {
  const body = await getBody(request);

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const guildId =
    process.env.DEEPNIGHT_GUILD_ID ||
    process.env.NEXT_PUBLIC_DEEPNIGHT_GUILD_ID ||
    process.env.NEXT_PUBLIC_GUILD_ID ||
    "1501098191813214312";

  const botToken = process.env.DISCORD_BOT_TOKEN;

  const staffRoleIds = splitIds(
    process.env.DEEPNIGHT_STAFF_ROLE_IDS ||
      process.env.DEEPNIGHT_STAFF_ROLE_ID ||
      process.env.STAFF_ROLE_IDS ||
      process.env.STAFF_ROLE_ID
  );

  if (!supabaseUrl || !serviceRoleKey) {
    return json(
      {
        ok: false,
        message:
          "伺服器缺少 Supabase 設定，請確認 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY。",
      },
      500
    );
  }

  if (!botToken) {
    return json(
      {
        ok: false,
        message: "伺服器缺少 DISCORD_BOT_TOKEN，無法檢查 Discord 身分組。",
      },
      500
    );
  }

  if (!staffRoleIds.length) {
    return json(
      {
        ok: false,
        message: "伺服器缺少員工身分組設定，請設定 DEEPNIGHT_STAFF_ROLE_IDS。",
      },
      500
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const accessToken = getAccessTokenFromRequest(request, body);

  let user = null;
  let discordId = "";
  let fallbackMode = false;

  if (accessToken) {
    const { data: userResult, error: userError } =
      await supabaseAdmin.auth.getUser(accessToken);

    if (!userError && userResult?.user) {
      user = userResult.user;
      discordId = getDiscordIdFromUser(user);
    }
  }

  if (!discordId) {
    discordId = String(body?.discord_id || body?.discordId || "").trim();
    fallbackMode = true;
  }

  if (!discordId) {
    return json(
      {
        ok: false,
        message:
          "沒有收到登入 token，也沒有收到 Discord ID。請重新登入後再試一次。",
      },
      401
    );
  }

  const memberRes = await fetch(
    `${DISCORD_API}/guilds/${guildId}/members/${discordId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bot ${botToken}`,
      },
      cache: "no-store",
    }
  );

  if (memberRes.status === 404) {
    return json(
      {
        ok: false,
        message: "你不在 DeepNight Discord 群組內，無法登入員工端。",
        discord_id: discordId,
      },
      403
    );
  }

  if (!memberRes.ok) {
    const text = await memberRes.text().catch(() => "");

    return json(
      {
        ok: false,
        message: "Discord 身分組檢查失敗，請確認 Bot Token、群組 ID 是否正確。",
        discord_status: memberRes.status,
        detail: text,
      },
      500
    );
  }

  const member = await memberRes.json();
  const memberRoles = Array.isArray(member.roles) ? member.roles : [];

  const hasStaffRole = staffRoleIds.some((roleId) =>
    memberRoles.includes(roleId)
  );

  if (!hasStaffRole) {
    return json(
      {
        ok: false,
        message: "你沒有 DeepNight 員工身分組，無法登入員工端。",
        discord_id: discordId,
        your_roles: memberRoles,
        required_roles: staffRoleIds,
      },
      403
    );
  }

  const discordUser = member.user || {};

  const discordUsername =
    discordUser.username ||
    body?.discord_name ||
    getNameFromSupabaseUser(user) ||
    discordId;

  const displayName =
    member.nick ||
    discordUser.global_name ||
    body?.discord_name ||
    getNameFromSupabaseUser(user) ||
    discordUsername ||
    discordId;

  const avatarUrl =
    getDiscordAvatarUrl(discordUser) || body?.avatar_url || null;

  const now = new Date().toISOString();

  const updatePayload = {
    auth_user_id: user?.id || null,
    guild_id: guildId,
    discord_id: discordId,
    discord_name: discordUsername,
    display_name: displayName,
    avatar_url: avatarUrl,
    is_active: true,
    can_take_order: true,
    updated_at: now,
  };

  const { data: existingRows, error: findError } = await supabaseAdmin
    .from("players")
    .select("id, discord_id")
    .eq("discord_id", discordId)
    .limit(1);

  if (findError) {
    return json(
      {
        ok: false,
        message: "查詢員工資料失敗。",
        detail: findError.message,
      },
      500
    );
  }

  let staff = null;

  if (existingRows && existingRows.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("players")
      .update(updatePayload)
      .eq("id", existingRows[0].id)
      .select("*")
      .single();

    if (error) {
      return json(
        {
          ok: false,
          message: "更新員工資料失敗。",
          detail: error.message,
        },
        500
      );
    }

    staff = data;
  } else {
    const { data, error } = await supabaseAdmin
      .from("players")
      .insert({
        ...updatePayload,
        real_name: null,
        is_online: false,
        commission_tier: "auto",
        commission_note: null,
        allowed_services: [],
        created_at: now,
      })
      .select("*")
      .single();

    if (error) {
      return json(
        {
          ok: false,
          message: "新增員工資料失敗。",
          detail: error.message,
        },
        500
      );
    }

    staff = data;
  }

  return json({
    ok: true,
    message: "員工身分驗證成功。",
    discord_id: discordId,
    fallback_mode: fallbackMode,
    staff,
    player: staff,
  });
}

export async function POST(request) {
  return handler(request);
}

export async function GET(request) {
  return handler(request);
}
