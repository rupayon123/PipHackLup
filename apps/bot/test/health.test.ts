import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildHealthStatus,
  buildProbedHealthStatus,
  createDatabaseHealthProbe,
  resolveReleaseIdentifier,
} from "../src/lib/health.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("buildHealthStatus", () => {
  it("returns unavailable while Discord is still connecting", () => {
    expect(
      buildHealthStatus({
        discordReady: false,
        databaseConfigured: false,
        databaseInitializationComplete: false,
        databaseReady: false,
      }),
    ).toEqual({
      statusCode: 503,
      body: {
        ok: false,
        status: "starting",
        discordReady: false,
        bot: null,
        release: "unknown",
        databaseConfigured: false,
        databaseReady: false,
      },
    });
  });

  it("stays unavailable when durable database storage is not configured", () => {
    expect(
      buildHealthStatus({
        discordReady: true,
        botTag: "PipHackLup#1234",
        databaseConfigured: false,
        databaseInitializationComplete: true,
        databaseReady: false,
      }),
    ).toEqual({
      statusCode: 503,
      body: {
        ok: false,
        status: "misconfigured",
        discordReady: true,
        bot: "PipHackLup#1234",
        release: "unknown",
        databaseConfigured: false,
        databaseReady: false,
      },
    });
  });

  it("stays unavailable while initial guild hydration is still running", () => {
    expect(
      buildHealthStatus({
        discordReady: true,
        databaseConfigured: true,
        databaseInitializationComplete: false,
        databaseReady: false,
      }),
    ).toMatchObject({
      statusCode: 503,
      body: { ok: false, status: "starting", databaseReady: false },
    });
  });

  it("reports degraded readiness after initial durable hydration fails", () => {
    expect(
      buildHealthStatus({
        discordReady: true,
        databaseConfigured: true,
        databaseInitializationComplete: true,
        databaseReady: false,
      }),
    ).toMatchObject({
      statusCode: 503,
      body: { ok: false, status: "degraded", databaseReady: false },
    });
  });

  it("becomes ready when Discord and durable database configuration are present", () => {
    expect(
      buildHealthStatus({
        discordReady: true,
        botTag: "PipHackLup#1234",
        release: "be10970eb0770448cd507a1ebccf67809bb0bd75",
        databaseConfigured: true,
        databaseInitializationComplete: true,
        databaseReady: true,
      }),
    ).toEqual({
      statusCode: 200,
      body: {
        ok: true,
        status: "ready",
        discordReady: true,
        bot: "PipHackLup#1234",
        release: "be10970eb0770448cd507a1ebccf67809bb0bd75",
        databaseConfigured: true,
        databaseReady: true,
      },
    });
  });

  it("publishes a validated release identity without exposing arbitrary environment text", () => {
    expect(
      resolveReleaseIdentifier({
        PIPHACKLUP_RELEASE_SHA: "BE10970EB0770448CD507A1EBCCF67809BB0BD75",
      }),
    ).toBe("be10970eb0770448cd507a1ebccf67809bb0bd75");
    expect(
      resolveReleaseIdentifier({ PIPHACKLUP_RELEASE_SHA: "release candidate" }),
    ).toBe("unknown");
  });

  it("degrades after a runtime database outage and recovers after the next successful probe", async () => {
    let now = 0;
    const ping = vi
      .fn<() => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("database offline"))
      .mockResolvedValueOnce(undefined);
    const databaseProbe = createDatabaseHealthProbe({
      ping,
      cacheTtlMs: 1_000,
      timeoutMs: 100,
      now: () => now,
    });
    const checkHealth = () =>
      buildProbedHealthStatus(
        {
          discordReady: true,
          databaseConfigured: true,
          databaseInitializationComplete: true,
          databaseStateReady: true,
        },
        databaseProbe,
      );

    await expect(checkHealth()).resolves.toMatchObject({ statusCode: 200 });
    now = 999;
    await expect(checkHealth()).resolves.toMatchObject({ statusCode: 200 });
    expect(ping).toHaveBeenCalledTimes(1);

    now = 1_000;
    await expect(checkHealth()).resolves.toMatchObject({
      statusCode: 503,
      body: { ok: false, status: "degraded", databaseReady: false },
    });

    now = 2_000;
    await expect(checkHealth()).resolves.toMatchObject({
      statusCode: 200,
      body: { ok: true, status: "ready", databaseReady: true },
    });
    expect(ping).toHaveBeenCalledTimes(3);
  });

  it("bounds a stalled database ping and reports it unavailable", async () => {
    vi.useFakeTimers();
    const databaseProbe = createDatabaseHealthProbe({
      ping: () => new Promise<void>(() => undefined),
      cacheTtlMs: 1_000,
      timeoutMs: 50,
    });

    const readiness = databaseProbe.check();
    await vi.advanceTimersByTimeAsync(50);

    await expect(readiness).resolves.toBe(false);
  });
});
