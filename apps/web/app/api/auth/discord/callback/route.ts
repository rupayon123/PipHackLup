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
  const rateLimitResponse = enforceRateLimit(request, {
    key: buildRateLimitKey(["web", "auth-callback", getClientIp(request)]),
    policy: webRateLimitPolicies.auth,
  });
  if (rateLimitResponse) return rateLimitResponse;

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const validState = await consumeOauthStateCookie(state);

  if (!code || !validState) {
    return NextResponse.redirect(new URL("/training?auth=failed", getAppUrl()));
  }

  try {
    const session = await createDiscordSessionFromCode(code);
    await setDiscordSessionCookie(session);
    return NextResponse.redirect(new URL("/training", getAppUrl()));
  } catch {
    return NextResponse.redirect(new URL("/training?auth=failed", getAppUrl()));
  }
}
