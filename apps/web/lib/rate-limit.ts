import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  consumeRateLimitInDb,
  isDatabaseConfigured,
  type RateLimitDecision,
} from "@piphacklup/db";

export interface RateLimitPolicy {
  limit: number;
  windowMs: number;
}

export const webRateLimitPolicies = {
  auth: { limit: 20, windowMs: 5 * 60_000 },
  dashboardRead: { limit: 120, windowMs: 60_000 },
  dashboardWrite: { limit: 30, windowMs: 60_000 },
  publicExport: { limit: 30, windowMs: 60_000 },
} satisfies Record<string, RateLimitPolicy>;

interface Bucket {
  count: number;
  resetAt: number;
}

const maxBuckets = 5_000;

export interface LocalRateLimiter {
  consume(key: string, policy: RateLimitPolicy): RateLimitDecision;
}

export function createLocalRateLimiter(options?: {
  maximumBuckets?: number;
  now?: () => number;
}): LocalRateLimiter {
  const maximumBuckets = options?.maximumBuckets ?? maxBuckets;
  const now = options?.now ?? Date.now;
  if (!Number.isSafeInteger(maximumBuckets) || maximumBuckets < 1) {
    throw new RangeError("maximumBuckets must be a positive integer.");
  }
  const buckets = new Map<string, Bucket>();

  return {
    consume(key, policy) {
      const checkedAt = now();
      pruneBuckets(buckets, checkedAt, key, maximumBuckets);
      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= checkedAt) {
        const resetAt = checkedAt + policy.windowMs;
        buckets.set(key, { count: 1, resetAt });
        return {
          allowed: true,
          count: 1,
          limit: policy.limit,
          remaining: Math.max(0, policy.limit - 1),
          resetAt: new Date(resetAt),
        };
      }

      bucket.count += 1;
      return {
        allowed: bucket.count <= policy.limit,
        count: bucket.count,
        limit: policy.limit,
        remaining: Math.max(0, policy.limit - bucket.count),
        resetAt: new Date(bucket.resetAt),
      };
    },
  };
}

const localRateLimiter = createLocalRateLimiter();

export async function enforceRateLimit(
  request: NextRequest,
  options: {
    key: string;
    policy: RateLimitPolicy;
    allowLocalFallback?: boolean;
  },
): Promise<NextResponse | null> {
  void request;
  let decision: RateLimitDecision;
  if (isDatabaseConfigured()) {
    try {
      decision = await consumeRateLimitInDb({
        keyHash: hashRateLimitKey(options.key),
        limit: options.policy.limit,
        windowMs: options.policy.windowMs,
      });
    } catch {
      console.error("PipHackLup could not check the shared web rate limit.");
      if (!options.allowLocalFallback) {
        return NextResponse.json(
          { error: "rate_limit_unavailable" },
          { status: 503, headers: { "Retry-After": "5" } },
        );
      }
      decision = localRateLimiter.consume(options.key, options.policy);
    }
  } else {
    decision = localRateLimiter.consume(options.key, options.policy);
  }

  if (decision.allowed) return null;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((decision.resetAt.getTime() - Date.now()) / 1000),
  );
  return NextResponse.json(
    {
      error: "rate_limited",
      retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Limit": String(decision.limit),
        "X-RateLimit-Remaining": String(decision.remaining),
        "X-RateLimit-Reset": String(
          Math.ceil(decision.resetAt.getTime() / 1000),
        ),
      },
    },
  );
}

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0];
  const realIp = request.headers.get("x-real-ip");
  return (forwarded ?? realIp ?? "unknown").trim();
}

export function buildRateLimitKey(parts: Array<string | undefined>): string {
  return parts
    .map((part) => (part && part.trim() ? part.trim() : "unknown"))
    .join(":");
}

export function buildPreAuthRateLimitKey(
  request: NextRequest,
  action: string,
): string {
  return buildRateLimitKey(["web", action, `ip-${getClientIp(request)}`]);
}

export function hashRateLimitKey(key: string): string {
  return createHash("sha256")
    .update(`piphacklup:web-rate-limit:v1:${key}`)
    .digest("hex");
}

function pruneBuckets(
  buckets: Map<string, Bucket>,
  now: number,
  incomingKey: string,
  maximumBuckets: number,
): void {
  if (buckets.size < maximumBuckets) return;

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }

  const targetSize = buckets.has(incomingKey)
    ? maximumBuckets
    : maximumBuckets - 1;
  if (buckets.size <= targetSize) return;

  for (const key of buckets.keys()) {
    if (key === incomingKey) continue;
    buckets.delete(key);
    if (buckets.size <= targetSize) return;
  }
}
