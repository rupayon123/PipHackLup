import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

for (const envPath of [
  ".env.local",
  "../../.env.local",
  ".env",
  "../../.env",
]) {
  const absolutePath = resolve(process.cwd(), envPath);
  if (existsSync(absolutePath)) {
    config({ path: absolutePath, override: false });
  }
}

export interface BotEnv {
  discordToken: string;
  clientId: string;
  testGuildId?: string;
  port: number;
  publicUrl?: string;
  ambientQaEnabled: boolean;
}

const discordSnowflakePattern = /^[1-9]\d{16,19}$/u;

export function getBotEnv(): BotEnv {
  return parseBotEnv(process.env);
}

export function parseBotEnv(
  source: Readonly<Record<string, string | undefined>>,
): BotEnv {
  const discordToken = source.DISCORD_TOKEN;
  const clientId = source.DISCORD_CLIENT_ID;

  if (!discordToken || discordToken !== discordToken.trim())
    throw new Error("DISCORD_TOKEN is required to run PipHackLup.");
  if (!clientId || !discordSnowflakePattern.test(clientId))
    throw new Error(
      "DISCORD_CLIENT_ID must be a valid Discord application ID.",
    );

  const port = parsePort(source.PORT);
  const ambientQaEnabled = parseBoolean(
    source.PIPHACKLUP_AMBIENT_QA_ENABLED,
    "PIPHACKLUP_AMBIENT_QA_ENABLED",
  );

  const env: BotEnv = {
    discordToken,
    clientId,
    port,
    ambientQaEnabled,
  };
  if (source.DISCORD_TEST_GUILD_ID) {
    if (!discordSnowflakePattern.test(source.DISCORD_TEST_GUILD_ID)) {
      throw new Error(
        "DISCORD_TEST_GUILD_ID must be a valid Discord server ID.",
      );
    }
    env.testGuildId = source.DISCORD_TEST_GUILD_ID;
  }
  if (source.PIPHACKLUP_PUBLIC_URL) {
    env.publicUrl = parsePublicUrl(source.PIPHACKLUP_PUBLIC_URL);
  }
  return env;
}

function parsePort(value: string | undefined): number {
  const raw = value ?? "8787";
  if (!/^\d{1,5}$/u.test(raw)) {
    throw new Error("PORT must be an integer from 1 to 65535.");
  }
  const port = Number(raw);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer from 1 to 65535.");
  }
  return port;
}

function parseBoolean(value: string | undefined, name: string): boolean {
  if (value === undefined || value === "" || value === "false") return false;
  if (value === "true") return true;
  throw new Error(`${name} must be either true or false.`);
}

function parsePublicUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("PIPHACKLUP_PUBLIC_URL must be an absolute HTTP(S) URL.");
  }
  if (
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        new Set(["localhost", "127.0.0.1", "[::1]"]).has(url.hostname)
      )) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "PIPHACKLUP_PUBLIC_URL must be an HTTPS origin without credentials, a path, a query, or a fragment; HTTP is allowed only for localhost.",
    );
  }
  return url.origin;
}
