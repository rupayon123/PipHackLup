import { NextRequest, NextResponse } from "next/server";
import {
  createAuditEventInDb,
  markDiscordInstallationInDb,
} from "@piphacklup/db";
import { requireOrganizerGuildAccess } from "@/lib/dashboard-security";
import {
  DiscordBotApiError,
  isDiscordBotApiConfigured,
  leaveDiscordBotGuild,
  listDiscordBotGuildIds,
} from "@/lib/discord-installation";
import { webRateLimitPolicies } from "@/lib/rate-limit";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

interface RouteContext {
  params: Promise<{ guildId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { guildId } = await context.params;
  const access = await requireOrganizerGuildAccess(request, {
    action: "bot-installation-read",
    rateLimit: webRateLimitPolicies.dashboardRead,
    guildId,
  });
  if (access instanceof NextResponse) return access;

  if (!isDiscordBotApiConfigured()) {
    return NextResponse.json(
      { error: "discord_bot_api_not_configured" },
      { status: 503 },
    );
  }

  try {
    const installedGuildIds = await listDiscordBotGuildIds();
    return NextResponse.json(
      {
        guildId: access.guild.id,
        installed: installedGuildIds.has(access.guild.id),
      },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return discordBotApiResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!hasTrustedMutationOrigin(request)) {
    return NextResponse.json(
      { error: "untrusted_request_origin" },
      { status: 403 },
    );
  }

  const { guildId } = await context.params;
  const access = await requireOrganizerGuildAccess(request, {
    action: "bot-installation-delete",
    rateLimit: webRateLimitPolicies.dashboardWrite,
    guildId,
  });
  if (access instanceof NextResponse) return access;

  if (!isDiscordBotApiConfigured()) {
    return NextResponse.json(
      { error: "discord_bot_api_not_configured" },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    confirmGuildName?: unknown;
  } | null;
  if (body?.confirmGuildName !== access.guild.name) {
    return NextResponse.json(
      { error: "guild_name_confirmation_required" },
      { status: 400 },
    );
  }

  try {
    const result = await leaveDiscordBotGuild(access.guild.id);
    let persistenceWarning = false;
    try {
      await markDiscordInstallationInDb(access.guild, false);
      await createAuditEventInDb({
        guildId: access.guild.id,
        actorId: access.session.user.id,
        action: "discord.bot.remove",
        targetType: "guild",
        targetId: access.guild.id,
        metadata: { result },
      });
    } catch {
      persistenceWarning = true;
      console.error(
        "PipHackLup removed the bot but could not record the change.",
      );
    }
    return NextResponse.json({
      guildId: access.guild.id,
      installed: false,
      result,
      ...(persistenceWarning ? { warning: "record_update_failed" } : {}),
    });
  } catch (error) {
    return discordBotApiResponse(error);
  }
}

function discordBotApiResponse(error: unknown): NextResponse {
  if (error instanceof DiscordBotApiError) {
    return NextResponse.json(
      {
        error: "discord_bot_api_failed",
        retryable: error.status === 429 || error.status >= 500,
      },
      { status: error.status === 429 ? 429 : 502 },
    );
  }
  console.error("PipHackLup bot-management request failed.");
  return NextResponse.json(
    { error: "bot_management_unavailable" },
    { status: 503 },
  );
}
