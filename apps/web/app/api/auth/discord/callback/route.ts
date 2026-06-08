import { NextRequest, NextResponse } from "next/server";
import {
  consumeOauthStateCookie,
  createDiscordSessionFromCode,
  getAppUrl,
  setDiscordSessionCookie,
} from "@/lib/discord-auth";

export async function GET(request: NextRequest) {
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
