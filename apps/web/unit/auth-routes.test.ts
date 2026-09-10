import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  clearDiscordSessionCookie: vi.fn(),
  consumeOauthStateCookie: vi.fn(),
  createDiscordSessionFromCode: vi.fn(),
  createOauthState: vi.fn(),
  getAppUrl: vi.fn(),
  getDiscordAuthorizeUrl: vi.fn(),
  isDiscordAuthConfigured: vi.fn(),
  isPostOriginAllowed: vi.fn(),
  setDiscordSessionCookie: vi.fn(),
  setOauthStateCookie: vi.fn(),
}));

const rateLimitMocks = vi.hoisted(() => ({
  buildRateLimitKey: vi.fn(),
  enforceRateLimit: vi.fn(),
  getClientIp: vi.fn(),
  webRateLimitPolicies: { auth: { limit: 5, windowMs: 60_000 } },
}));

vi.mock("@/lib/discord-auth", () => authMocks);
vi.mock("@/lib/rate-limit", () => rateLimitMocks);

import { GET as startDiscordOauth } from "../app/api/auth/discord/start/route";
import { GET as finishDiscordOauth } from "../app/api/auth/discord/callback/route";
import {
  GET as getLogout,
  POST as postLogout,
} from "../app/api/auth/logout/route";

const APP_URL = "https://piphacklup.test";
const STATE = "a".repeat(32);
const createdSession = {
  expiresAt: new Date("2026-08-10T00:00:00.000Z"),
  sessionToken: "s".repeat(43),
};

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.getAppUrl.mockReturnValue(APP_URL);
  authMocks.createOauthState.mockReturnValue(STATE);
  authMocks.getDiscordAuthorizeUrl.mockReturnValue(
    `https://discord.com/oauth2/authorize?state=${STATE}`,
  );
  authMocks.isDiscordAuthConfigured.mockReturnValue(true);
  authMocks.isPostOriginAllowed.mockReturnValue(true);
  authMocks.consumeOauthStateCookie.mockResolvedValue(true);
  authMocks.createDiscordSessionFromCode.mockResolvedValue(createdSession);
  authMocks.clearDiscordSessionCookie.mockResolvedValue({
    revocationPending: false,
  });
  rateLimitMocks.getClientIp.mockReturnValue("203.0.113.10");
  rateLimitMocks.buildRateLimitKey.mockImplementation((parts: string[]) =>
    parts.join(":"),
  );
  rateLimitMocks.enforceRateLimit.mockResolvedValue(null);
});

describe("Discord OAuth start route", () => {
  it("propagates a rate-limit response before starting OAuth", async () => {
    const limited = NextResponse.json(
      { error: "rate_limited" },
      { status: 429 },
    );
    rateLimitMocks.enforceRateLimit.mockResolvedValue(limited);
    const request = new NextRequest(`${APP_URL}/api/auth/discord/start`);

    const response = await startDiscordOauth(request);

    expect(response).toBe(limited);
    expect(rateLimitMocks.enforceRateLimit).toHaveBeenCalledWith(request, {
      key: "web:auth-start:203.0.113.10",
      policy: rateLimitMocks.webRateLimitPolicies.auth,
    });
    expect(authMocks.isDiscordAuthConfigured).not.toHaveBeenCalled();
    expect(authMocks.setOauthStateCookie).not.toHaveBeenCalled();
  });

  it("redirects to a safe dashboard error when OAuth is unconfigured", async () => {
    authMocks.isDiscordAuthConfigured.mockReturnValue(false);
    authMocks.getAppUrl.mockReturnValue("http://localhost:3000");

    const response = await startDiscordOauth(
      new NextRequest(`${APP_URL}/api/auth/discord/start`),
    );

    expect(response.headers.get("location")).toBe(
      `${APP_URL}/dashboard?auth=missing`,
    );
    expect(authMocks.createOauthState).not.toHaveBeenCalled();
    expect(authMocks.setOauthStateCookie).not.toHaveBeenCalled();
  });

  it("stores a fresh state before redirecting to Discord", async () => {
    const response = await startDiscordOauth(
      new NextRequest(`${APP_URL}/api/auth/discord/start`),
    );

    expect(authMocks.createOauthState).toHaveBeenCalledOnce();
    expect(authMocks.setOauthStateCookie).toHaveBeenCalledWith(STATE);
    expect(authMocks.getDiscordAuthorizeUrl).toHaveBeenCalledWith(STATE);
    expect(
      authMocks.setOauthStateCookie.mock.invocationCallOrder[0],
    ).toBeLessThan(
      authMocks.getDiscordAuthorizeUrl.mock.invocationCallOrder[0] ?? 0,
    );
    expect(response.headers.get("location")).toBe(
      `https://discord.com/oauth2/authorize?state=${STATE}`,
    );
  });
});

describe("Discord OAuth callback route", () => {
  it("propagates a rate-limit response before consuming OAuth state", async () => {
    const limited = NextResponse.json(
      { error: "rate_limited" },
      { status: 429 },
    );
    rateLimitMocks.enforceRateLimit.mockResolvedValue(limited);
    const request = new NextRequest(
      `${APP_URL}/api/auth/discord/callback?code=code&state=${STATE}`,
    );

    const response = await finishDiscordOauth(request);

    expect(response).toBe(limited);
    expect(rateLimitMocks.enforceRateLimit).toHaveBeenCalledWith(request, {
      key: "web:auth-callback:203.0.113.10",
      policy: rateLimitMocks.webRateLimitPolicies.auth,
    });
    expect(authMocks.consumeOauthStateCookie).not.toHaveBeenCalled();
    expect(authMocks.createDiscordSessionFromCode).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "missing authorization code",
      query: `state=${STATE}`,
      stateIsValid: true,
      expectedStatus: "failed",
    },
    {
      label: "invalid state",
      query: `code=authorization-code&state=${"b".repeat(32)}`,
      stateIsValid: false,
      expectedStatus: "expired",
    },
  ])(
    "rejects $label without creating a session",
    async ({ query, stateIsValid, expectedStatus }) => {
      authMocks.consumeOauthStateCookie.mockResolvedValue(stateIsValid);
      const warn = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);

      try {
        const response = await finishDiscordOauth(
          new NextRequest(`${APP_URL}/api/auth/discord/callback?${query}`),
        );

        expect(response.headers.get("location")).toBe(
          `${APP_URL}/dashboard?auth=${expectedStatus}`,
        );
        expect(authMocks.consumeOauthStateCookie).toHaveBeenCalledOnce();
        expect(authMocks.createDiscordSessionFromCode).not.toHaveBeenCalled();
        expect(authMocks.setDiscordSessionCookie).not.toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
    },
  );

  it("maps a valid Discord access denial to friendly canceled copy", async () => {
    const response = await finishDiscordOauth(
      new NextRequest(
        `${APP_URL}/api/auth/discord/callback?error=access_denied&state=${STATE}`,
      ),
    );

    expect(authMocks.consumeOauthStateCookie).toHaveBeenCalledWith(STATE);
    expect(response.headers.get("location")).toBe(
      `${APP_URL}/dashboard?auth=denied`,
    );
    expect(authMocks.createDiscordSessionFromCode).not.toHaveBeenCalled();
    expect(authMocks.setDiscordSessionCookie).not.toHaveBeenCalled();
  });

  it("consumes state, creates a session, sets its cookie, and redirects", async () => {
    const request = new NextRequest(
      `${APP_URL}/api/auth/discord/callback?code=authorization-code&state=${STATE}`,
    );

    const response = await finishDiscordOauth(request);

    expect(authMocks.consumeOauthStateCookie).toHaveBeenCalledWith(STATE);
    expect(authMocks.createDiscordSessionFromCode).toHaveBeenCalledWith(
      "authorization-code",
    );
    expect(authMocks.setDiscordSessionCookie).toHaveBeenCalledWith(
      createdSession,
    );
    expect(
      authMocks.consumeOauthStateCookie.mock.invocationCallOrder[0],
    ).toBeLessThan(
      authMocks.createDiscordSessionFromCode.mock.invocationCallOrder[0] ?? 0,
    );
    expect(
      authMocks.createDiscordSessionFromCode.mock.invocationCallOrder[0],
    ).toBeLessThan(
      authMocks.setDiscordSessionCookie.mock.invocationCallOrder[0] ?? 0,
    );
    expect(response.headers.get("location")).toBe(`${APP_URL}/dashboard`);
  });

  it("fails closed when Discord rejects the authorization code", async () => {
    authMocks.createDiscordSessionFromCode.mockRejectedValue(
      new Error("invalid authorization code"),
    );
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      const response = await finishDiscordOauth(
        new NextRequest(
          `${APP_URL}/api/auth/discord/callback?code=bad-code&state=${STATE}`,
        ),
      );

      expect(response.headers.get("location")).toBe(
        `${APP_URL}/dashboard?auth=failed`,
      );
      expect(authMocks.setDiscordSessionCookie).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });
});

describe("Discord logout route", () => {
  it("requires POST for logout", () => {
    const response = getLogout();

    expect(response.headers.get("location")).toBe(
      `${APP_URL}/dashboard?auth=logout_requires_post`,
    );
    expect(authMocks.clearDiscordSessionCookie).not.toHaveBeenCalled();
  });

  it("propagates a rate-limit response before origin or session work", async () => {
    const limited = NextResponse.json(
      { error: "rate_limited" },
      { status: 429 },
    );
    rateLimitMocks.enforceRateLimit.mockResolvedValue(limited);
    const request = new NextRequest(`${APP_URL}/api/auth/logout`, {
      method: "POST",
      headers: { origin: APP_URL },
    });

    const response = await postLogout(request);

    expect(response).toBe(limited);
    expect(rateLimitMocks.enforceRateLimit).toHaveBeenCalledWith(request, {
      allowLocalFallback: true,
      key: "web:auth-logout:203.0.113.10",
      policy: rateLimitMocks.webRateLimitPolicies.auth,
    });
    expect(authMocks.isPostOriginAllowed).not.toHaveBeenCalled();
    expect(authMocks.clearDiscordSessionCookie).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin POST without clearing the session", async () => {
    authMocks.isPostOriginAllowed.mockReturnValue(false);
    const request = new NextRequest(`${APP_URL}/api/auth/logout`, {
      method: "POST",
      headers: { origin: "https://attacker.invalid" },
    });

    const response = await postLogout(request);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "invalid_origin" });
    expect(authMocks.isPostOriginAllowed).toHaveBeenCalledWith(
      "https://attacker.invalid",
      APP_URL,
    );
    expect(authMocks.clearDiscordSessionCookie).not.toHaveBeenCalled();
  });

  it("clears a same-origin session and redirects with 303", async () => {
    const request = new NextRequest(`${APP_URL}/api/auth/logout`, {
      method: "POST",
      headers: { origin: APP_URL },
    });

    const response = await postLogout(request);

    expect(authMocks.isPostOriginAllowed).toHaveBeenCalledWith(
      APP_URL,
      APP_URL,
    );
    expect(authMocks.clearDiscordSessionCookie).toHaveBeenCalledOnce();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${APP_URL}/dashboard`);
  });

  it("surfaces pending server-side revocation after local logout", async () => {
    authMocks.clearDiscordSessionCookie.mockResolvedValue({
      revocationPending: true,
    });

    const response = await postLogout(
      new NextRequest(`${APP_URL}/api/auth/logout`, {
        method: "POST",
        headers: { origin: APP_URL },
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      `${APP_URL}/dashboard?auth=logout_incomplete`,
    );
  });
});
