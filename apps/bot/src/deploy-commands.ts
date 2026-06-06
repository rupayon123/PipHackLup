import { REST, Routes } from "discord.js";
import { commandDefinitions } from "./commands/definitions.js";
import { getBotEnv } from "./env.js";

const env = getBotEnv();
const rest = new REST({ version: "10" }).setToken(env.discordToken);

if (env.testGuildId) {
  await rest.put(Routes.applicationGuildCommands(env.clientId, env.testGuildId), {
    body: commandDefinitions
  });
  console.log(`Registered ${commandDefinitions.length} guild commands for ${env.testGuildId}.`);
} else {
  await rest.put(Routes.applicationCommands(env.clientId), {
    body: commandDefinitions
  });
  console.log(`Registered ${commandDefinitions.length} global commands.`);
}
