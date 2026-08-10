import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getGuildConfigFromDb: vi.fn(),
  saveGuildConfigInDb: vi.fn(),
}));
const securityMocks = vi.hoisted(() => ({
  requireOrganizerGuildAccess: vi.fn(),
}));
const auditMocks = vi.hoisted(() => ({
  recordAuditAfterCommit: vi.fn(),
}));
const discordMocks = vi.hoisted(() => ({
  getDiscordGuildConfigurationOptions: vi.fn(),
}));
const requestSecurityMocks = vi.hoisted(() => ({
  hasTrustedMutationOrigin: vi.fn(),
}));
const rateLimitMocks = vi.hoisted(() => ({
  webRateLimitPolicies: { dashboardWrite: { limit: 20, windowMs: 60_000 } },
}));

vi.mock("@piphacklup/db", () => dbMocks);
vi.mock("@/lib/dashboard-security", () => securityMocks);
vi.mock("@/lib/audit-log", () => auditMocks);
vi.mock("@/lib/discord-installation", () => discordMocks);
vi.mock("@/lib/request-security", () => requestSecurityMocks);
vi.mock("@/lib/rate-limit", () => rateLimitMocks);

import { POST } from "../app/api/discord/guilds/[guildId]/config/route";

const APP_URL = "https://piphacklup.test";
const GUILD_ID = "123456789012345678";
const OTHER_GUILD_ID = "223456789012345678";
const USER_ID = "323456789012345678";
const PARTICIPANT_ROLE_ID = "423456789012345678";
const ORGANIZER_ROLE_ID = "523456789012345678";
const HELP_CHANNEL_ID = "623456789012345678";
const CATEGORY_ID = "723456789012345678";

const currentConfig = {
  guildId: GUILD_ID,
  eventName: "Old event",
  onboardingMode: "guided" as const,
  teamSizeMin: 2,
  teamSizeMax: 4,
  queueKinds: ["mentor", "tech", "judging", "staff"] as const,
  roles: { participant: PARTICIPANT_ROLE_ID },
  channels: {},
  resources: { eventCategoryId: CATEGORY_ID },
};

beforeEach(() => {
  vi.clearAllMocks();
  requestSecurityMocks.hasTrustedMutationOrigin.mockReturnValue(true);
  securityMocks.requireOrganizerGuildAccess.mockResolvedValue({
    guild: { id: GUILD_ID, name: "Toronto Youth Hackathon" },
    role: "organizer",
    session: { user: { id: USER_ID } },
  });
  dbMocks.getGuildConfigFromDb.mockResolvedValue(currentConfig);
  dbMocks.saveGuildConfigInDb.mockResolvedValue(currentConfig);
  discordMocks.getDiscordGuildConfigurationOptions.mockResolvedValue({
    roles: [
      { id: PARTICIPANT_ROLE_ID, name: "Participant" },
      { id: ORGANIZER_ROLE_ID, name: "Organizer" },
    ],
    channels: [{ id: HELP_CHANNEL_ID, name: "#help-desk" }],
  });
  auditMocks.recordAuditAfterCommit.mockResolvedValue(null);
});

describe("guild configuration route", () => {
  it("rejects an untrusted origin before authentication or database work", async () => {
    requestSecurityMocks.hasTrustedMutationOrigin.mockReturnValue(false);

    const response = await POST(makeRequest(validBody()), routeContext());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "untrusted_request_origin",
    });
    expect(securityMocks.requireOrganizerGuildAccess).not.toHaveBeenCalled();
    expect(dbMocks.getGuildConfigFromDb).not.toHaveBeenCalled();
  });

  it("propagates organizer access failures without reading configuration", async () => {
    const denied = NextResponse.json(
      { error: "missing_manage_server" },
      { status: 403 },
    );
    securityMocks.requireOrganizerGuildAccess.mockResolvedValue(denied);

    const response = await POST(makeRequest(validBody()), routeContext());

    expect(response).toBe(denied);
    expect(dbMocks.getGuildConfigFromDb).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "an invalid team range",
      body: validBody({ teamSizeMin: 8, teamSizeMax: 4 }),
      error: "invalid_team_size",
    },
    {
      label: "an attempt to edit protected internal resources",
      body: { ...validBody(), resources: { eventCategoryId: OTHER_GUILD_ID } },
      error: "invalid_server_config",
    },
    {
      label: "an unknown role key",
      body: validBody({ roles: { administrator: ORGANIZER_ROLE_ID } }),
      error: "invalid_discord_option",
    },
  ])("rejects $label before any write", async ({ body, error }) => {
    const response = await POST(makeRequest(body), routeContext());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error });
    expect(dbMocks.getGuildConfigFromDb).not.toHaveBeenCalled();
    expect(dbMocks.saveGuildConfigInDb).not.toHaveBeenCalled();
  });

  it("uses the path guild, verifies live choices, preserves bot resources, and audits", async () => {
    const response = await POST(
      makeRequest(
        validBody({
          eventName: "  Toronto Build Weekend  ",
          onboardingMode: "gated",
          roles: { organizer: ORGANIZER_ROLE_ID },
          channels: { helpDesk: HELP_CHANNEL_ID },
        }),
        OTHER_GUILD_ID,
      ),
      routeContext(),
    );

    expect(response.status).toBe(200);
    expect(securityMocks.requireOrganizerGuildAccess).toHaveBeenCalledWith(
      expect.any(NextRequest),
      {
        action: "discord-guild-config-write",
        rateLimit: rateLimitMocks.webRateLimitPolicies.dashboardWrite,
        guildId: GUILD_ID,
      },
    );
    expect(dbMocks.getGuildConfigFromDb).toHaveBeenCalledWith(GUILD_ID);
    expect(
      discordMocks.getDiscordGuildConfigurationOptions,
    ).toHaveBeenCalledWith(GUILD_ID);
    expect(dbMocks.saveGuildConfigInDb).toHaveBeenCalledWith(
      {
        guildId: GUILD_ID,
        eventName: "Toronto Build Weekend",
        onboardingMode: "gated",
        teamSizeMin: 2,
        teamSizeMax: 5,
        queueKinds: ["mentor", "tech", "judging", "staff"],
        roles: {
          participant: PARTICIPANT_ROLE_ID,
          organizer: ORGANIZER_ROLE_ID,
        },
        channels: { helpDesk: HELP_CHANNEL_ID },
        resources: { eventCategoryId: CATEGORY_ID },
      },
      "Toronto Youth Hackathon",
    );
    expect(auditMocks.recordAuditAfterCommit).toHaveBeenCalledWith({
      guildId: GUILD_ID,
      actorId: USER_ID,
      action: "guild.config.update",
      targetType: "guild",
      targetId: GUILD_ID,
      metadata: {
        onboardingMode: "gated",
        teamSizeMin: 2,
        teamSizeMax: 5,
        roleCount: 2,
        channelCount: 1,
      },
    });
    await expect(response.json()).resolves.toMatchObject({
      config: {
        guildId: GUILD_ID,
        eventName: "Toronto Build Weekend",
        resources: { eventCategoryId: CATEGORY_ID },
      },
      warning: null,
    });
  });

  it("fails closed when a selected Discord option no longer exists", async () => {
    discordMocks.getDiscordGuildConfigurationOptions.mockResolvedValue({
      roles: [{ id: PARTICIPANT_ROLE_ID, name: "Participant" }],
      channels: [],
    });

    const response = await POST(
      makeRequest(validBody({ roles: { organizer: ORGANIZER_ROLE_ID } })),
      routeContext(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "discord_option_no_longer_available",
    });
    expect(dbMocks.saveGuildConfigInDb).not.toHaveBeenCalled();
    expect(auditMocks.recordAuditAfterCommit).not.toHaveBeenCalled();
  });

  it("does not write when Discord cannot verify selected options", async () => {
    discordMocks.getDiscordGuildConfigurationOptions.mockRejectedValue(
      new Error("Discord unavailable"),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const response = await POST(makeRequest(validBody()), routeContext());

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        error: "discord_options_unavailable",
      });
      expect(dbMocks.saveGuildConfigInDb).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it("returns an honest warning when the config commits but audit recording fails", async () => {
    auditMocks.recordAuditAfterCommit.mockResolvedValue(
      "activity_log_unavailable",
    );

    const response = await POST(makeRequest(validBody()), routeContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      warning: "activity_log_unavailable",
    });
  });
});

function validBody(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    eventName: "Toronto Build Weekend",
    onboardingMode: "guided",
    teamSizeMin: 2,
    teamSizeMax: 5,
    roles: {},
    channels: {},
    ...overrides,
  };
}

function makeRequest(body: unknown, queryGuildId?: string): NextRequest {
  const query = queryGuildId ? `?guildId=${queryGuildId}` : "";
  return new NextRequest(
    `${APP_URL}/api/discord/guilds/${GUILD_ID}/config${query}`,
    {
      method: "POST",
      headers: {
        origin: APP_URL,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
}

function routeContext() {
  return { params: Promise.resolve({ guildId: GUILD_ID }) };
}
