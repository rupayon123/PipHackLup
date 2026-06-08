import { NextResponse } from "next/server";
import { clearDiscordSessionCookie, getAppUrl } from "@/lib/discord-auth";

export async function GET() {
  await clearDiscordSessionCookie();
  return NextResponse.redirect(new URL("/training", getAppUrl()));
}
