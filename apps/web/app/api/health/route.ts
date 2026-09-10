import { isDatabaseConfigured, verifyDatabaseSchema } from "@piphacklup/db";
import { isDiscordAuthConfigured } from "@/lib/discord-auth";
import {
  isDiscordBotApiConfigured,
  verifyDiscordBotApplication,
} from "@/lib/discord-installation";
import { createCachedHealthProbe } from "@/lib/health";

const databaseHealthProbe = createCachedHealthProbe({
  check: verifyDatabaseSchema,
});
const discordHealthProbe = createCachedHealthProbe({
  check: verifyDiscordBotApplication,
});
const noStoreHeaders = { "cache-control": "no-store" };

export async function GET() {
  if (
    !isDatabaseConfigured() ||
    !isDiscordAuthConfigured() ||
    !isDiscordBotApiConfigured()
  ) {
    return Response.json(healthBody(false), {
      status: 503,
      headers: noStoreHeaders,
    });
  }

  const [databaseReady, discordReady] = await Promise.all([
    databaseHealthProbe.check(),
    discordHealthProbe.check(),
  ]);
  if (!databaseReady || !discordReady) {
    console.error(
      "PipHackLup web readiness could not verify its database schema or Discord application.",
    );
    return Response.json(healthBody(false), {
      status: 503,
      headers: noStoreHeaders,
    });
  }

  return Response.json(healthBody(true), { headers: noStoreHeaders });
}

function healthBody(ready: boolean) {
  return {
    ok: ready,
    app: "PipHackLup web",
    status: ready ? "ready" : "not_ready",
    release: releaseIdentifier(),
  };
}

function releaseIdentifier(): string {
  for (const candidate of [
    process.env.PIPHACKLUP_RELEASE_SHA,
    process.env.VERCEL_GIT_COMMIT_SHA,
    process.env.GITHUB_SHA,
  ]) {
    if (candidate && /^[a-f\d]{7,64}$/i.test(candidate)) {
      return candidate.toLowerCase();
    }
  }
  return "unknown";
}
