import { describe, expect, it } from "vitest";
import { parseBotEnv } from "../src/env.js";

const required = {
  DISCORD_TOKEN: "test-only.discord.token",
  DISCORD_CLIENT_ID: "1512918151313231983",
};

describe("bot environment", () => {
  it("parses a complete isolated-release configuration", () => {
    expect(
      parseBotEnv({
        ...required,
        DISCORD_TEST_GUILD_ID: "1536112346458624091",
        PORT: "9000",
        PIPHACKLUP_PUBLIC_URL: "https://piphacklup.vercel.app/",
        PIPHACKLUP_AMBIENT_QA_ENABLED: "true",
      }),
    ).toEqual({
      discordToken: required.DISCORD_TOKEN,
      clientId: required.DISCORD_CLIENT_ID,
      testGuildId: "1536112346458624091",
      port: 9000,
      publicUrl: "https://piphacklup.vercel.app",
      ambientQaEnabled: true,
    });
  });

  it("uses safe local defaults for optional values", () => {
    expect(parseBotEnv(required)).toEqual({
      discordToken: required.DISCORD_TOKEN,
      clientId: required.DISCORD_CLIENT_ID,
      port: 8787,
      ambientQaEnabled: false,
    });
  });

  it.each([
    [{ ...required, DISCORD_TOKEN: " token" }, "DISCORD_TOKEN"],
    [{ ...required, DISCORD_CLIENT_ID: "client-id" }, "DISCORD_CLIENT_ID"],
    [{ ...required, DISCORD_TEST_GUILD_ID: "1" }, "DISCORD_TEST_GUILD_ID"],
    [{ ...required, PORT: "0" }, "PORT"],
    [{ ...required, PORT: "65536" }, "PORT"],
    [{ ...required, PORT: "8787.5" }, "PORT"],
    [
      { ...required, PIPHACKLUP_AMBIENT_QA_ENABLED: "yes" },
      "PIPHACKLUP_AMBIENT_QA_ENABLED",
    ],
    [
      { ...required, PIPHACKLUP_PUBLIC_URL: "javascript:alert(1)" },
      "PIPHACKLUP_PUBLIC_URL",
    ],
    [
      { ...required, PIPHACKLUP_PUBLIC_URL: "http://public.example.test" },
      "PIPHACKLUP_PUBLIC_URL",
    ],
    [
      { ...required, PIPHACKLUP_PUBLIC_URL: "https://example.test/dashboard" },
      "PIPHACKLUP_PUBLIC_URL",
    ],
  ])("rejects invalid configuration %#", (input, variableName) => {
    expect(() => parseBotEnv(input)).toThrow(String(variableName));
  });
});
