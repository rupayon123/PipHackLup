import { NextRequest, NextResponse } from "next/server";
import {
  createOauthState,
  getAppUrl,
  getDiscordAuthorizeUrl,
  isDiscordAuthConfigured,
  setOauthStateCookie,
} from "@/lib/discord-auth";
import {
  buildRateLimitKey,
  enforceRateLimit,
  getClientIp,
  webRateLimitPolicies,
} from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const rateLimitResponse = await enforceRateLimit(request, {
    key: buildRateLimitKey(["web", "auth-start", getClientIp(request)]),
    policy: webRateLimitPolicies.auth,
  });
  if (rateLimitResponse) return rateLimitResponse;

  if (!isDiscordAuthConfigured()) {
    return NextResponse.redirect(
      new URL("/dashboard?auth=missing", getAppUrl()),
    );
  }

  const state = createOauthState();
  await setOauthStateCookie(state);
  return NextResponse.redirect(getDiscordAuthorizeUrl(state));
}
