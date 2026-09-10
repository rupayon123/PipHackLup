import { NextRequest, NextResponse } from "next/server";
import { requireOrganizerGuildAccess } from "@/lib/dashboard-security";
import {
  DiscordBotApiError,
  getDiscordGuildConfigurationOptions,
  isDiscordBotApiConfigured,
} from "@/lib/discord-installation";
import { webRateLimitPolicies } from "@/lib/rate-limit";

interface RouteContext {
  params: Promise<{ guildId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { guildId } = await context.params;
  const access = await requireOrganizerGuildAccess(request, {
    action: "discord-guild-options-read",
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
    const options = await getDiscordGuildConfigurationOptions(access.guild.id);
    return NextResponse.json(options, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof DiscordBotApiError) {
      return NextResponse.json(
        { error: "discord_guild_options_unavailable" },
        { status: error.status === 429 ? 429 : 502 },
      );
    }
    console.error("PipHackLup could not load Discord role options.");
    return NextResponse.json(
      { error: "discord_guild_options_unavailable" },
      { status: 503 },
    );
  }
}
