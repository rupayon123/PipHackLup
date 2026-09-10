import type { NextRequest } from "next/server";
import { getAppUrl } from "./discord-auth";

export function hasTrustedMutationOrigin(request: NextRequest): boolean {
  const requestOrigin = request.headers.get("origin");
  if (!requestOrigin) return false;

  let normalizedOrigin: string;
  try {
    normalizedOrigin = new URL(requestOrigin).origin;
  } catch {
    return false;
  }

  const allowedOrigins = new Set([
    request.nextUrl.origin,
    new URL(getAppUrl()).origin,
  ]);
  return allowedOrigins.has(normalizedOrigin);
}
