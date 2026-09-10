import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  buildPreAuthRateLimitKey,
  buildRateLimitKey,
  createLocalRateLimiter,
  enforceRateLimit,
  getClientIp,
  hashRateLimitKey,
} from "../lib/rate-limit";

const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
});

describe("web rate limiting", () => {
  it("hashes private rate-limit dimensions before shared storage", () => {
    const key = buildRateLimitKey([
      "web",
      "training-write",
      "203.0.113.42",
      "1512918151313231984",
    ]);
    const hash = hashRateLimitKey(key);

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain("203.0.113.42");
    expect(hashRateLimitKey(key)).toBe(hash);
  });

  it("enforces the bounded local fallback when no database is configured", async () => {
    delete process.env.DATABASE_URL;
    const request = new NextRequest("http://localhost:3000/api/example");
    const key = `test-local-${Date.now()}-${Math.random()}`;
    const policy = { limit: 1, windowMs: 60_000 };

    await expect(
      enforceRateLimit(request, { key, policy }),
    ).resolves.toBeNull();
    const blocked = await enforceRateLimit(request, { key, policy });

    expect(blocked?.status).toBe(429);
    await expect(blocked?.json()).resolves.toMatchObject({
      error: "rate_limited",
    });
  });

  it("uses the first proxy-provided client address", () => {
    const request = new NextRequest("http://localhost:3000/api/example", {
      headers: {
        "x-forwarded-for": "203.0.113.42, 198.51.100.2",
        "x-real-ip": "192.0.2.5",
      },
    });

    expect(getClientIp(request)).toBe("203.0.113.42");
  });

  it("bounds active fallback buckets by evicting the oldest key", () => {
    const limiter = createLocalRateLimiter({
      maximumBuckets: 2,
      now: () => 1_000,
    });
    const policy = { limit: 1, windowMs: 60_000 };

    expect(limiter.consume("oldest", policy).allowed).toBe(true);
    expect(limiter.consume("oldest", policy).allowed).toBe(false);
    expect(limiter.consume("second", policy).allowed).toBe(true);
    expect(limiter.consume("third", policy).allowed).toBe(true);
    expect(limiter.consume("oldest", policy).allowed).toBe(true);
  });

  it("does not let unauthenticated guild ids create distinct persistent buckets", () => {
    const headers = { "x-real-ip": "203.0.113.42" };
    const first = new NextRequest(
      "http://localhost:3000/api/training/entries?guildId=1512918151313231984",
      { headers },
    );
    const second = new NextRequest(
      "http://localhost:3000/api/training/entries?guildId=9999999999999999999",
      { headers },
    );

    expect(buildPreAuthRateLimitKey(first, "training-write")).toBe(
      buildPreAuthRateLimitKey(second, "training-write"),
    );
  });
});
