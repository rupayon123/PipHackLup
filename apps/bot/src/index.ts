import { createServer } from "node:http";
import {
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  TextChannel,
  type MessageCreateOptions,
} from "discord.js";
import { answerHackathonQuestion } from "@piphacklup/core";
import { handleChatInput } from "./commands/handlers.js";
import { getBotEnv } from "./env.js";
import { createStoredTicket, ensureConfig } from "./lib/store.js";
import {
  getTrainingSettings,
  listTrainingEntries,
} from "./lib/knowledge-store.js";

const env = getBotEnv();

type SendableChannel = {
  send: (options: MessageCreateOptions) => Promise<unknown>;
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    ...(env.ambientQaEnabled
      ? [GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
      : []),
  ],
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

  const channel = await member.guild.channels
    .fetch(config.channels.welcome)
    .catch(() => null);
  if (!(channel instanceof TextChannel)) return;

  await channel.send({
    content: `Welcome ${member}! Run </onboard checklist:0> to get your nickname, roles, profile, team, and help queue sorted.`,
  });
});

client.on(Events.MessageCreate, async (message) => {
  if (
    !env.ambientQaEnabled ||
    message.author.bot ||
    !message.guildId ||
    !client.user
  )
    return;
  const guild = message.guild;
  if (!guild) return;
  if (!message.mentions.has(client.user)) return;

  const mentionPattern = new RegExp(`<@!?${client.user.id}>`, "g");
  const question = message.content.replace(mentionPattern, "").trim();
  if (!question) {
    await message.reply(
      "Ask me a hackathon question after the mention, or use `/ask question:`.",
    );
    return;
  }

  const settings = await getTrainingSettings(message.guildId);
  const result = answerHackathonQuestion(
    question,
    await listTrainingEntries(message.guildId),
    settings,
  );
  const embed = new EmbedBuilder()
    .setTitle(
      result.shouldEscalate
        ? "PipHackLup answer + human follow-up"
        : "PipHackLup answer",
    )
    .setDescription(result.answer)
    .addFields(
      { name: "Confidence", value: `${result.confidence}%` },
      ...(result.matchedEntry
        ? [
            {
              name: "Source",
              value: `Staff training: **${result.matchedEntry.title}**`,
            },
          ]
        : []),
    )
    .setColor(result.shouldEscalate ? 0xf59e0b : 0x2f8fd8);

  await message.reply({ embeds: [embed] });

  if (!result.shouldEscalate) return;

  const config = ensureConfig(message.guildId, guild.name);
  const target = result.escalationTarget === "mentor" ? "mentor" : "staff";
  const roleId =
    target === "mentor"
      ? (settings.mentorRoleId ?? config.roles.mentor)
      : (settings.staffRoleId ??
        config.roles.organizer ??
        config.roles.moderator);
  const channel = settings.helpChannelId
    ? await guild.channels.fetch(settings.helpChannelId).catch(() => null)
    : message.channel;
  const ticket = createStoredTicket({
    guildId: message.guildId,
    kind: target === "mentor" ? "mentor" : "staff",
    requesterId: message.author.id,
    topic: `Q&A escalation: ${question.slice(0, 56)}`,
    description: question,
    priority: target === "mentor" ? 2 : 3,
  });

  if (isSendableChannel(channel)) {
    await channel.send({
      content: `${roleId ? `<@&${roleId}>` : target === "mentor" ? "Mentors" : "Staff"} PipHackLup needs a human answer for this participant question.`,
      embeds: [
        new EmbedBuilder()
          .setTitle(`PipHackLup Q&A escalation (${ticket.id})`)
          .setDescription(question)
          .addFields(
            { name: "Participant", value: `<@${message.author.id}>` },
            { name: "Bot answer", value: result.answer.slice(0, 1000) },
            { name: "Reason", value: result.escalationReason },
          )
          .setColor(0xf59e0b),
      ],
      allowedMentions: roleId
        ? { roles: [roleId], users: [message.author.id] }
        : { users: [message.author.id], roles: [] },
    });
  }
});

function isSendableChannel(channel: unknown): channel is SendableChannel {
  return typeof (channel as { send?: unknown } | null)?.send === "function";
}

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleChatInput(interaction);
      return;
    }

    if (interaction.isButton()) {
      await interaction.reply({
        content:
          "This panel is wired. Use the matching slash command for the full flow while the dashboard is in beta.",
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (error) {
    console.error(error);
    if (interaction.isRepliable()) {
      const payload = {
        content:
          "PipHackLup hit an unexpected error. Please try again or tell an organizer.",
        flags: MessageFlags.Ephemeral as const,
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
    response.end(
      JSON.stringify({ ok: true, bot: client.user?.tag ?? "starting" }),
    );
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not_found" }));
}).listen(env.port, () => {
  console.log(`Health server listening on :${env.port}.`);
});

await client.login(env.discordToken);
