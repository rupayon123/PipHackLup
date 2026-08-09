import { describe, expect, it } from "vitest";
import { createBotRateLimiter } from "../src/lib/rate-limit.js";

describe("bot rate-limit storage", () => {
  it("evicts the oldest active bucket instead of exceeding its hard cap", () => {
    const limiter = createBotRateLimiter({
      maximumBuckets: 2,
      now: () => 1_000,
    });
    const policy = { limit: 1, windowMs: 60_000 };

    expect(limiter.check("oldest", policy)).toEqual({ allowed: true });
    expect(limiter.check("oldest", policy)).toMatchObject({ allowed: false });
    expect(limiter.check("second", policy)).toEqual({ allowed: true });
    expect(limiter.check("third", policy)).toEqual({ allowed: true });

    // A reset allowance proves the oldest active bucket was evicted to make
    // room; the Map can never grow beyond maximumBuckets.
    expect(limiter.check("oldest", policy)).toEqual({ allowed: true });
  });

  it("rejects an invalid storage bound", () => {
    expect(() => createBotRateLimiter({ maximumBuckets: 0 })).toThrow(
      "maximumBuckets",
    );
  });
});
