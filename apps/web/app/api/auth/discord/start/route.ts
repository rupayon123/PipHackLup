import { NextRequest, NextResponse } from "next/server";
import {
  createOauthState,
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
      new URL("/dashboard?auth=missing", request.url),
    );
  }

  const state = createOauthState();
  await setOauthStateCookie(state);
  return NextResponse.redirect(getDiscordAuthorizeUrl(state));
}
