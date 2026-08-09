import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@piphacklup/db";
import {
  DiscordAuthUnavailableError,
  findManagedGuild,
  readDiscordSession,
  type DiscordSession,
  type ManagedDiscordGuild,
} from "@/lib/discord-auth";
import {
  buildPreAuthRateLimitKey,
  enforceRateLimit,
  type RateLimitPolicy,
} from "@/lib/rate-limit";

export type DashboardRole = "organizer";

export interface DashboardAccess {
  guild: ManagedDiscordGuild;
  role: DashboardRole;
  session: DiscordSession;
}

export async function requireOrganizerGuildAccess(
  request: NextRequest,
  options: {
    action: string;
    rateLimit: RateLimitPolicy;
    requireDatabase?: boolean;
    guildId?: string;
  },
): Promise<DashboardAccess | NextResponse> {
  const guildId =
    options.guildId ?? request.nextUrl.searchParams.get("guildId") ?? undefined;
  const rateLimitResponse = await enforceRateLimit(request, {
    // This bucket runs before authentication, so its cardinality must depend
    // only on trusted request context. Never let an attacker create one
    // persistent database row per arbitrary guildId.
    key: buildPreAuthRateLimitKey(request, options.action),
    policy: options.rateLimit,
  });
  if (rateLimitResponse) return rateLimitResponse;

  let session: DiscordSession | null;
  try {
    session = await readDiscordSession();
  } catch (error) {
    if (error instanceof DiscordAuthUnavailableError) {
      return NextResponse.json(
        { error: "discord_session_unavailable" },
        { status: 503 },
      );
    }
    throw error;
  }
  if (options.requireDatabase !== false && !isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "database_not_configured" },
      { status: 503 },
    );
  }

  if (!session) {
    return NextResponse.json(
      { error: "discord_login_required" },
      { status: 401 },
    );
  }

  if (!guildId) {
    return NextResponse.json({ error: "guild_id_required" }, { status: 400 });
  }

  const guild = findManagedGuild(session, guildId);
  if (!guild) {
    return NextResponse.json(
      { error: "missing_manage_server" },
      { status: 403 },
    );
  }

  return { session, guild, role: "organizer" };
}
