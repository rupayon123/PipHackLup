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

export function getBotEnv(): BotEnv {
  const discordToken = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;

  if (!discordToken)
    throw new Error("DISCORD_TOKEN is required to run PipHackLup.");
  if (!clientId)
    throw new Error("DISCORD_CLIENT_ID is required to run PipHackLup.");

  const env: BotEnv = {
    discordToken,
    clientId,
    port: Number(process.env.PORT ?? 8787),
    ambientQaEnabled: process.env.PIPHACKLUP_AMBIENT_QA_ENABLED === "true",
  };
  if (process.env.DISCORD_TEST_GUILD_ID)
    env.testGuildId = process.env.DISCORD_TEST_GUILD_ID;
  if (process.env.PIPHACKLUP_PUBLIC_URL)
    env.publicUrl = process.env.PIPHACKLUP_PUBLIC_URL;
  return env;
}
