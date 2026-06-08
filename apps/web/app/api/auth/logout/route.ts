import { NextRequest, NextResponse } from "next/server";
import { clearDiscordSessionCookie, getAppUrl } from "@/lib/discord-auth";
import {
  buildRateLimitKey,
  enforceRateLimit,
  getClientIp,
  webRateLimitPolicies,
} from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const rateLimitResponse = enforceRateLimit(request, {
    key: buildRateLimitKey(["web", "auth-logout", getClientIp(request)]),
    policy: webRateLimitPolicies.auth,
  });
  if (rateLimitResponse) return rateLimitResponse;

  await clearDiscordSessionCookie();
  return NextResponse.redirect(new URL("/training", getAppUrl()));
}
