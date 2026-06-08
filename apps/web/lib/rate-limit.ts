import { NextRequest, NextResponse } from "next/server";

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

const buckets = new Map<string, Bucket>();
const maxBuckets = 5_000;

export function enforceRateLimit(
  request: NextRequest,
  options: {
    key: string;
    policy: RateLimitPolicy;
  },
): NextResponse | null {
  void request;
  const now = Date.now();
  pruneBuckets(now);

  const bucket = buckets.get(options.key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(options.key, {
      count: 1,
      resetAt: now + options.policy.windowMs,
    });
    return null;
  }

  bucket.count += 1;
  if (bucket.count <= options.policy.limit) return null;

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((bucket.resetAt - now) / 1000),
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
        "X-RateLimit-Limit": String(options.policy.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(bucket.resetAt / 1000)),
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

function pruneBuckets(now: number): void {
  if (buckets.size < maxBuckets) return;

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
    if (buckets.size < maxBuckets) return;
  }
}
