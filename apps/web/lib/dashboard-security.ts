import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@piphacklup/db";
import {
  findManagedGuild,
  readDiscordSession,
  type DiscordSession,
  type ManagedDiscordGuild,
} from "@/lib/discord-auth";
import {
  buildRateLimitKey,
  enforceRateLimit,
  getClientIp,
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
  },
): Promise<DashboardAccess | NextResponse> {
  const guildId = request.nextUrl.searchParams.get("guildId");
  const session = await readDiscordSession();
  const rateLimitResponse = enforceRateLimit(request, {
    key: buildRateLimitKey([
      "web",
      options.action,
      session?.user.id ?? `ip-${getClientIp(request)}`,
      guildId ?? "no-guild",
    ]),
    policy: options.rateLimit,
  });
  if (rateLimitResponse) return rateLimitResponse;

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
