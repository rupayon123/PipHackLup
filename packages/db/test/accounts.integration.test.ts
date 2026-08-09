import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  acquireDiscordAccountTokenRefreshLease,
  completeDiscordAccountTokenRefresh,
  createDiscordAuthSession,
  getActiveDiscordAuthSession,
  getDiscordAccount,
  releaseDiscordAccountTokenRefreshLease,
  revokeDiscordAuthSession,
  revokeDiscordAuthSessionsForAccountIfTokenVersion,
  touchDiscordAuthSession,
  updateDiscordAccountIdentity,
  upsertDiscordAccount,
} from "../src/accounts.js";
import type { PipHackLupDb } from "../src/client.js";
import { discordAccounts, discordSessions } from "../src/schema.js";
import * as schema from "../src/schema.js";

const integrationDatabaseUrl = process.env.PIPHACKLUP_INTEGRATION_DATABASE_URL;
const integrationDescribe = integrationDatabaseUrl ? describe : describe.skip;

integrationDescribe("Discord auth persistence on PostgreSQL", () => {
  let client: ReturnType<typeof postgres>;
  let db: PipHackLupDb;

  beforeAll(async () => {
    client = postgres(integrationDatabaseUrl!, { max: 1 });
    db = drizzle(client, { schema }) as unknown as PipHackLupDb;
    await db.delete(discordSessions);
    await db.delete(discordAccounts);
  });

  afterAll(async () => {
    if (!client) return;
    await db.delete(discordSessions);
    await db.delete(discordAccounts);
    await client.end({ timeout: 5 });
  });

  it("applies account, session, refresh lease, CAS, touch, and revocation semantics", async () => {
    const discordUserId = "1536112346458624091";
    const firstHash = "a".repeat(64);
    const secondHash = "b".repeat(64);
    const thirdHash = "c".repeat(64);
    const tokenExpiresAt = new Date("2099-08-09T12:00:00.000Z");
    const sessionExpiresAt = new Date("2099-08-10T12:00:00.000Z");

    const createdAccount = await upsertDiscordAccount(
      {
        discordUserId,
        username: "release-organizer",
        globalName: "Release Organizer",
        avatarUrl: null,
        accessTokenEncrypted: "encrypted-access-v1",
        refreshTokenEncrypted: "encrypted-refresh-v1",
        tokenExpiresAt,
      },
      db,
    );
    expect(createdAccount.tokenVersion).toBe(1);

    await updateDiscordAccountIdentity(
      {
        discordUserId,
        username: "release-organizer-updated",
        globalName: null,
        avatarUrl: "https://cdn.discordapp.com/avatar.png",
      },
      db,
    );
    await expect(getDiscordAccount(discordUserId, db)).resolves.toMatchObject({
      username: "release-organizer-updated",
      globalName: null,
    });

    await createDiscordAuthSession(
      { tokenHash: firstHash, discordUserId, expiresAt: sessionExpiresAt },
      db,
    );
    await expect(
      getActiveDiscordAuthSession(
        firstHash,
        new Date("2099-08-09T12:00:00.000Z"),
        db,
      ),
    ).resolves.toMatchObject({
      account: { discordUserId, tokenVersion: 1 },
      session: { tokenHash: firstHash, revokedAt: null },
    });

    const firstLease = await acquireDiscordAccountTokenRefreshLease(
      {
        discordUserId,
        expectedTokenVersion: 1,
        leaseId: "lease-a",
        leaseExpiresAt: new Date("2099-08-09T12:05:00.000Z"),
        now: new Date("2099-08-09T12:00:00.000Z"),
      },
      db,
    );
    expect(firstLease?.tokenRefreshLeaseId).toBe("lease-a");
    await expect(
      acquireDiscordAccountTokenRefreshLease(
        {
          discordUserId,
          expectedTokenVersion: 1,
          leaseId: "competing-lease",
          leaseExpiresAt: new Date("2099-08-09T12:05:00.000Z"),
          now: new Date("2099-08-09T12:00:01.000Z"),
        },
        db,
      ),
    ).resolves.toBeNull();

    await releaseDiscordAccountTokenRefreshLease(
      { discordUserId, expectedTokenVersion: 1, leaseId: "lease-a" },
      db,
    );
    await expect(
      acquireDiscordAccountTokenRefreshLease(
        {
          discordUserId,
          expectedTokenVersion: 1,
          leaseId: "lease-b",
          leaseExpiresAt: new Date("2099-08-09T12:05:00.000Z"),
          now: new Date("2099-08-09T12:00:02.000Z"),
        },
        db,
      ),
    ).resolves.toMatchObject({ tokenRefreshLeaseId: "lease-b" });
    await expect(
      completeDiscordAccountTokenRefresh(
        {
          discordUserId,
          expectedTokenVersion: 1,
          leaseId: "wrong-lease",
          accessTokenEncrypted: "must-not-write",
          refreshTokenEncrypted: "must-not-write",
          tokenExpiresAt,
        },
        db,
      ),
    ).resolves.toBeNull();
    await expect(
      completeDiscordAccountTokenRefresh(
        {
          discordUserId,
          expectedTokenVersion: 1,
          leaseId: "lease-b",
          accessTokenEncrypted: "encrypted-access-v2",
          refreshTokenEncrypted: "encrypted-refresh-v2",
          tokenExpiresAt,
        },
        db,
      ),
    ).resolves.toMatchObject({
      tokenVersion: 2,
      tokenRefreshLeaseId: null,
      accessTokenEncrypted: "encrypted-access-v2",
    });

    const touchedAt = new Date("2099-08-09T12:01:00.000Z");
    await expect(
      touchDiscordAuthSession(firstHash, touchedAt, db),
    ).resolves.toBe(true);
    await expect(
      getActiveDiscordAuthSession(firstHash, touchedAt, db),
    ).resolves.toMatchObject({ session: { lastSeenAt: touchedAt } });

    await createDiscordAuthSession(
      { tokenHash: secondHash, discordUserId, expiresAt: sessionExpiresAt },
      db,
    );
    await expect(
      revokeDiscordAuthSessionsForAccountIfTokenVersion(
        discordUserId,
        1,
        touchedAt,
        db,
      ),
    ).resolves.toBe(false);
    await expect(
      getActiveDiscordAuthSession(firstHash, touchedAt, db),
    ).resolves.not.toBeNull();
    await expect(
      revokeDiscordAuthSessionsForAccountIfTokenVersion(
        discordUserId,
        2,
        touchedAt,
        db,
      ),
    ).resolves.toBe(true);
    await expect(
      getActiveDiscordAuthSession(firstHash, touchedAt, db),
    ).resolves.toBeNull();
    await expect(
      getActiveDiscordAuthSession(secondHash, touchedAt, db),
    ).resolves.toBeNull();

    const refreshedAccount = await upsertDiscordAccount(
      {
        discordUserId,
        username: "release-organizer-final",
        accessTokenEncrypted: "encrypted-access-v3",
        refreshTokenEncrypted: "encrypted-refresh-v3",
        tokenExpiresAt,
      },
      db,
    );
    expect(refreshedAccount.tokenVersion).toBe(3);
    await createDiscordAuthSession(
      {
        tokenHash: thirdHash,
        discordUserId,
        expiresAt: sessionExpiresAt,
      },
      db,
    );
    await revokeDiscordAuthSession(thirdHash, touchedAt, db);
    await expect(
      getActiveDiscordAuthSession(thirdHash, touchedAt, db),
    ).resolves.toBeNull();
  });
});
