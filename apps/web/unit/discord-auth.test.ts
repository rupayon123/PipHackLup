import { describe, expect, test, vi } from "vitest";
import {
  buildDiscordAuthorizeUrl,
  buildDiscordTokenRequest,
  canManageGuild,
  clearDiscordSessionCookie,
  createSessionToken,
  decryptDiscordToken,
  encryptDiscordToken,
  hasDiscordAuthConfiguration,
  hasDiscordSessionStoreConfiguration,
  hashSessionToken,
  isPostOriginAllowed,
  oauthStatesMatch,
  parseDiscordTokenResponse,
  parseManagedDiscordGuilds,
  parseStoredDiscordAuthSession,
  refreshDiscordAccessTokenWithLease,
  retryPendingDiscordSessionRevocations,
  setDiscordSessionCookie,
  shouldRefreshDiscordToken,
  type DiscordSessionCookieDependencies,
  type DiscordSessionCookieStore,
} from "../lib/discord-auth";
import type { DiscordAccountRecord } from "@piphacklup/db";

const secret = "test-only-secret-with-at-least-32-bytes";

function createCookieHarness(
  initial: Record<string, string>,
  revokeFails = false,
) {
  const values = new Map(Object.entries(initial));
  const operations: string[] = [];
  const revokedHashes: string[] = [];
  const cookieStore: DiscordSessionCookieStore = {
    get(name) {
      const value = values.get(name);
      return value === undefined ? undefined : { value };
    },
    set(name, value) {
      operations.push(`set:${name}`);
      values.set(name, value);
    },
    delete(name) {
      operations.push(`delete:${name}`);
      values.delete(name);
    },
  };
  const dependencies: DiscordSessionCookieDependencies = {
    getCookieStore: async () => cookieStore,
    revokeSession: async (tokenHash) => {
      operations.push(`revoke:${tokenHash}`);
      revokedHashes.push(tokenHash);
      if (revokeFails) throw new Error("database unavailable");
    },
    hasSessionStore: () => true,
    appUrl: () => "https://piphacklup.example.test",
    now: () => Date.parse("2026-08-09T12:00:00.000Z"),
  };
  return { dependencies, operations, revokedHashes, values };
}

describe("Discord OAuth configuration", () => {
  test("requires OAuth, a strong session secret, and a real database URL", () => {
    expect(
      hasDiscordAuthConfiguration({
        DATABASE_URL: "postgres://local.test/piphacklup",
        DISCORD_CLIENT_ID: "client-id",
        DISCORD_CLIENT_SECRET: "client-secret",
        NEXTAUTH_SECRET: secret,
      }),
    ).toBe(true);

    expect(
      hasDiscordAuthConfiguration({
        DISCORD_CLIENT_ID: "client-id",
        DISCORD_CLIENT_SECRET: "client-secret",
        NEXTAUTH_SECRET: secret,
      }),
    ).toBe(false);
    expect(
      hasDiscordAuthConfiguration({
        DATABASE_URL: "postgres://user:password@host:5432/piphacklup",
        DISCORD_CLIENT_ID: "client-id",
        DISCORD_CLIENT_SECRET: "client-secret",
        NEXTAUTH_SECRET: secret,
      }),
    ).toBe(false);
    expect(
      hasDiscordAuthConfiguration({
        DATABASE_URL: "postgres://local.test/piphacklup",
        DISCORD_CLIENT_ID: "client-id",
        DISCORD_CLIENT_SECRET: "client-secret",
        NEXTAUTH_SECRET: "too-short",
      }),
    ).toBe(false);
  });

  test("recognizes session storage independently of OAuth credentials", () => {
    expect(
      hasDiscordSessionStoreConfiguration({
        DATABASE_URL: "postgres://local.test/piphacklup",
      }),
    ).toBe(true);
    expect(hasDiscordSessionStoreConfiguration({})).toBe(false);
    expect(
      hasDiscordSessionStoreConfiguration({
        DATABASE_URL: "postgres://user:password@host:5432/piphacklup",
      }),
    ).toBe(false);
  });

  test("builds the exact Discord authorization-code request", () => {
    const url = new URL(
      buildDiscordAuthorizeUrl({
        clientId: "123456789012345678",
        redirectUri: "https://example.test/api/auth/discord/callback",
        state: "state-value",
      }),
    );

    expect(url.origin).toBe("https://discord.com");
    expect(url.pathname).toBe("/oauth2/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "123456789012345678",
      redirect_uri: "https://example.test/api/auth/discord/callback",
      response_type: "code",
      scope: "identify guilds",
      state: "state-value",
    });
  });

  test("builds authorization-code and refresh-token exchanges", () => {
    const client = { clientId: "client-id", clientSecret: "client-secret" };
    expect(
      Object.fromEntries(
        buildDiscordTokenRequest(
          {
            code: "authorization-code",
            grantType: "authorization_code",
            redirectUri: "https://example.test/callback",
          },
          client,
        ),
      ),
    ).toEqual({
      client_id: "client-id",
      client_secret: "client-secret",
      code: "authorization-code",
      grant_type: "authorization_code",
      redirect_uri: "https://example.test/callback",
    });
    expect(
      Object.fromEntries(
        buildDiscordTokenRequest(
          { grantType: "refresh_token", refreshToken: "refresh-token" },
          client,
        ),
      ),
    ).toEqual({
      client_id: "client-id",
      client_secret: "client-secret",
      grant_type: "refresh_token",
      refresh_token: "refresh-token",
    });
  });

  test("matches OAuth state without accepting missing or different values", () => {
    const state = "a".repeat(32);
    expect(oauthStatesMatch(state, state)).toBe(true);
    expect(oauthStatesMatch(state, "b".repeat(32))).toBe(false);
    expect(oauthStatesMatch("short", "a-longer-state")).toBe(false);
    expect(oauthStatesMatch(null, state)).toBe(false);
  });
});

describe("opaque sessions and encrypted OAuth tokens", () => {
  test("creates a compact opaque session token and stores only its hash", () => {
    const token = createSessionToken();
    const hash = hashSessionToken(token);

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashSessionToken(token)).toBe(hash);
  });

  test("round-trips AES-GCM ciphertext bound to its context", () => {
    const encrypted = encryptDiscordToken(
      "discord-access-token",
      secret,
      "account-1:access",
    );
    const secondEncryption = encryptDiscordToken(
      "discord-access-token",
      secret,
      "account-1:access",
    );

    expect(encrypted).not.toContain("discord-access-token");
    expect(secondEncryption).not.toBe(encrypted);
    expect(decryptDiscordToken(encrypted, secret, "account-1:access")).toBe(
      "discord-access-token",
    );
    expect(() =>
      decryptDiscordToken(encrypted, secret, "account-2:access"),
    ).toThrow(/authentication failed/);
    expect(() =>
      decryptDiscordToken(
        encrypted,
        "another-test-secret-that-is-long-enough",
        "account-1:access",
      ),
    ).toThrow(/authentication failed/);
  });

  test("rejects tampered AES-GCM ciphertext", () => {
    const encrypted = encryptDiscordToken(
      "discord-refresh-token",
      secret,
      "account-1:refresh",
    );
    const parts = encrypted.split(".");
    const ciphertext = parts[2]!;
    parts[2] = `${ciphertext[0] === "A" ? "B" : "A"}${ciphertext.slice(1)}`;

    expect(() =>
      decryptDiscordToken(parts.join("."), secret, "account-1:refresh"),
    ).toThrow(/authentication failed/);
  });

  test("validates Discord token responses and computes explicit expiry", () => {
    const parsed = parseDiscordTokenResponse(
      {
        access_token: "access",
        refresh_token: "refresh",
        token_type: "Bearer",
        expires_in: 3_600,
      },
      1_000,
    );

    expect(parsed?.expiresAt.getTime()).toBe(3_601_000);
    expect(
      parseDiscordTokenResponse({
        access_token: "access",
        token_type: "Bearer",
        expires_in: 3_600,
      }),
    ).toBeNull();
    expect(
      parseDiscordTokenResponse({
        access_token: "access",
        refresh_token: "refresh",
        token_type: "Bearer",
        expires_in: -1,
      }),
    ).toBeNull();
  });

  test("refreshes expired and near-expiry access tokens", () => {
    const now = Date.parse("2026-08-09T12:00:00.000Z");
    expect(shouldRefreshDiscordToken(new Date(now + 60_001), now)).toBe(false);
    expect(shouldRefreshDiscordToken(new Date(now + 60_000), now)).toBe(true);
    expect(shouldRefreshDiscordToken(new Date(now - 1), now)).toBe(true);
    expect(shouldRefreshDiscordToken(new Date(Number.NaN), now)).toBe(true);
  });

  test("serializes parallel refreshes and makes the stale reader reuse the winner", async () => {
    const now = Date.parse("2026-08-09T12:00:00.000Z");
    const discordUserId = "123456789012345678";
    let current: DiscordAccountRecord = {
      discordUserId,
      username: "organizer",
      globalName: null,
      avatarUrl: null,
      accessTokenEncrypted: encryptDiscordToken(
        "old-access",
        secret,
        `piphacklup:discord-oauth:${discordUserId}:access:v1`,
      ),
      refreshTokenEncrypted: encryptDiscordToken(
        "old-refresh",
        secret,
        `piphacklup:discord-oauth:${discordUserId}:refresh:v1`,
      ),
      tokenExpiresAt: new Date(now + 1_000),
      tokenVersion: 1,
      tokenRefreshLeaseId: null,
      tokenRefreshLeaseExpiresAt: null,
      createdAt: new Date(now - 60_000),
      updatedAt: new Date(now - 60_000),
    };

    let releaseExchange: () => void = () => undefined;
    const exchangeGate = new Promise<void>((resolve) => {
      releaseExchange = resolve;
    });
    let markExchangeStarted: () => void = () => undefined;
    const exchangeStarted = new Promise<void>((resolve) => {
      markExchangeStarted = resolve;
    });
    let markLeaseMiss: () => void = () => undefined;
    const leaseMissed = new Promise<void>((resolve) => {
      markLeaseMiss = resolve;
    });
    let exchangeCount = 0;
    let leaseCounter = 0;

    const dependencies = {
      acquireLease: async (input: {
        discordUserId: string;
        expectedTokenVersion: number;
        leaseId: string;
        leaseExpiresAt: Date;
        now?: Date;
      }) => {
        const leaseActive =
          current.tokenRefreshLeaseExpiresAt !== null &&
          current.tokenRefreshLeaseExpiresAt > (input.now ?? new Date(now));
        if (
          input.discordUserId !== current.discordUserId ||
          input.expectedTokenVersion !== current.tokenVersion ||
          leaseActive
        ) {
          markLeaseMiss();
          return null;
        }
        current = {
          ...current,
          tokenRefreshLeaseId: input.leaseId,
          tokenRefreshLeaseExpiresAt: input.leaseExpiresAt,
        };
        return current;
      },
      completeRefresh: async (input: {
        discordUserId: string;
        expectedTokenVersion: number;
        leaseId: string;
        accessTokenEncrypted: string;
        refreshTokenEncrypted: string;
        tokenExpiresAt: Date;
      }) => {
        if (
          input.discordUserId !== current.discordUserId ||
          input.expectedTokenVersion !== current.tokenVersion ||
          input.leaseId !== current.tokenRefreshLeaseId
        ) {
          return null;
        }
        current = {
          ...current,
          accessTokenEncrypted: input.accessTokenEncrypted,
          refreshTokenEncrypted: input.refreshTokenEncrypted,
          tokenExpiresAt: input.tokenExpiresAt,
          tokenVersion: current.tokenVersion + 1,
          tokenRefreshLeaseId: null,
          tokenRefreshLeaseExpiresAt: null,
          updatedAt: new Date(now),
        };
        return current;
      },
      createLeaseId: () => String.fromCharCode(97 + leaseCounter++).repeat(24),
      exchangeRefreshToken: async (refreshToken: string) => {
        exchangeCount += 1;
        markExchangeStarted();
        await exchangeGate;
        expect(refreshToken).toBe("old-refresh");
        return {
          accessToken: "new-access",
          refreshToken: "new-refresh",
          expiresAt: new Date(now + 3_600_000),
        };
      },
      getAccount: async () => current,
      now: () => now,
      releaseLease: async (input: {
        discordUserId: string;
        expectedTokenVersion: number;
        leaseId: string;
      }) => {
        if (
          input.discordUserId === current.discordUserId &&
          input.expectedTokenVersion === current.tokenVersion &&
          input.leaseId === current.tokenRefreshLeaseId
        ) {
          current = {
            ...current,
            tokenRefreshLeaseId: null,
            tokenRefreshLeaseExpiresAt: null,
          };
        }
      },
      wait: async () => exchangeGate,
    };

    const first = refreshDiscordAccessTokenWithLease(
      current,
      secret,
      dependencies,
    );
    await exchangeStarted;
    const stale = { ...current };
    const second = refreshDiscordAccessTokenWithLease(
      stale,
      secret,
      dependencies,
    );
    await leaseMissed;
    releaseExchange();

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(exchangeCount).toBe(1);
    expect(firstResult.accessToken).toBe("new-access");
    expect(secondResult.accessToken).toBe("new-access");
    expect(firstResult.account.tokenVersion).toBe(2);
    expect(secondResult.account.tokenVersion).toBe(2);
    expect(current.tokenRefreshLeaseId).toBeNull();
  });
});

describe("browser session lifecycle", () => {
  test("revokes the displaced browser session before installing a replacement", async () => {
    const oldToken = "a".repeat(43);
    const newToken = "b".repeat(43);
    const harness = createCookieHarness({
      piphacklup_discord_session: oldToken,
    });

    await setDiscordSessionCookie(
      {
        sessionToken: newToken,
        expiresAt: new Date("2026-08-23T12:00:00.000Z"),
      },
      harness.dependencies,
    );

    expect(harness.revokedHashes).toEqual([hashSessionToken(oldToken)]);
    expect(harness.values.get("piphacklup_discord_session")).toBe(newToken);
    expect(harness.operations[0]).toBe(`revoke:${hashSessionToken(oldToken)}`);
    expect(harness.operations[1]).toBe("set:piphacklup_discord_session");
  });

  test("keeps the old cookie and queues the orphan replacement if rotation fails", async () => {
    const oldToken = "c".repeat(43);
    const newToken = "d".repeat(43);
    const harness = createCookieHarness(
      { piphacklup_discord_session: oldToken },
      true,
    );

    await expect(
      setDiscordSessionCookie(
        {
          sessionToken: newToken,
          expiresAt: new Date("2026-08-23T12:00:00.000Z"),
        },
        harness.dependencies,
      ),
    ).rejects.toThrow("Discord session storage is temporarily unavailable");

    expect(harness.values.get("piphacklup_discord_session")).toBe(oldToken);
    expect(harness.values.get("piphacklup_pending_session_revocations")).toBe(
      hashSessionToken(newToken),
    );
  });

  test("always clears the browser cookie and queues a failed server revocation", async () => {
    const sessionToken = "e".repeat(43);
    const harness = createCookieHarness(
      { piphacklup_discord_session: sessionToken },
      true,
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      clearDiscordSessionCookie(harness.dependencies),
    ).resolves.toEqual({ revocationPending: true });
    expect(harness.values.has("piphacklup_discord_session")).toBe(false);
    expect(harness.values.get("piphacklup_pending_session_revocations")).toBe(
      hashSessionToken(sessionToken),
    );
  });

  test("keeps reporting pending work when an older queued session remains", async () => {
    const sessionToken = "g".repeat(43);
    const olderHash = hashSessionToken("h".repeat(43));
    const harness = createCookieHarness({
      piphacklup_discord_session: sessionToken,
      piphacklup_pending_session_revocations: olderHash,
    });

    await expect(
      clearDiscordSessionCookie(harness.dependencies),
    ).resolves.toEqual({ revocationPending: true });
    expect(harness.values.get("piphacklup_pending_session_revocations")).toBe(
      olderHash,
    );
  });

  test("retries and clears queued server-session revocations", async () => {
    const pendingHash = hashSessionToken("f".repeat(43));
    const harness = createCookieHarness({
      piphacklup_pending_session_revocations: pendingHash,
    });

    await expect(
      retryPendingDiscordSessionRevocations(harness.dependencies),
    ).resolves.toBe(0);
    expect(harness.revokedHashes).toEqual([pendingHash]);
    expect(harness.values.has("piphacklup_pending_session_revocations")).toBe(
      false,
    );
  });
});

describe("fresh guild authorization helpers", () => {
  test("accepts owner, Administrator, or Manage Server permissions", () => {
    expect(canManageGuild("0", true)).toBe(true);
    expect(canManageGuild("8", false)).toBe(true);
    expect(canManageGuild("32", false)).toBe(true);
    expect(canManageGuild("0", false)).toBe(false);
    expect(canManageGuild("not-a-bitset", false)).toBe(false);
    expect(canManageGuild("9".repeat(33), false)).toBe(false);
  });

  test("keeps every manageable guild without the former 25-server cap", () => {
    const response = Array.from({ length: 30 }, (_, index) => ({
      id: String(100_000_000_000_000_000n + BigInt(index)),
      name: `Hackathon ${index + 1}`,
      icon: null,
      owner: false,
      permissions: "32",
    }));
    response.push({
      id: "200000000000000000",
      name: "Not manageable",
      icon: null,
      owner: false,
      permissions: "0",
    });

    const guilds = parseManagedDiscordGuilds(response);
    expect(guilds).toHaveLength(30);
    expect(guilds?.at(-1)?.name).toBe("Hackathon 30");
    expect(guilds?.every((guild) => guild.canManage)).toBe(true);
  });

  test("fails closed for malformed or oversized Discord guild responses", () => {
    expect(
      parseManagedDiscordGuilds([
        { id: "1", name: "Guild", owner: false, permissions: "32" },
      ]),
    ).toBeNull();
    expect(
      parseManagedDiscordGuilds([
        {
          id: "100000000000000000",
          name: "Guild",
          owner: false,
          permissions: "invalid",
        },
      ]),
    ).toBeNull();
    expect(
      parseManagedDiscordGuilds(
        Array.from({ length: 201 }, (_, index) => ({
          id: String(100_000_000_000_000_000n + BigInt(index)),
          name: "Guild",
          owner: true,
          permissions: "0",
        })),
      ),
    ).toBeNull();
  });

  test("rejects expired, revoked, or cross-account database sessions", () => {
    const now = new Date("2026-08-09T12:00:00.000Z");
    const encryptedAccess = encryptDiscordToken(
      "access",
      secret,
      "stored:access",
    );
    const encryptedRefresh = encryptDiscordToken(
      "refresh",
      secret,
      "stored:refresh",
    );
    const record = {
      account: {
        discordUserId: "123456789012345678",
        username: "organizer",
        globalName: null,
        avatarUrl: null,
        accessTokenEncrypted: encryptedAccess,
        refreshTokenEncrypted: encryptedRefresh,
        tokenExpiresAt: new Date("2026-08-10T12:00:00.000Z"),
        tokenVersion: 1,
        tokenRefreshLeaseId: null,
        tokenRefreshLeaseExpiresAt: null,
        createdAt: new Date("2026-08-01T12:00:00.000Z"),
        updatedAt: new Date("2026-08-09T11:00:00.000Z"),
      },
      session: {
        tokenHash: hashSessionToken("a".repeat(43)),
        discordUserId: "123456789012345678",
        expiresAt: new Date("2026-08-10T12:00:00.000Z"),
        revokedAt: null,
        lastSeenAt: null,
        createdAt: new Date("2026-08-09T11:00:00.000Z"),
        updatedAt: new Date("2026-08-09T11:00:00.000Z"),
      },
    };

    expect(parseStoredDiscordAuthSession(record, now)).not.toBeNull();
    expect(
      parseStoredDiscordAuthSession(
        {
          ...record,
          session: { ...record.session, expiresAt: now },
        },
        now,
      ),
    ).toBeNull();
    expect(
      parseStoredDiscordAuthSession(
        {
          ...record,
          session: { ...record.session, revokedAt: now },
        },
        now,
      ),
    ).toBeNull();
    expect(
      parseStoredDiscordAuthSession(
        {
          ...record,
          session: {
            ...record.session,
            discordUserId: "223456789012345678",
          },
        },
        now,
      ),
    ).toBeNull();
    expect(
      parseStoredDiscordAuthSession(
        record,
        now,
        hashSessionToken("b".repeat(43)),
      ),
    ).toBeNull();
  });
});

describe("logout origin validation", () => {
  test("allows only the configured same origin", () => {
    expect(
      isPostOriginAllowed("https://piphacklup.test", "https://piphacklup.test"),
    ).toBe(true);
    expect(
      isPostOriginAllowed("https://attacker.test", "https://piphacklup.test"),
    ).toBe(false);
    expect(isPostOriginAllowed(null, "https://piphacklup.test")).toBe(false);
    expect(isPostOriginAllowed("not-a-url", "https://piphacklup.test")).toBe(
      false,
    );
  });
});
