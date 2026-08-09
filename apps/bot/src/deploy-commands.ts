import { REST, Routes } from "discord.js";
import { commandDefinitions } from "./commands/definitions.js";
import { getBotEnv } from "./env.js";
import { planCommandDeployment } from "./lib/command-deployment.js";

const env = getBotEnv();
const rest = new REST({ version: "10" }).setToken(env.discordToken);
const plan = planCommandDeployment({
  testGuildId: env.testGuildId,
  arguments: process.argv.slice(2),
});

if (plan.scope === "guild") {
  await rest.put(Routes.applicationGuildCommands(env.clientId, plan.guildId), {
    body: commandDefinitions,
  });
  console.log(
    `Registered ${commandDefinitions.length} guild commands for ${plan.guildId}.`,
  );
} else {
  await rest.put(Routes.applicationCommands(env.clientId), {
    body: commandDefinitions,
  });
  console.log(`Registered ${commandDefinitions.length} global commands.`);
}
