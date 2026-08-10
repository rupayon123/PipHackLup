import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDiscordInstallUrl,
  DiscordBotApiError,
  getDiscordGuildConfigurationOptions,
  leaveDiscordBotGuild,
  listDiscordBotGuildIds,
  parseDiscordChannelOptions,
  parseDiscordRoleOptions,
  verifyDiscordBotApplication,
} from "../lib/discord-installation";

const clientId = "1512918151313231983";
const guildId = "123456789012345678";

afterEach(() => {
  delete process.env.DISCORD_TOKEN;
  delete process.env.DISCORD_CLIENT_ID;
  vi.restoreAllMocks();
});

describe("buildDiscordInstallUrl", () => {
  it("targets and locks a selected managed guild", () => {
    const url = new URL(buildDiscordInstallUrl({ clientId, guildId }));

    expect(url.origin).toBe("https://discord.com");
    expect(url.pathname).toBe("/oauth2/authorize");
    expect(url.searchParams.get("client_id")).toBe(clientId);
    expect(url.searchParams.get("guild_id")).toBe(guildId);
    expect(url.searchParams.get("disable_guild_select")).toBe("true");
    expect(url.searchParams.get("scope")).toBe("bot applications.commands");
    expect(url.searchParams.get("integration_type")).toBe("0");
    expect(url.searchParams.get("permissions")).toBe("1099914365968");
  });

  it("rejects malformed identifiers and permission bitfields", () => {
    expect(() => buildDiscordInstallUrl({ clientId: "not-an-id" })).toThrow(
      /snowflake/,
    );
    expect(() =>
      buildDiscordInstallUrl({ clientId, permissions: "administrator" }),
    ).toThrow(/numeric bitfield/);
  });
});

describe("Discord bot installation API", () => {
  it("verifies that the bot token belongs to the configured application", async () => {
    process.env.DISCORD_TOKEN = "test-token";
    process.env.DISCORD_CLIENT_ID = clientId;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ id: clientId }));

    await expect(
      verifyDiscordBotApplication(fetchMock),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://discord.com/api/v10/oauth2/applications/@me",
      expect.objectContaining({
        headers: { authorization: "Bot test-token" },
        cache: "no-store",
      }),
    );
  });

  it("rejects a bot token from a different Discord application", async () => {
    process.env.DISCORD_TOKEN = "test-token";
    process.env.DISCORD_CLIENT_ID = clientId;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ id: "2512918151313231983" }));

    await expect(verifyDiscordBotApplication(fetchMock)).rejects.toMatchObject({
      name: "DiscordBotApiError",
      status: 502,
    });
  });

  it("paginates the bot guild list without exposing the token", async () => {
    process.env.DISCORD_TOKEN = "test-token";
    const firstPage = Array.from({ length: 200 }, (_, index) => ({
      id: String(100000000000000000n + BigInt(index)),
    }));
    const finalGuild = { id: "200000000000000000" };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(firstPage))
      .mockResolvedValueOnce(Response.json([finalGuild]));

    const ids = await listDiscordBotGuildIds(fetchMock);

    expect(ids.size).toBe(201);
    expect(ids.has(finalGuild.id)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(secondUrl.searchParams.get("after")).toBe(firstPage.at(-1)?.id);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({
      authorization: "Bot test-token",
    });
  });

  it("rejects malformed Discord responses", async () => {
    process.env.DISCORD_TOKEN = "test-token";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json([{ id: "invalid" }]));

    await expect(listDiscordBotGuildIds(fetchMock)).rejects.toMatchObject({
      name: "DiscordBotApiError",
      status: 502,
    });
  });

  it("treats a missing guild as already removed", async () => {
    process.env.DISCORD_TOKEN = "test-token";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 404 }));

    await expect(leaveDiscordBotGuild(guildId, fetchMock)).resolves.toBe(
      "already_removed",
    );
  });

  it("surfaces Discord removal failures", async () => {
    process.env.DISCORD_TOKEN = "test-token";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 403 }));

    await expect(
      leaveDiscordBotGuild(guildId, fetchMock),
    ).rejects.toBeInstanceOf(DiscordBotApiError);
  });

  it("returns only selectable Discord roles and text channels", async () => {
    process.env.DISCORD_TOKEN = "test-token";
    const roles = [
      { id: guildId, name: "@everyone", managed: false, position: 0 },
      {
        id: "123456789012345679",
        name: "Organizer",
        managed: false,
        position: 3,
      },
      {
        id: "123456789012345680",
        name: "Bot integration",
        managed: true,
        position: 4,
      },
    ];
    const channels = [
      { id: "123456789012345681", name: "help-desk", position: 2, type: 0 },
      { id: "123456789012345682", name: "voice", position: 1, type: 2 },
      { id: "123456789012345683", name: "forum", position: 3, type: 15 },
      {
        id: "123456789012345684",
        name: "announcements",
        position: 4,
        type: 5,
      },
    ];
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(roles))
      .mockResolvedValueOnce(Response.json(channels));

    await expect(
      getDiscordGuildConfigurationOptions(guildId, fetchMock),
    ).resolves.toEqual({
      roles: [{ id: "123456789012345679", name: "Organizer" }],
      channels: [{ id: "123456789012345681", name: "#help-desk" }],
    });
  });
});

describe("Discord configuration option parsing", () => {
  it("fails closed on malformed role and channel payloads", () => {
    expect(
      parseDiscordRoleOptions(
        [{ id: "invalid", name: "Staff", managed: false, position: 1 }],
        guildId,
      ),
    ).toBeNull();
    expect(
      parseDiscordChannelOptions([
        { id: "123456789012345681", name: "help", position: "first", type: 0 },
      ]),
    ).toBeNull();
  });
});
