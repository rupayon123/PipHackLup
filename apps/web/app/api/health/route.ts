import { isDatabaseConfigured, pingDatabase } from "@piphacklup/db";
import { isDiscordAuthConfigured } from "@/lib/discord-auth";
import { isDiscordBotApiConfigured } from "@/lib/discord-installation";
import { createCachedHealthProbe } from "@/lib/health";

const databaseHealthProbe = createCachedHealthProbe({ check: pingDatabase });
const noStoreHeaders = { "cache-control": "no-store" };

export async function GET() {
  if (
    !isDatabaseConfigured() ||
    !isDiscordAuthConfigured() ||
    !isDiscordBotApiConfigured()
  ) {
    return Response.json(
      { ok: false, app: "PipHackLup web", status: "not_ready" },
      { status: 503, headers: noStoreHeaders },
    );
  }

  if (!(await databaseHealthProbe.check())) {
    console.error("PipHackLup web health check could not reach the database.");
    return Response.json(
      { ok: false, app: "PipHackLup web", status: "not_ready" },
      { status: 503, headers: noStoreHeaders },
    );
  }

  return Response.json(
    { ok: true, app: "PipHackLup web", status: "ready" },
    { headers: noStoreHeaders },
  );
}
