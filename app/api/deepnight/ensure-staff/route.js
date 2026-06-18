import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function cleanEnv(value) {
  return String(value || "")
    .replaceAll('"', "")
    .replaceAll("'", "")
    .trim();
}

function parseRoleIds(value) {
  return cleanEnv(value)
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export async function POST(req) {
  try {
    const body = await req.json();

    const {
      discord_id,
      discord_name,
      avatar_url
    } = body;

    if (!discord_id) {
      return NextResponse.json(
        {
          ok: false,
          message: "缺少 Discord ID"
        },
        {
          status: 400
        }
      );
    }

    const guildId =
      cleanEnv(
        process.env.DEEP_NIGHT_GUILD_ID ||
        process.env.QIUNAI_GUILD_ID
      );

    const botToken =
      cleanEnv(process.env.DISCORD_BOT_TOKEN);

    const allowedRoleIds =
      parseRoleIds(
        process.env.DEEP_NIGHT_STAFF_ROLE_IDS ||
        process.env.QIUNAI_STAFF_ROLE_IDS
      );

    const staffTable =
      cleanEnv(process.env.NEXT_PUBLIC_STAFF_TABLE) ||
      "players";

    if (!guildId || !botToken || allowedRoleIds.length === 0) {
      console.error("[DEEP_NIGHT_STAFF_CHECK_ENV_MISSING]", {
        hasGuildId: Boolean(guildId),
        hasBotToken: Boolean(botToken),
        allowedRoleIds
      });

      return NextResponse.json(
        {
          ok: false,
          message:
            "深夜不關燈身分組檢查環境變數尚未設定完整，請確認 DISCORD_BOT_TOKEN、DEEP_NIGHT_GUILD_ID、DEEP_NIGHT_STAFF_ROLE_IDS。"
        },
        {
          status: 500
        }
      );
    }

    const memberRes =
      await fetch(
        `https://discord.com/api/v10/guilds/${guildId}/members/${discord_id}`,
        {
          headers: {
            Authorization: `Bot ${botToken}`
          },
          cache: "no-store"
        }
      );

    if (memberRes.status === 404) {
      console.error("[DEEP_NIGHT_STAFF_CHECK_NOT_IN_GUILD]", {
        discord_id,
        guildId
      });

      return NextResponse.json(
        {
          ok: false,
          message: "你目前不在深夜不關燈伺服器內，無法使用薪資網。"
        },
        {
          status: 403
        }
      );
    }

    if (!memberRes.ok) {
      const errorText =
        await memberRes.text();

      console.error("[DEEP_NIGHT_STAFF_CHECK_DISCORD_FETCH_FAILED]", {
        status: memberRes.status,
        errorText,
        guildId,
        discord_id
      });

      return NextResponse.json(
        {
          ok: false,
          message:
            "檢查 Discord 身分組失敗，請確認機器人是否在伺服器內，且 Token 正確。"
        },
        {
          status: 500
        }
      );
    }

    const member =
      await memberRes.json();

    const userRoleIds =
      Array.isArray(member.roles)
        ? member.roles.map((id) => String(id).trim())
        : [];

    const matchedRoleIds =
      userRoleIds.filter((roleId) =>
        allowedRoleIds.includes(roleId)
      );

    const hasAllowedRole =
      matchedRoleIds.length > 0;

    console.log("[DEEP_NIGHT_STAFF_CHECK]", {
      discord_id,
      discord_name,
      guildId,
      allowedRoleIds,
      userRoleIds,
      matchedRoleIds,
      hasAllowedRole
    });

    if (!hasAllowedRole) {
      return NextResponse.json(
        {
          ok: false,
          message: "你尚未擁有深夜不關燈員工身分組，無法使用薪資網。"
        },
        {
          status: 403
        }
      );
    }

    const { data: existing, error: findError } =
      await supabaseAdmin
        .from(staffTable)
        .select("*")
        .eq("discord_id", discord_id)
        .maybeSingle();

    if (findError) {
      console.error("[DEEP_NIGHT_ENSURE_STAFF_FIND_ERROR]", findError);

      return NextResponse.json(
        {
          ok: false,
          message: "讀取員工資料失敗"
        },
        {
          status: 500
        }
      );
    }

    if (existing) {
      const { data: updated, error: updateError } =
        await supabaseAdmin
          .from(staffTable)
          .update({
            discord_name,
            avatar_url,
            role_checked: true,
            is_active: true,
            updated_at: new Date().toISOString()
          })
          .eq("discord_id", discord_id)
          .select("*")
          .single();

      if (updateError) {
        console.error("[DEEP_NIGHT_ENSURE_STAFF_UPDATE_ERROR]", updateError);

        return NextResponse.json(
          {
            ok: false,
            message: "更新員工資料失敗"
          },
          {
            status: 500
          }
        );
      }

      return NextResponse.json({
        ok: true,
        staff: updated
      });
    }

    const { data: created, error: createError } =
      await supabaseAdmin
        .from(staffTable)
        .insert({
          discord_id,
          discord_name,
          avatar_url,
          display_name: discord_name,
          role_checked: true,
          is_active: true,
          is_online: false,
          can_take_order: true
        })
        .select("*")
        .single();

    if (createError) {
      console.error("[DEEP_NIGHT_ENSURE_STAFF_CREATE_ERROR]", createError);

      return NextResponse.json(
        {
          ok: false,
          message: "自動建立深夜不關燈員工資料失敗"
        },
        {
          status: 500
        }
      );
    }

    return NextResponse.json({
      ok: true,
      staff: created
    });
  } catch (error) {
    console.error("[DEEP_NIGHT_ENSURE_STAFF_ERROR]", error);

    return NextResponse.json(
      {
        ok: false,
        message: "系統錯誤，請稍後再試"
      },
      {
        status: 500
      }
    );
  }
}