import "dotenv/config";

export interface BotEnv {
  discordToken: string;
  clientId: string;
  testGuildId?: string;
  port: number;
  publicUrl?: string;
}

export function getBotEnv(): BotEnv {
  const discordToken = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;

  if (!discordToken) throw new Error("DISCORD_TOKEN is required to run PipHackLup.");
  if (!clientId) throw new Error("DISCORD_CLIENT_ID is required to run PipHackLup.");

  const env: BotEnv = {
    discordToken,
    clientId,
    port: Number(process.env.PORT ?? 8787)
  };
  if (process.env.DISCORD_TEST_GUILD_ID) env.testGuildId = process.env.DISCORD_TEST_GUILD_ID;
  if (process.env.PIPHACKLUP_PUBLIC_URL) env.publicUrl = process.env.PIPHACKLUP_PUBLIC_URL;
  return env;
}
