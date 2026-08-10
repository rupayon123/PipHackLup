import { NextRequest, NextResponse } from "next/server";
import {
  consumeOauthStateCookie,
  createDiscordSessionFromCode,
  getAppUrl,
  setDiscordSessionCookie,
} from "@/lib/discord-auth";
import {
  buildRateLimitKey,
  enforceRateLimit,
  getClientIp,
  webRateLimitPolicies,
} from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const rateLimitResponse = await enforceRateLimit(request, {
    key: buildRateLimitKey(["web", "auth-callback", getClientIp(request)]),
    policy: webRateLimitPolicies.auth,
  });
  if (rateLimitResponse) return rateLimitResponse;

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const oauthError = request.nextUrl.searchParams.get("error");

  try {
    const validState = await consumeOauthStateCookie(state);
    if (!validState) {
      console.warn(
        "Discord OAuth callback rejected an invalid code or state; no session was created.",
      );
      return NextResponse.redirect(
        new URL(
          state ? "/dashboard?auth=expired" : "/dashboard?auth=failed",
          getAppUrl(),
        ),
      );
    }
    if (oauthError === "access_denied") {
      return NextResponse.redirect(
        new URL("/dashboard?auth=denied", getAppUrl()),
      );
    }
    if (!code || oauthError) {
      console.warn(
        "Discord OAuth callback did not include a usable authorization code; no session was created.",
      );
      return NextResponse.redirect(
        new URL("/dashboard?auth=failed", getAppUrl()),
      );
    }

    const created = await createDiscordSessionFromCode(code);
    await setDiscordSessionCookie(created);
    return NextResponse.redirect(new URL("/dashboard", getAppUrl()));
  } catch {
    console.error("Discord OAuth callback failed; no session was created.");
    return NextResponse.redirect(
      new URL("/dashboard?auth=failed", getAppUrl()),
    );
  }
}
