import { createServer, type ServerResponse } from "node:http";
import {
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  TextChannel,
  type MessageCreateOptions,
} from "discord.js";
import { answerHackathonQuestion, createQueueTicket } from "@piphacklup/core";
import { isDatabaseConfigured } from "@piphacklup/db";
import { handleChatInput } from "./commands/handlers.js";
import { getBotEnv } from "./env.js";
import {
  buildHealthStatus,
  buildProbedHealthStatus,
  createDatabaseHealthProbe,
  resolveReleaseIdentifier,
} from "./lib/health.js";
import {
  hasOnlyAllowedAutomaticRoleChannelGrants,
  isSafeAutomaticAssignmentRole,
} from "./lib/automatic-role-safety.js";
import { safelyHandleDiscordEvent } from "./lib/discord-event-safety.js";
import {
  buildWelcomeMessage,
  selectAmbientEscalationRoleId,
} from "./lib/discord-copy.js";
import { fetchVerifiedStaffPrivateChannel } from "./lib/escalation-channel.js";
import {
  getTrainingSettings,
  listTrainingEntries,
} from "./lib/knowledge-store.js";
import {
  botRateLimitKey,
  botRateLimitPolicies,
  checkBotRateLimit,
} from "./lib/rate-limit.js";
import {
  getPanelActionResponse,
  onboardingRulesAcknowledgementId,
} from "./lib/panel-actions.js";
import { resolveRoleNotificationTarget } from "./lib/role-notification.js";
import { handleOnboardingRulesAcknowledgement } from "./lib/onboarding-role.js";
import {
  evictGuildOperationalCache,
  initializeGuildPersistence,
  loadPersistentGuildConfig,
  markGuildInstallation,
  persistQueueTicket,
  persistenceOperationName,
  verifyDatabaseConnection,
} from "./lib/persistence.js";
import { createGuildPersistenceRetryQueue } from "./lib/persistence-retry.js";

const env = getBotEnv();
let startupHydrationComplete = false;
let databaseConnectionReady = false;

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
const databaseHealthProbe = createDatabaseHealthProbe({
  ping: () => verifyDatabaseConnection(),
});
const guildPersistenceRetries = createGuildPersistenceRetryQueue({
  run: async ({ guild, installed }) => {
    if (installed) await initializeGuildPersistence(guild);
    else await markGuildInstallation(guild, false);
  },
  onFailure: (operation, error) => {
    logPersistenceFailure(
      operation.guild.id,
      operation.installed
        ? "retry guild installation hydration"
        : "retry guild removal record",
      error,
    );
  },
});

client.on(Events.Error, () => {
  console.error("PipHackLup Discord client error boundary handled an error.");
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`PipHackLup is online as ${readyClient.user.tag}.`);
  const guilds = [...readyClient.guilds.cache.values()];
  for (const guild of guilds) guildPersistenceRetries.clear(guild.id);
  const hydrationResults = await Promise.allSettled(
    guilds.map((guild) =>
      initializeGuildPersistence({ id: guild.id, name: guild.name }),
    ),
  );
  hydrationResults.forEach((result, index) => {
    const guild = guilds[index];
    if (result.status === "fulfilled") {
      if (guild) {
        guildPersistenceRetries.clear(guild.id);
        databaseConnectionReady = true;
      }
      return;
    }
    if (guild) {
      guildPersistenceRetries.markPending({
        guild: { id: guild.id, name: guild.name },
        installed: true,
      });
    }
    logPersistenceFailure(
      guild?.id ?? "unknown",
      "hydrate guild on ready",
      result.reason,
    );
  });
  startupHydrationComplete = true;
});

client.on(Events.GuildCreate, async (guild) => {
  guildPersistenceRetries.clear(guild.id);
  try {
    await initializeGuildPersistence({ id: guild.id, name: guild.name });
    guildPersistenceRetries.clear(guild.id);
    databaseConnectionReady = true;
    console.log(`Joined and hydrated guild ${guild.name} (${guild.id}).`);
  } catch (error) {
    guildPersistenceRetries.markPending({
      guild: { id: guild.id, name: guild.name },
      installed: true,
    });
    logPersistenceFailure(guild.id, "record guild installation", error);
  }
});

client.on(Events.GuildDelete, async (guild) => {
  guildPersistenceRetries.clear(guild.id);
  try {
    await markGuildInstallation({ id: guild.id, name: guild.name }, false);
    guildPersistenceRetries.clear(guild.id);
    databaseConnectionReady = true;
    console.log(`Recorded removal from guild ${guild.name} (${guild.id}).`);
  } catch (error) {
    guildPersistenceRetries.markPending({
      guild: { id: guild.id, name: guild.name },
      installed: false,
    });
    logPersistenceFailure(guild.id, "record guild removal", error);
  } finally {
    evictGuildOperationalCache(guild.id);
  }
});

client.on(Events.GuildMemberAdd, async (member) => {
  if (member.user.bot) return;
  let config;
  try {
    config = await loadPersistentGuildConfig({
      id: member.guild.id,
      name: member.guild.name,
    });
  } catch (error) {
    logPersistenceFailure(
      member.guild.id,
      "load welcome-channel configuration",
      error,
    );
    return;
  }

  const newcomerRoleId = config.roles.newcomer;
  if (newcomerRoleId && !member.roles.cache.has(newcomerRoleId)) {
    const newcomerRole = await member.guild.roles
      .fetch(newcomerRoleId)
      .catch(() => null);
    if (
      newcomerRole &&
      isSafeAutomaticAssignmentRole(
        newcomerRole,
        member.guild.roles.everyone.id,
      ) &&
      hasOnlyAllowedAutomaticRoleChannelGrants(
        newcomerRole.id,
        member.guild.channels.cache.values(),
      )
    ) {
      await member.roles
        .add(newcomerRole, "PipHackLup newcomer onboarding")
        .catch(() =>
          console.error(
            `PipHackLup could not add the newcomer role in guild ${member.guild.id}.`,
          ),
        );
    } else {
      console.error(
        `PipHackLup newcomer role is missing or unsafe for automatic assignment in guild ${member.guild.id}.`,
      );
    }
  }
  if (!config.channels.welcome) return;

  const channel = await member.guild.channels
    .fetch(config.channels.welcome)
    .catch(() => null);
  if (!(channel instanceof TextChannel)) return;

  await channel
    .send({
      content: buildWelcomeMessage(member.toString()),
    })
    .catch(() =>
      console.error(
        `PipHackLup welcome message failed in guild ${member.guild.id}.`,
      ),
    );
});

client.on(Events.MessageCreate, (message) => {
  void safelyHandleDiscordEvent("message-create", message.guildId, async () => {
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

    const ambientRateLimit = checkBotRateLimit(
      botRateLimitKey(["ambient-qa", message.guildId, message.author.id]),
      botRateLimitPolicies.ambientQa,
    );
    if (!ambientRateLimit.allowed) {
      await message.reply(
        `I am cooling down for this chat flow. Try again in ${ambientRateLimit.retryAfterSeconds}s or open a help queue ticket.`,
      );
      return;
    }

    let settings;
    let trainingEntries;
    try {
      [settings, trainingEntries] = await Promise.all([
        getTrainingSettings(message.guildId),
        listTrainingEntries(message.guildId),
      ]);
    } catch (error) {
      logPersistenceFailure(
        message.guildId,
        "load ambient Q&A knowledge",
        error,
      );
      await message
        .reply(
          `I could not ${persistenceOperationName(error)}, so I cannot give a reliable staff-trained answer right now. Use \`/queue open\` or tell an organizer.`,
        )
        .catch(() => null);
      return;
    }
    const result = answerHackathonQuestion(question, trainingEntries, settings);
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

    let config;
    try {
      config = await loadPersistentGuildConfig({
        id: message.guildId,
        name: guild.name,
      });
    } catch (error) {
      logPersistenceFailure(
        message.guildId,
        "load ambient Q&A escalation configuration",
        error,
      );
      await message
        .reply(
          `I could not ${persistenceOperationName(error)}, so I did not claim that a durable follow-up ticket was opened. Please use \`/queue open\` or tell an organizer.`,
        )
        .catch(() => null);
      return;
    }
    const target = result.escalationTarget === "mentor" ? "mentor" : "staff";
    const roleId = selectAmbientEscalationRoleId({
      target,
      settings,
      configRoles: config.roles,
    });
    const requiresStaffPrivateChannel = target === "staff";
    const channel = requiresStaffPrivateChannel
      ? await fetchVerifiedStaffPrivateChannel({
          guild,
          channelId: config.channels.moderationLog,
          configuredStaffRoleIds: [
            config.roles.organizer,
            config.roles.moderator,
            settings.staffRoleId,
          ],
        })
      : settings.helpChannelId
        ? await guild.channels.fetch(settings.helpChannelId).catch(() => null)
        : message.channel;
    const ticket = createQueueTicket({
      guildId: message.guildId,
      kind: target === "mentor" ? "mentor" : "staff",
      requesterId: message.author.id,
      topic: `Q&A escalation: ${question.slice(0, 56)}`,
      description: question,
      priority: target === "mentor" ? 2 : 3,
    });
    try {
      await persistQueueTicket(
        { id: message.guildId, name: guild.name },
        ticket,
      );
    } catch (error) {
      logPersistenceFailure(
        message.guildId,
        "save ambient Q&A escalation ticket",
        error,
      );
      await message
        .reply(
          `I could not ${persistenceOperationName(error)}, so no durable follow-up ticket was opened. Please use \`/queue open\` or tell an organizer.`,
        )
        .catch(() => null);
      return;
    }

    const escalationEmbed = new EmbedBuilder()
      .setTitle(`PipHackLup Q&A escalation (${ticket.id})`)
      .setDescription(
        requiresStaffPrivateChannel
          ? question
          : "A participant requested mentor follow-up. The question and identity were kept out of this public notification; authorized staff can review the durable ticket.",
      )
      .setColor(0xf59e0b);
    if (requiresStaffPrivateChannel) {
      escalationEmbed.addFields(
        { name: "Participant", value: `<@${message.author.id}>` },
        { name: "Bot answer", value: result.answer.slice(0, 1000) },
        { name: "Reason", value: result.escalationReason },
      );
    }

    if (isSendableChannel(channel)) {
      const roleNotification = await resolveRoleNotificationTarget(
        guild,
        roleId,
        target === "mentor" ? "Mentors" : "Staff",
      );
      await channel
        .send({
          content: `${roleNotification.label} PipHackLup needs a human answer for this participant question.${roleNotification.truncated ? " Additional role holders can review the durable queue." : ""}`,
          embeds: [escalationEmbed],
          allowedMentions: {
            roles: [],
            users: [
              ...roleNotification.userIds,
              ...(requiresStaffPrivateChannel ? [message.author.id] : []),
            ],
          },
        })
        .catch(async () => {
          await message
            .reply(
              `I opened durable follow-up ticket \`${ticket.id}\`, but Discord rejected the staff-channel notification. An organizer can still find it with \`/queue status\`.`,
            )
            .catch(() => null);
        });
    } else {
      await message
        .reply(
          requiresStaffPrivateChannel
            ? `I opened durable follow-up ticket \`${ticket.id}\`, but no verified staff-private channel was available. I did not repost the question or participant identity anywhere else. An organizer can still find the ticket with \`/queue status\`.`
            : `I opened durable mentor ticket \`${ticket.id}\`, but I could not find a channel for the redacted mentor notification. An organizer can still find it with \`/queue status\`.`,
        )
        .catch(() => null);
    }
  });
});

function isSendableChannel(channel: unknown): channel is SendableChannel {
  return typeof (channel as { send?: unknown } | null)?.send === "function";
}

function logPersistenceFailure(
  guildId: string,
  context: string,
  error: unknown,
): void {
  console.error(
    `PipHackLup persistence failure (${context}) in guild ${guildId}: ${persistenceOperationName(error)}.`,
  );
}

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleChatInput(interaction);
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId === onboardingRulesAcknowledgementId) {
        await handleOnboardingRulesAcknowledgement(interaction);
        return;
      }
      const content = getPanelActionResponse(interaction.customId);
      if (!content) {
        if (interaction.customId.startsWith("piphacklup:")) {
          await interaction.reply({
            content:
              "That PipHackLup panel action is no longer available. Ask an organizer to rerun `/setup` to refresh the panel.",
            flags: MessageFlags.Ephemeral,
          });
        }
        return;
      }

      await interaction.reply({
        content,
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch {
    console.error(
      `PipHackLup interaction handling failed for interaction ${interaction.id}.`,
    );
    if (interaction.isRepliable()) {
      const content =
        "PipHackLup hit an unexpected error. Please try again or tell an organizer.";
      if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({ content }).catch(() => null);
      } else if (interaction.replied) {
        await interaction
          .followUp({ content, flags: MessageFlags.Ephemeral })
          .catch(() => null);
      } else {
        await interaction
          .reply({ content, flags: MessageFlags.Ephemeral })
          .catch(() => null);
      }
    }
  }
});

if (!isDatabaseConfigured()) {
  console.error(
    "PipHackLup startup stopped because durable database storage is not configured.",
  );
  process.exitCode = 1;
} else {
  try {
    await verifyDatabaseConnection();
    databaseConnectionReady = true;
  } catch {
    console.error(
      "PipHackLup startup stopped because the durable database connectivity check failed.",
    );
    process.exitCode = 1;
  }
}

if (databaseConnectionReady) {
  createServer((request, response) => {
    if (request.url === "/health") {
      void respondToHealthRequest(response).catch(() => response.destroy());
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
  }).listen(env.port, () => {
    console.log(`Health server listening on :${env.port}.`);
  });

  await client.login(env.discordToken);
}

async function respondToHealthRequest(response: ServerResponse): Promise<void> {
  // Reconciliation runs in the background so a stalled lifecycle write cannot
  // make the health endpoint itself hang. Readiness stays degraded until a
  // later request observes the successful retry.
  void guildPersistenceRetries.retryDue();
  const databaseConfigured = isDatabaseConfigured();
  const input = {
    discordReady: client.isReady(),
    ...(client.user?.tag ? { botTag: client.user.tag } : {}),
    release: resolveReleaseIdentifier(process.env),
    databaseConfigured,
    databaseInitializationComplete: startupHydrationComplete,
    databaseStateReady:
      databaseConnectionReady &&
      startupHydrationComplete &&
      !guildPersistenceRetries.hasPending(),
  };
  let health;
  try {
    health = await buildProbedHealthStatus(input, databaseHealthProbe);
  } catch {
    health = buildHealthStatus({ ...input, databaseReady: false });
  }
  response.writeHead(health.statusCode, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(health.body));
}
