import { and, eq, exists, gt, isNull, lte, or, sql } from "drizzle-orm";
import { getDb, type PipHackLupDb } from "./client.js";
import { discordAccounts, discordSessions } from "./schema.js";

export type DiscordAccountRecord = typeof discordAccounts.$inferSelect;
export type DiscordSessionRecord = typeof discordSessions.$inferSelect;

export interface DiscordAuthSessionWithAccount {
  account: DiscordAccountRecord;
  session: DiscordSessionRecord;
}

export interface UpsertDiscordAccountInput {
  discordUserId: string;
  username: string;
  globalName?: string | null;
  avatarUrl?: string | null;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
  tokenExpiresAt: Date;
}

export interface UpdateDiscordAccountTokensInput {
  discordUserId: string;
  expectedTokenVersion: number;
  leaseId: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
  tokenExpiresAt: Date;
}

export async function upsertDiscordAccount(
  input: UpsertDiscordAccountInput,
  db: PipHackLupDb = getDb(),
): Promise<DiscordAccountRecord> {
  const now = new Date();
  const [account] = await db
    .insert(discordAccounts)
    .values({
      discordUserId: input.discordUserId,
      username: input.username,
      globalName: input.globalName ?? null,
      avatarUrl: input.avatarUrl ?? null,
      accessTokenEncrypted: input.accessTokenEncrypted,
      refreshTokenEncrypted: input.refreshTokenEncrypted,
      tokenExpiresAt: input.tokenExpiresAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: discordAccounts.discordUserId,
      set: {
        username: input.username,
        globalName: input.globalName ?? null,
        avatarUrl: input.avatarUrl ?? null,
        accessTokenEncrypted: input.accessTokenEncrypted,
        refreshTokenEncrypted: input.refreshTokenEncrypted,
        tokenExpiresAt: input.tokenExpiresAt,
        tokenVersion: sql`${discordAccounts.tokenVersion} + 1`,
        tokenRefreshLeaseId: null,
        tokenRefreshLeaseExpiresAt: null,
        updatedAt: now,
      },
    })
    .returning();

  if (!account) throw new Error("Discord account upsert returned no record.");
  return account;
}

export async function updateDiscordAccountIdentity(
  input: Pick<
    UpsertDiscordAccountInput,
    "discordUserId" | "username" | "globalName" | "avatarUrl"
  >,
  db: PipHackLupDb = getDb(),
): Promise<void> {
  await db
    .update(discordAccounts)
    .set({
      username: input.username,
      globalName: input.globalName ?? null,
      avatarUrl: input.avatarUrl ?? null,
      updatedAt: new Date(),
    })
    .where(eq(discordAccounts.discordUserId, input.discordUserId));
}

export async function getDiscordAccount(
  discordUserId: string,
  db: PipHackLupDb = getDb(),
): Promise<DiscordAccountRecord | null> {
  const [account] = await db
    .select()
    .from(discordAccounts)
    .where(eq(discordAccounts.discordUserId, discordUserId))
    .limit(1);

  return account ?? null;
}

export async function acquireDiscordAccountTokenRefreshLease(
  input: {
    discordUserId: string;
    expectedTokenVersion: number;
    leaseId: string;
    leaseExpiresAt: Date;
    now?: Date;
  },
  db: PipHackLupDb = getDb(),
): Promise<DiscordAccountRecord | null> {
  const now = input.now ?? new Date();
  const [account] = await db
    .update(discordAccounts)
    .set({
      tokenRefreshLeaseId: input.leaseId,
      tokenRefreshLeaseExpiresAt: input.leaseExpiresAt,
    })
    .where(
      and(
        eq(discordAccounts.discordUserId, input.discordUserId),
        eq(discordAccounts.tokenVersion, input.expectedTokenVersion),
        or(
          isNull(discordAccounts.tokenRefreshLeaseExpiresAt),
          lte(discordAccounts.tokenRefreshLeaseExpiresAt, now),
        ),
      ),
    )
    .returning();

  return account ?? null;
}

export async function completeDiscordAccountTokenRefresh(
  input: UpdateDiscordAccountTokensInput,
  db: PipHackLupDb = getDb(),
): Promise<DiscordAccountRecord | null> {
  const [account] = await db
    .update(discordAccounts)
    .set({
      accessTokenEncrypted: input.accessTokenEncrypted,
      refreshTokenEncrypted: input.refreshTokenEncrypted,
      tokenExpiresAt: input.tokenExpiresAt,
      tokenVersion: sql`${discordAccounts.tokenVersion} + 1`,
      tokenRefreshLeaseId: null,
      tokenRefreshLeaseExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(discordAccounts.discordUserId, input.discordUserId),
        eq(discordAccounts.tokenVersion, input.expectedTokenVersion),
        eq(discordAccounts.tokenRefreshLeaseId, input.leaseId),
      ),
    )
    .returning();

  return account ?? null;
}

export async function releaseDiscordAccountTokenRefreshLease(
  input: {
    discordUserId: string;
    expectedTokenVersion: number;
    leaseId: string;
  },
  db: PipHackLupDb = getDb(),
): Promise<void> {
  await db
    .update(discordAccounts)
    .set({
      tokenRefreshLeaseId: null,
      tokenRefreshLeaseExpiresAt: null,
    })
    .where(
      and(
        eq(discordAccounts.discordUserId, input.discordUserId),
        eq(discordAccounts.tokenVersion, input.expectedTokenVersion),
        eq(discordAccounts.tokenRefreshLeaseId, input.leaseId),
      ),
    );
}

export async function createDiscordAuthSession(
  input: {
    tokenHash: string;
    discordUserId: string;
    expiresAt: Date;
  },
  db: PipHackLupDb = getDb(),
): Promise<DiscordSessionRecord> {
  const [session] = await db
    .insert(discordSessions)
    .values({
      tokenHash: input.tokenHash,
      discordUserId: input.discordUserId,
      expiresAt: input.expiresAt,
    })
    .returning();

  if (!session) throw new Error("Discord session insert returned no record.");
  return session;
}

export async function getActiveDiscordAuthSession(
  tokenHash: string,
  now: Date = new Date(),
  db: PipHackLupDb = getDb(),
): Promise<DiscordAuthSessionWithAccount | null> {
  const [record] = await db
    .select({
      account: discordAccounts,
      session: discordSessions,
    })
    .from(discordSessions)
    .innerJoin(
      discordAccounts,
      eq(discordSessions.discordUserId, discordAccounts.discordUserId),
    )
    .where(
      and(
        eq(discordSessions.tokenHash, tokenHash),
        isNull(discordSessions.revokedAt),
        gt(discordSessions.expiresAt, now),
      ),
    )
    .limit(1);

  return record ?? null;
}

export async function touchDiscordAuthSession(
  tokenHash: string,
  now: Date = new Date(),
  db: PipHackLupDb = getDb(),
): Promise<boolean> {
  const [session] = await db
    .update(discordSessions)
    .set({ lastSeenAt: now, updatedAt: now })
    .where(
      and(
        eq(discordSessions.tokenHash, tokenHash),
        isNull(discordSessions.revokedAt),
        gt(discordSessions.expiresAt, now),
      ),
    )
    .returning({ tokenHash: discordSessions.tokenHash });

  return session !== undefined;
}

export async function revokeDiscordAuthSession(
  tokenHash: string,
  now: Date = new Date(),
  db: PipHackLupDb = getDb(),
): Promise<void> {
  await db
    .update(discordSessions)
    .set({ revokedAt: now, updatedAt: now })
    .where(
      and(
        eq(discordSessions.tokenHash, tokenHash),
        isNull(discordSessions.revokedAt),
      ),
    );
}

export async function revokeDiscordAuthSessionsForAccountIfTokenVersion(
  discordUserId: string,
  expectedTokenVersion: number,
  now: Date = new Date(),
  db: PipHackLupDb = getDb(),
): Promise<boolean> {
  const revocableAccount = db.$with("revocable_discord_account").as(
    db
      .update(discordAccounts)
      .set({ updatedAt: sql`${discordAccounts.updatedAt}` })
      .where(
        and(
          eq(discordAccounts.discordUserId, discordUserId),
          eq(discordAccounts.tokenVersion, expectedTokenVersion),
          isNull(discordAccounts.tokenRefreshLeaseId),
        ),
      )
      .returning({ discordUserId: discordAccounts.discordUserId }),
  );
  const revoked = await db
    .with(revocableAccount)
    .update(discordSessions)
    .set({ revokedAt: now, updatedAt: now })
    .where(
      and(
        eq(discordSessions.discordUserId, discordUserId),
        isNull(discordSessions.revokedAt),
        exists(db.select().from(revocableAccount)),
      ),
    )
    .returning({ tokenHash: discordSessions.tokenHash });

  return revoked.length > 0;
}
