export interface BotRateLimitPolicy {
  limit: number;
  windowMs: number;
}

export const botRateLimitPolicies = {
  command: { limit: 30, windowMs: 60_000 },
  mutationCommand: { limit: 12, windowMs: 60_000 },
  buttonMutation: { limit: 6, windowMs: 60_000 },
  ambientQa: { limit: 8, windowMs: 60_000 },
} satisfies Record<string, BotRateLimitPolicy>;

interface Bucket {
  count: number;
  resetAt: number;
}

const maxBuckets = 10_000;

export interface BotRateLimiter {
  check(
    key: string,
    policy: BotRateLimitPolicy,
  ): { allowed: true } | { allowed: false; retryAfterSeconds: number };
}

export function createBotRateLimiter(options?: {
  maximumBuckets?: number;
  now?: () => number;
}): BotRateLimiter {
  const maximumBuckets = options?.maximumBuckets ?? maxBuckets;
  const now = options?.now ?? Date.now;
  if (!Number.isSafeInteger(maximumBuckets) || maximumBuckets < 1) {
    throw new RangeError("maximumBuckets must be a positive integer.");
  }
  const buckets = new Map<string, Bucket>();

  return {
    check(key, policy) {
      const checkedAt = now();
      pruneBuckets(buckets, checkedAt, key, maximumBuckets);

      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= checkedAt) {
        buckets.set(key, {
          count: 1,
          resetAt: checkedAt + policy.windowMs,
        });
        return { allowed: true };
      }

      bucket.count += 1;
      if (bucket.count <= policy.limit) return { allowed: true };

      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((bucket.resetAt - checkedAt) / 1000),
        ),
      };
    },
  };
}

const defaultRateLimiter = createBotRateLimiter();

export function checkBotRateLimit(
  key: string,
  policy: BotRateLimitPolicy,
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  return defaultRateLimiter.check(key, policy);
}

export function botRateLimitKey(
  parts: Array<string | undefined | null>,
): string {
  return parts
    .map((part) => (part && part.trim() ? part.trim() : "unknown"))
    .join(":");
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

  // Bound process memory even when every bucket is still active. Map order
  // makes this deterministic: the oldest created non-current buckets go first.
  for (const key of buckets.keys()) {
    if (key === incomingKey) continue;
    buckets.delete(key);
    if (buckets.size <= targetSize) return;
  }
}
