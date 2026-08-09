import { NextRequest, NextResponse } from "next/server";
import {
  clearDiscordSessionCookie,
  getAppUrl,
  isPostOriginAllowed,
} from "@/lib/discord-auth";
import {
  buildRateLimitKey,
  enforceRateLimit,
  getClientIp,
  webRateLimitPolicies,
} from "@/lib/rate-limit";

export function GET() {
  return NextResponse.redirect(
    new URL("/dashboard?auth=logout_requires_post", getAppUrl()),
  );
}

export async function POST(request: NextRequest) {
  const rateLimitResponse = await enforceRateLimit(request, {
    key: buildRateLimitKey(["web", "auth-logout", getClientIp(request)]),
    policy: webRateLimitPolicies.auth,
    allowLocalFallback: true,
  });
  if (rateLimitResponse) return rateLimitResponse;

  if (!isPostOriginAllowed(request.headers.get("origin"), getAppUrl())) {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  }

  const { revocationPending } = await clearDiscordSessionCookie();
  return NextResponse.redirect(
    new URL(
      revocationPending ? "/dashboard?auth=logout_incomplete" : "/dashboard",
      getAppUrl(),
    ),
    303,
  );
}
