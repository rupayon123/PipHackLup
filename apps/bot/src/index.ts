import { createServer } from "node:http";
import { Client, Events, GatewayIntentBits, MessageFlags, TextChannel } from "discord.js";
import { handleChatInput } from "./commands/handlers.js";
import { getBotEnv } from "./env.js";
import { ensureConfig } from "./lib/store.js";

const env = getBotEnv();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`PipHackLup is online as ${readyClient.user.tag}.`);
});

client.on(Events.GuildCreate, (guild) => {
  ensureConfig(guild.id, guild.name);
  console.log(`Joined guild ${guild.name} (${guild.id}).`);
});

client.on(Events.GuildMemberAdd, async (member) => {
  const config = ensureConfig(member.guild.id, member.guild.name);
  if (!config.channels.welcome) return;

  const channel = await member.guild.channels.fetch(config.channels.welcome).catch(() => null);
  if (!(channel instanceof TextChannel)) return;

  await channel.send({
    content: `Welcome ${member}! Run </onboard checklist:0> to get your nickname, roles, profile, team, and help queue sorted.`
  });
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleChatInput(interaction);
      return;
    }

    if (interaction.isButton()) {
      await interaction.reply({
        content: "This panel is wired. Use the matching slash command for the full flow while the dashboard is in beta.",
        flags: MessageFlags.Ephemeral
      });
    }
  } catch (error) {
    console.error(error);
    if (interaction.isRepliable()) {
      const payload = {
        content: "PipHackLup hit an unexpected error. Please try again or tell an organizer.",
        flags: MessageFlags.Ephemeral as const
      };
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload).catch(() => null);
      } else {
        await interaction.reply(payload).catch(() => null);
      }
    }
  }
});

createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, bot: client.user?.tag ?? "starting" }));
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not_found" }));
}).listen(env.port, () => {
  console.log(`Health server listening on :${env.port}.`);
});

await client.login(env.discordToken);
