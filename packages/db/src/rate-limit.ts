import { lte, sql } from "drizzle-orm";
import { getDb, type PipHackLupDb } from "./client.js";
import { rateLimitBuckets } from "./schema.js";

export interface ConsumeRateLimitInput {
  keyHash: string;
  limit: number;
  windowMs: number;
  now?: Date;
}

export interface RateLimitDecision {
  allowed: boolean;
  count: number;
  limit: number;
  remaining: number;
  resetAt: Date;
}

export async function consumeRateLimitInDb(
  input: ConsumeRateLimitInput,
  db: PipHackLupDb = getDb(),
): Promise<RateLimitDecision> {
  const now = input.now ?? new Date();
  const resetAt = new Date(now.getTime() + input.windowMs);
  const cleanupExpiredBuckets = db
    .delete(rateLimitBuckets)
    .where(lte(rateLimitBuckets.resetAt, now));
  const upsertBucket = db
    .insert(rateLimitBuckets)
    .values({
      keyHash: input.keyHash,
      count: 1,
      resetAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: rateLimitBuckets.keyHash,
      set: {
        count: sql<number>`case when ${rateLimitBuckets.resetAt} <= ${now} then 1 else ${rateLimitBuckets.count} + 1 end`,
        resetAt: sql<Date>`case when ${rateLimitBuckets.resetAt} <= ${now} then ${resetAt} else ${rateLimitBuckets.resetAt} end`,
        updatedAt: now,
      },
    })
    .returning({
      count: rateLimitBuckets.count,
      resetAt: rateLimitBuckets.resetAt,
    });
  const [, buckets] = await db.batch([cleanupExpiredBuckets, upsertBucket]);
  const [bucket] = buckets;

  if (!bucket) throw new Error("Rate-limit bucket upsert returned no row.");
  return {
    allowed: bucket.count <= input.limit,
    count: bucket.count,
    limit: input.limit,
    remaining: Math.max(0, input.limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}
