export interface BotRateLimitPolicy {
  limit: number;
  windowMs: number;
}

export const botRateLimitPolicies = {
  command: { limit: 30, windowMs: 60_000 },
  mutationCommand: { limit: 12, windowMs: 60_000 },
  ambientQa: { limit: 8, windowMs: 60_000 },
} satisfies Record<string, BotRateLimitPolicy>;

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const maxBuckets = 10_000;

export function checkBotRateLimit(
  key: string,
  policy: BotRateLimitPolicy,
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const now = Date.now();
  pruneBuckets(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + policy.windowMs });
    return { allowed: true };
  }

  bucket.count += 1;
  if (bucket.count <= policy.limit) return { allowed: true };

  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

export function botRateLimitKey(
  parts: Array<string | undefined | null>,
): string {
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
