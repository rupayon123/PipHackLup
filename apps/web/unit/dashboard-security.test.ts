import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  isDatabaseConfigured: vi.fn(),
}));

const authMocks = vi.hoisted(() => {
  class DiscordAuthUnavailableError extends Error {
    constructor(message = "Discord authentication unavailable") {
      super(message);
      this.name = "DiscordAuthUnavailableError";
    }
  }

  return {
    DiscordAuthUnavailableError,
    findManagedGuild: vi.fn(),
    readDiscordSession: vi.fn(),
  };
});

const rateLimitMocks = vi.hoisted(() => ({
  buildPreAuthRateLimitKey: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock("@piphacklup/db", () => dbMocks);
vi.mock("@/lib/discord-auth", () => authMocks);
vi.mock("@/lib/rate-limit", () => rateLimitMocks);

import { requireOrganizerGuildAccess } from "../lib/dashboard-security";

const manageableGuild = {
  canManage: true,
  id: "111111111111111111",
  isOwner: true,
  name: "PipHackLup Release Lab",
  permissions: "32",
};
const session = {
  guilds: [manageableGuild],
  issuedAt: Date.parse("2026-08-09T12:00:00.000Z"),
  user: { id: "222222222222222222", username: "organizer" },
};
const rateLimit = { limit: 10, windowMs: 60_000 };

function createRequest(query = "") {
  return new NextRequest(
    `https://piphacklup.test/api/setup${query ? `?${query}` : ""}`,
  );
}

async function expectJsonResponse(
  result: Awaited<ReturnType<typeof requireOrganizerGuildAccess>>,
  status: number,
  body: unknown,
) {
  expect(result).toBeInstanceOf(NextResponse);
  const response = result as NextResponse;
  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toEqual(body);
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.isDatabaseConfigured.mockReturnValue(true);
  authMocks.readDiscordSession.mockResolvedValue(session);
  authMocks.findManagedGuild.mockImplementation(
    (candidateSession: typeof session, guildId: string) =>
      candidateSession.guilds.find((guild) => guild.id === guildId) ?? null,
  );
  rateLimitMocks.buildPreAuthRateLimitKey.mockReturnValue(
    "web:setup:trusted-context",
  );
  rateLimitMocks.enforceRateLimit.mockResolvedValue(null);
});

describe("requireOrganizerGuildAccess", () => {
  it("propagates rate limiting before session or database access", async () => {
    const limited = NextResponse.json(
      { error: "rate_limited" },
      { status: 429 },
    );
    rateLimitMocks.enforceRateLimit.mockResolvedValue(limited);
    const request = createRequest(`guildId=${manageableGuild.id}`);

    const result = await requireOrganizerGuildAccess(request, {
      action: "setup",
      rateLimit,
    });

    expect(result).toBe(limited);
    expect(rateLimitMocks.buildPreAuthRateLimitKey).toHaveBeenCalledWith(
      request,
      "setup",
    );
    expect(rateLimitMocks.enforceRateLimit).toHaveBeenCalledWith(request, {
      key: "web:setup:trusted-context",
      policy: rateLimit,
    });
    expect(authMocks.readDiscordSession).not.toHaveBeenCalled();
    expect(dbMocks.isDatabaseConfigured).not.toHaveBeenCalled();
  });

  it("returns 503 when Discord session verification is unavailable", async () => {
    authMocks.readDiscordSession.mockRejectedValue(
      new authMocks.DiscordAuthUnavailableError(),
    );

    const result = await requireOrganizerGuildAccess(
      createRequest(`guildId=${manageableGuild.id}`),
      { action: "setup", rateLimit },
    );

    await expectJsonResponse(result, 503, {
      error: "discord_session_unavailable",
    });
    expect(dbMocks.isDatabaseConfigured).not.toHaveBeenCalled();
  });

  it("returns 503 when a database-backed action has no database", async () => {
    dbMocks.isDatabaseConfigured.mockReturnValue(false);

    const result = await requireOrganizerGuildAccess(
      createRequest(`guildId=${manageableGuild.id}`),
      { action: "setup", rateLimit },
    );

    await expectJsonResponse(result, 503, {
      error: "database_not_configured",
    });
  });

  it("returns 401 when no Discord session is signed in", async () => {
    authMocks.readDiscordSession.mockResolvedValue(null);

    const result = await requireOrganizerGuildAccess(
      createRequest(`guildId=${manageableGuild.id}`),
      { action: "setup", rateLimit },
    );

    await expectJsonResponse(result, 401, {
      error: "discord_login_required",
    });
  });

  it("returns 400 when no guild is selected", async () => {
    const result = await requireOrganizerGuildAccess(createRequest(), {
      action: "setup",
      rateLimit,
    });

    await expectJsonResponse(result, 400, { error: "guild_id_required" });
    expect(authMocks.findManagedGuild).not.toHaveBeenCalled();
  });

  it("returns 403 when the signed-in account cannot manage the guild", async () => {
    const unmanagedGuildId = "333333333333333333";

    const result = await requireOrganizerGuildAccess(
      createRequest(`guildId=${unmanagedGuildId}`),
      { action: "setup", rateLimit },
    );

    await expectJsonResponse(result, 403, { error: "missing_manage_server" });
    expect(authMocks.findManagedGuild).toHaveBeenCalledWith(
      session,
      unmanagedGuildId,
    );
  });

  it("fails closed on an invalid explicit guild instead of using a manageable query guild", async () => {
    const explicitUnmanagedGuildId = "333333333333333333";

    const result = await requireOrganizerGuildAccess(
      createRequest(`guildId=${manageableGuild.id}`),
      {
        action: "setup",
        guildId: explicitUnmanagedGuildId,
        rateLimit,
      },
    );

    await expectJsonResponse(result, 403, { error: "missing_manage_server" });
    expect(authMocks.findManagedGuild).toHaveBeenCalledWith(
      session,
      explicitUnmanagedGuildId,
    );
    expect(authMocks.findManagedGuild).not.toHaveBeenCalledWith(
      session,
      manageableGuild.id,
    );
  });

  it("returns organizer access for the selected manageable guild", async () => {
    const result = await requireOrganizerGuildAccess(
      createRequest(`guildId=${manageableGuild.id}`),
      { action: "setup", rateLimit },
    );

    expect(result).toEqual({
      guild: manageableGuild,
      role: "organizer",
      session,
    });
  });

  it("allows explicitly database-independent access when storage is absent", async () => {
    dbMocks.isDatabaseConfigured.mockReturnValue(false);

    const result = await requireOrganizerGuildAccess(
      createRequest(`guildId=${manageableGuild.id}`),
      {
        action: "installation-status",
        rateLimit,
        requireDatabase: false,
      },
    );

    expect(result).toEqual({
      guild: manageableGuild,
      role: "organizer",
      session,
    });
    expect(dbMocks.isDatabaseConfigured).not.toHaveBeenCalled();
  });
});
