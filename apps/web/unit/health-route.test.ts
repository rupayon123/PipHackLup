import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  isDatabaseConfigured: vi.fn(),
  verifyDatabaseSchema: vi.fn(),
}));
const authMocks = vi.hoisted(() => ({ isDiscordAuthConfigured: vi.fn() }));
const discordMocks = vi.hoisted(() => ({
  isDiscordBotApiConfigured: vi.fn(),
  verifyDiscordBotApplication: vi.fn(),
}));

vi.mock("@piphacklup/db", () => dbMocks);
vi.mock("@/lib/discord-auth", () => authMocks);
vi.mock("@/lib/discord-installation", () => discordMocks);
vi.mock("@/lib/health", () => ({
  createCachedHealthProbe: ({ check }: { check: () => Promise<void> }) => ({
    check: async () => {
      try {
        await check();
        return true;
      } catch {
        return false;
      }
    },
  }),
}));

import { GET } from "../app/api/health/route";

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.isDatabaseConfigured.mockReturnValue(true);
  authMocks.isDiscordAuthConfigured.mockReturnValue(true);
  discordMocks.isDiscordBotApiConfigured.mockReturnValue(true);
  dbMocks.verifyDatabaseSchema.mockResolvedValue(undefined);
  discordMocks.verifyDiscordBotApplication.mockResolvedValue(undefined);
  process.env.PIPHACKLUP_RELEASE_SHA =
    "be10970eb0770448cd507a1ebccf67809bb0bd75";
});

afterEach(() => {
  delete process.env.PIPHACKLUP_RELEASE_SHA;
});

describe("web readiness route", () => {
  it("fails before dependency calls when required configuration is absent", async () => {
    authMocks.isDiscordAuthConfigured.mockReturnValue(false);

    const response = await GET();

    expect(response.status).toBe(503);
    expect(dbMocks.verifyDatabaseSchema).not.toHaveBeenCalled();
    expect(discordMocks.verifyDiscordBotApplication).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "database schema is stale",
      fail: () =>
        dbMocks.verifyDatabaseSchema.mockRejectedValue(
          new Error("missing column"),
        ),
    },
    {
      label: "Discord token belongs to another application",
      fail: () =>
        discordMocks.verifyDiscordBotApplication.mockRejectedValue(
          new Error("mismatched application"),
        ),
    },
  ])("fails closed when the $label", async ({ fail }) => {
    fail();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const response = await GET();

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        status: "not_ready",
      });
    } finally {
      log.mockRestore();
    }
  });

  it("reports ready only after schema and Discord application verification", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(dbMocks.verifyDatabaseSchema).toHaveBeenCalledOnce();
    expect(discordMocks.verifyDiscordBotApplication).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toEqual({
      ok: true,
      app: "PipHackLup web",
      status: "ready",
      release: "be10970eb0770448cd507a1ebccf67809bb0bd75",
    });
  });
});
