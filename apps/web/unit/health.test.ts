import { afterEach, describe, expect, it, vi } from "vitest";
import { createCachedHealthProbe } from "../lib/health";

afterEach(() => {
  vi.useRealTimers();
});

describe("web health probe", () => {
  it("deduplicates concurrent checks, caches briefly, and recovers", async () => {
    let now = 0;
    const check = vi
      .fn<() => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce(undefined);
    const probe = createCachedHealthProbe({
      check,
      cacheTtlMs: 1_000,
      timeoutMs: 100,
      now: () => now,
    });

    await expect(Promise.all([probe.check(), probe.check()])).resolves.toEqual([
      true,
      true,
    ]);
    expect(check).toHaveBeenCalledTimes(1);
    now = 999;
    await expect(probe.check()).resolves.toBe(true);
    expect(check).toHaveBeenCalledTimes(1);

    now = 1_000;
    await expect(probe.check()).resolves.toBe(false);
    now = 2_000;
    await expect(probe.check()).resolves.toBe(true);
    expect(check).toHaveBeenCalledTimes(3);
  });

  it("bounds a stalled database check", async () => {
    vi.useFakeTimers();
    const probe = createCachedHealthProbe({
      check: () => new Promise<void>(() => undefined),
      cacheTtlMs: 1_000,
      timeoutMs: 50,
    });

    const readiness = probe.check();
    await vi.advanceTimersByTimeAsync(50);
    await expect(readiness).resolves.toBe(false);
  });
});
