import { NextRequest, NextResponse } from "next/server";
import {
  getAppUrl,
  hasPendingDiscordSessionRevocations,
  isPostOriginAllowed,
  retryPendingDiscordSessionRevocations,
} from "./discord-auth";
import {
  buildRateLimitKey,
  enforceRateLimit,
  getClientIp,
  webRateLimitPolicies,
} from "./rate-limit";

export interface PendingSessionRevocationDependencies {
  enforceRateLimit: typeof enforceRateLimit;
  getAppUrl: typeof getAppUrl;
  hasPendingRevocations: typeof hasPendingDiscordSessionRevocations;
  isPostOriginAllowed: typeof isPostOriginAllowed;
  retryPendingRevocations: typeof retryPendingDiscordSessionRevocations;
}

const defaultDependencies: PendingSessionRevocationDependencies = {
  enforceRateLimit,
  getAppUrl,
  hasPendingRevocations: hasPendingDiscordSessionRevocations,
  isPostOriginAllowed,
  retryPendingRevocations: retryPendingDiscordSessionRevocations,
};

export async function handlePendingSessionRevocationRequest(
  request: NextRequest,
  dependencies: PendingSessionRevocationDependencies = defaultDependencies,
) {
  if (!(await dependencies.hasPendingRevocations())) {
    return new NextResponse(null, { status: 204 });
  }

  if (
    !dependencies.isPostOriginAllowed(
      request.headers.get("origin"),
      dependencies.getAppUrl(),
    )
  ) {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  }

  const rateLimitResponse = await dependencies.enforceRateLimit(request, {
    key: buildRateLimitKey([
      "web",
      "auth-revoke-pending",
      getClientIp(request),
    ]),
    policy: webRateLimitPolicies.auth,
    allowLocalFallback: true,
  });
  if (rateLimitResponse) return rateLimitResponse;

  const remaining = await dependencies.retryPendingRevocations();
  if (remaining) {
    return NextResponse.json(
      { error: "session_revocation_pending" },
      { status: 503 },
    );
  }
  return new NextResponse(null, { status: 204 });
}
