export type CommandDeploymentPlan =
  | { scope: "guild"; guildId: string }
  | { scope: "global" };

export function planCommandDeployment(input: {
  testGuildId?: string | undefined;
  arguments: readonly string[];
}): CommandDeploymentPlan {
  const unsupported = input.arguments.filter(
    (argument) => argument !== "--global",
  );
  if (unsupported.length > 0) {
    throw new Error(
      `Unknown command deployment option: ${unsupported.join(", ")}.`,
    );
  }

  const globalRequested = input.arguments.includes("--global");
  if (globalRequested && input.testGuildId) {
    throw new Error(
      "Global command deployment cannot run while DISCORD_TEST_GUILD_ID is set.",
    );
  }
  if (input.testGuildId) {
    return { scope: "guild", guildId: input.testGuildId };
  }
  if (globalRequested) return { scope: "global" };

  throw new Error(
    "Command deployment stopped: set DISCORD_TEST_GUILD_ID for an isolated server, or pass --global only after the isolated release gate passes.",
  );
}
