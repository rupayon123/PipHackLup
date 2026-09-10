import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import {
  handlePendingSessionRevocationRequest,
  type PendingSessionRevocationDependencies,
} from "../lib/pending-session-revocation";

function createDependencies(
  hasPendingRevocations: boolean,
): PendingSessionRevocationDependencies {
  return {
    enforceRateLimit: vi.fn(async () => null),
    getAppUrl: () => "https://piphacklup.test",
    hasPendingRevocations: vi.fn(async () => hasPendingRevocations),
    isPostOriginAllowed: vi.fn(() => true),
    retryPendingRevocations: vi.fn(async () => 0),
  };
}

describe("pending session revocation route", () => {
  it("returns before origin and rate-limit work when the browser has no pending cookie", async () => {
    const dependencies = createDependencies(false);
    const request = new NextRequest(
      "https://piphacklup.test/api/auth/session/revoke-pending",
      { method: "POST" },
    );

    const response = await handlePendingSessionRevocationRequest(
      request,
      dependencies,
    );

    expect(response.status).toBe(204);
    expect(dependencies.isPostOriginAllowed).not.toHaveBeenCalled();
    expect(dependencies.enforceRateLimit).not.toHaveBeenCalled();
    expect(dependencies.retryPendingRevocations).not.toHaveBeenCalled();
  });

  it("origin-checks and rate-limits an actual pending retry", async () => {
    const dependencies = createDependencies(true);
    const request = new NextRequest(
      "https://piphacklup.test/api/auth/session/revoke-pending",
      {
        method: "POST",
        headers: { origin: "https://piphacklup.test" },
      },
    );

    const response = await handlePendingSessionRevocationRequest(
      request,
      dependencies,
    );

    expect(response.status).toBe(204);
    expect(dependencies.isPostOriginAllowed).toHaveBeenCalledOnce();
    expect(dependencies.enforceRateLimit).toHaveBeenCalledOnce();
    expect(dependencies.retryPendingRevocations).toHaveBeenCalledOnce();
  });

  it("rejects an untrusted origin before consuming a rate-limit bucket", async () => {
    const dependencies = createDependencies(true);
    dependencies.isPostOriginAllowed = vi.fn(() => false);
    const request = new NextRequest(
      "https://piphacklup.test/api/auth/session/revoke-pending",
      {
        method: "POST",
        headers: { origin: "https://attacker.invalid" },
      },
    );

    const response = await handlePendingSessionRevocationRequest(
      request,
      dependencies,
    );

    expect(response.status).toBe(403);
    expect(dependencies.enforceRateLimit).not.toHaveBeenCalled();
    expect(dependencies.retryPendingRevocations).not.toHaveBeenCalled();
  });

  it("does not attempt revocation when the pending retry is rate-limited", async () => {
    const dependencies = createDependencies(true);
    dependencies.enforceRateLimit = vi.fn(async () =>
      NextResponse.json({ error: "rate_limited" }, { status: 429 }),
    );
    const request = new NextRequest(
      "https://piphacklup.test/api/auth/session/revoke-pending",
      {
        method: "POST",
        headers: { origin: "https://piphacklup.test" },
      },
    );

    const response = await handlePendingSessionRevocationRequest(
      request,
      dependencies,
    );

    expect(response.status).toBe(429);
    expect(dependencies.retryPendingRevocations).not.toHaveBeenCalled();
  });
});
