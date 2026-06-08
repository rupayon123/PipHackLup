import { NextResponse } from "next/server";
import {
  createOauthState,
  getAppUrl,
  getDiscordAuthorizeUrl,
  isDiscordAuthConfigured,
  setOauthStateCookie,
} from "@/lib/discord-auth";

export async function GET() {
  if (!isDiscordAuthConfigured()) {
    return NextResponse.redirect(
      new URL("/training?auth=missing", getAppUrl()),
    );
  }

  const state = createOauthState();
  await setOauthStateCookie(state);
  return NextResponse.redirect(getDiscordAuthorizeUrl(state));
}
