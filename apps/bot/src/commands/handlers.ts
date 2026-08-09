import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  MessageFlags,
  PermissionFlagsBits,
  type MessageCreateOptions,
} from "discord.js";
import {
  answerHackathonQuestion,
  assertKnowledgeTrainingIsSafe,
  claimTicket,
  closeTicket,
  createModerationCase,
  createQueueTicket,
  createTeam,
  defaultAutoModTemplates,
  escalateTicket,
  KnowledgeSafetyError,
  orderQueue,
  parseKnowledgeImportText,
  suggestTeamMatches,
  type CreateKnowledgeEntryInput,
  type HackathonKnowledgeEntry,
  type KnowledgeAnswerResult,
  type KnowledgeEscalationTarget,
  type KnowledgeAssistantSettings,
  type OnboardingMode,
  type QueueKind,
} from "@piphacklup/core";
import type { GuildIdentity } from "@piphacklup/db";
import {
  canCloseQueueTicketWithWorkerAccess,
  canManageQueueTicket,
  canViewQueueTicket,
  hasManageGuildPermission,
  resolveQueueWorkerAuthorization,
} from "../lib/authorization.js";
import { fetchVerifiedStaffPrivateChannel } from "../lib/escalation-channel.js";
import {
  addTrainingEntries,
  addTrainingEntry,
  getTrainingSettings,
  listTrainingEntries,
  removeTrainingEntry,
  saveTrainingSettings,
} from "../lib/knowledge-store.js";
import {
  botRateLimitKey,
  botRateLimitPolicies,
  checkBotRateLimit,
} from "../lib/rate-limit.js";
import { buildPanelActionRow } from "../lib/panel-actions.js";
import {
  buildSetupReportSections,
  hasIncompleteSetup,
  mergeProvisionedConfig,
  provisionHackathonGuild,
  type SetupOperation,
} from "../lib/setup-provisioning.js";
import {
  buildMemberProfile,
  hydrateGuildOperationalState,
  listPersistentQueueTickets,
  loadPersistentGuildConfig,
  loadPersistentQueueTicket,
  persistAuditEvent,
  persistGuildConfig,
  persistMemberProfile,
  persistModerationCase,
  persistModerationCaseWithAudit,
  persistQueueTicket,
  persistTeam,
  persistenceOperationName,
  transitionPersistentQueueTicket,
  transitionPersistentQueueTicketWithAudit,
} from "../lib/persistence.js";
import { buildVerifiedOnboardingChecklist } from "../lib/onboarding-status.js";

type SendableChannel = {
  send: (options: MessageCreateOptions) => Promise<unknown>;
};

export async function handleChatInput(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: "PipHackLup works inside hackathon servers.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const commandRateLimit = checkBotRateLimit(
    botRateLimitKey([
      "command",
      interaction.guildId,
      interaction.user.id,
      interaction.commandName,
    ]),
    botRateLimitPolicies.command,
  );
  if (!commandRateLimit.allowed) {
    await interaction.reply({
      content: `Slow down a bit. Try that command again in ${commandRateLimit.retryAfterSeconds}s.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (isMutationCommand(interaction.commandName)) {
    const mutationRateLimit = checkBotRateLimit(
      botRateLimitKey([
        "mutation",
        interaction.guildId,
        interaction.user.id,
        interaction.commandName,
      ]),
      botRateLimitPolicies.mutationCommand,
    );
    if (!mutationRateLimit.allowed) {
      await interaction.reply({
        content: `That action is rate limited. Try again in ${mutationRateLimit.retryAfterSeconds}s.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  switch (interaction.commandName) {
    case "ask":
      await handleAsk(interaction);
      return;
    case "train":
      await handleTrain(interaction);
      return;
    case "setup":
      await handleSetup(interaction);
      return;
    case "onboard":
      await handleOnboard(interaction);
      return;
    case "queue":
      await handleQueue(interaction);
      return;
    case "team":
      await handleTeam(interaction);
      return;
    case "mod":
      await handleMod(interaction);
      return;
    default:
      await interaction.reply({
        content: "Unknown command.",
        flags: MessageFlags.Ephemeral,
      });
  }
}

async function handleAsk(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guildId = interaction.guildId!;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let settings: KnowledgeAssistantSettings;
  let entries: HackathonKnowledgeEntry[];
  try {
    [settings, entries] = await Promise.all([
      getTrainingSettings(guildId),
      listTrainingEntries(guildId),
    ]);
  } catch (error) {
    logPersistenceFailure(guildId, "load Q&A knowledge", error);
    await interaction.editReply({
      content: `I could not ${persistenceOperationName(error)}, so I cannot give a reliable staff-trained answer right now.`,
    });
    return;
  }

  const question = interaction.options.getString("question", true);
  const result = answerHackathonQuestion(question, entries, settings);
  const privateReply =
    interaction.options.getBoolean("private") ?? !settings.publicAnswers;
  const embed = buildKnowledgeAnswerEmbed(result);

  if (privateReply) {
    await interaction.editReply({ embeds: [embed] });
  } else {
    await interaction.editReply({
      content: "Posting this answer publicly…",
    });
    try {
      await interaction.followUp({ embeds: [embed] });
    } catch {
      await interaction.editReply({
        content:
          "Discord rejected the public answer, so nothing was posted publicly. Try again with `private:true` or tell an organizer.",
      });
      return;
    }
    await interaction.deleteReply().catch(() => null);
  }

  if (result.shouldEscalate) {
    await sendKnowledgeEscalation(interaction, result, settings, privateReply);
  }
}

async function handleTrain(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!hasManageGuildPermission(interaction.memberPermissions)) {
    await interaction.reply({
      content: "You need Manage Server to train PipHackLup.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;
  const guildName = interaction.guild?.name ?? "Hackathon";

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (subcommand === "add") {
    const input: CreateKnowledgeEntryInput = {
      guildId,
      title: interaction.options.getString("title", true),
      answer: interaction.options.getString("answer", true),
      tags: splitList(interaction.options.getString("keywords") ?? ""),
      escalationTarget: (interaction.options.getString("escalate") ??
        "none") as KnowledgeEscalationTarget,
      createdBy: interaction.user.id,
    };
    try {
      assertKnowledgeTrainingIsSafe(input);
    } catch (error) {
      if (await editKnowledgeSafetyError(interaction, error)) return;
      throw error;
    }

    let entry;
    try {
      entry = await addTrainingEntry(input, guildName);
    } catch (error) {
      logPersistenceFailure(guildId, "save training entry", error);
      await interaction.editReply({
        content: `No training entry was created because PipHackLup could not ${persistenceOperationName(error)}.`,
      });
      return;
    }

    const auditWarning = await recordTrainingAudit({
      guildId,
      actorId: interaction.user.id,
      action: "train.add",
      targetType: "knowledge",
      targetId: entry.id,
      metadata: { title: entry.title },
    });
    await interaction.editReply({
      content: `Trained PipHackLup on **${entry.title}** as \`${entry.id}\`.${auditWarning}`,
    });
    return;
  }

  if (subcommand === "import") {
    const defaultEscalation = (interaction.options.getString(
      "default_escalation",
    ) ?? "none") as KnowledgeEscalationTarget;
    const parsed = parseKnowledgeImportText(
      interaction.options.getString("details", true),
      defaultEscalation,
    );
    if (parsed.length > 25) {
      await interaction.editReply({
        content: `That import contains **${parsed.length}** valid entries. The limit is **25** per command, so nothing was saved. Split it into smaller imports and try again.`,
      });
      return;
    }
    try {
      for (const entry of parsed) {
        assertKnowledgeTrainingIsSafe(entry);
      }
    } catch (error) {
      if (await editKnowledgeSafetyError(interaction, error)) return;
      throw error;
    }

    if (parsed.length === 0) {
      await interaction.editReply({
        content: "I could not find any importable training lines.",
      });
      return;
    }

    let entries: HackathonKnowledgeEntry[];
    try {
      entries = await addTrainingEntries(
        parsed.map((entry) => ({
          guildId,
          title: entry.title,
          answer: entry.answer,
          tags: entry.tags,
          escalationTarget: entry.escalationTarget,
          createdBy: interaction.user.id,
        })),
        guildName,
      );
    } catch (error) {
      logPersistenceFailure(guildId, "save training import", error);
      await interaction.editReply({
        content: `No training entries were imported because PipHackLup could not ${persistenceOperationName(error)}. The bulk write is atomic; retrying cannot duplicate a partial import from this request.`,
      });
      return;
    }

    const auditWarning = await recordTrainingAudit({
      guildId,
      actorId: interaction.user.id,
      action: "train.import",
      targetType: "knowledge",
      targetId: entries[0]!.id,
      metadata: { count: entries.length },
    });
    await interaction.editReply({
      content: `Imported **${entries.length}** training entries: ${entries.map((entry) => `\`${entry.id}\``).join(", ")}.${auditWarning}`,
    });
    return;
  }

  if (subcommand === "settings") {
    const staffRole = interaction.options.getRole("staff_role");
    const mentorRole = interaction.options.getRole("mentor_role");
    const helpChannel = interaction.options.getChannel("help_channel");
    const confidence = interaction.options.getInteger("confidence");
    const publicAnswers = interaction.options.getBoolean("public_answers");

    const patch = {
      ...(staffRole ? { staffRoleId: staffRole.id } : {}),
      ...(mentorRole ? { mentorRoleId: mentorRole.id } : {}),
      ...(helpChannel ? { helpChannelId: helpChannel.id } : {}),
      ...(confidence !== null ? { minConfidence: confidence } : {}),
      ...(publicAnswers !== null ? { publicAnswers } : {}),
    };
    let settings;
    try {
      settings = await saveTrainingSettings(guildId, guildName, patch);
    } catch (error) {
      logPersistenceFailure(guildId, "save Q&A settings", error);
      await interaction.editReply({
        content: `The Q&A settings were not changed because PipHackLup could not ${persistenceOperationName(error)}.`,
      });
      return;
    }

    const auditWarning = await recordTrainingAudit({
      guildId,
      actorId: interaction.user.id,
      action: "train.settings",
      targetType: "settings",
      targetId: guildId,
      metadata: { fieldsChanged: Object.keys(patch).sort().join(",") },
    });
    await interaction.editReply({
      content: `${buildKnowledgeSettingsSummary(settings)}${auditWarning}`,
    });
    return;
  }

  if (subcommand === "list") {
    let entries;
    try {
      entries = (await listTrainingEntries(guildId)).toSorted((left, right) =>
        left.title.localeCompare(right.title),
      );
    } catch (error) {
      logPersistenceFailure(guildId, "load training entries", error);
      await interaction.editReply({
        content: `I could not ${persistenceOperationName(error)}, so I cannot show a reliable training list right now.`,
      });
      return;
    }
    const lines = entries
      .slice(0, 20)
      .map(
        (entry) =>
          `\`${entry.id}\` **${entry.title}** (${entry.tags.join(", ") || "no keywords"}, ${entry.escalationTarget})`,
      );

    await interaction.editReply({
      content: lines.length
        ? lines.join("\n")
        : "No training entries yet. Use `/train add` or `/train import`.",
    });
    return;
  }

  const entryId = interaction.options.getString("entry", true);
  let deleted;
  try {
    deleted = await removeTrainingEntry(guildId, entryId);
  } catch (error) {
    logPersistenceFailure(guildId, "remove training entry", error);
    await interaction.editReply({
      content: `The training entry was not removed because PipHackLup could not ${persistenceOperationName(error)}.`,
    });
    return;
  }
  if (!deleted) {
    await interaction.editReply({
      content: `I could not find training entry \`${entryId}\`.`,
    });
    return;
  }

  const auditWarning = await recordTrainingAudit({
    guildId,
    actorId: interaction.user.id,
    action: "train.remove",
    targetType: "knowledge",
    targetId: entryId,
    metadata: {},
  });
  await interaction.editReply({
    content: `Removed training entry \`${entryId}\`.${auditWarning}`,
  });
}

async function handleSetup(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!hasManageGuildPermission(interaction.memberPermissions)) {
    await interaction.reply({
      content: "You need Manage Server to configure PipHackLup.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      content:
        "I could not access this server, so I did not create any setup resources.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guildId = interaction.guildId!;
  const eventName =
    interaction.options.getString("event") ?? guild.name ?? "Hackathon";
  const onboarding: OnboardingMode =
    interaction.options.getString("onboarding") === "gated"
      ? "gated"
      : "guided";

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guildIdentity = guildIdentityForInteraction(interaction, eventName);
  let currentConfig;
  try {
    currentConfig = await loadPersistentGuildConfig(guildIdentity);
  } catch (error) {
    logPersistenceFailure(guildId, "load setup configuration", error);
    await interaction.editReply({
      content: `Setup did not start because PipHackLup could not ${persistenceOperationName(error)}. No Discord resources were changed. Check the database connection, then rerun \`/setup\`.`,
      embeds: [],
      components: [],
    });
    return;
  }

  const result = await provisionHackathonGuild({
    guild,
    setupActorId: interaction.user.id,
    currentConfig,
    eventName,
    onboardingMode: onboarding,
  }).catch(async () => {
    console.error(`PipHackLup setup failed unexpectedly in guild ${guildId}.`);
    await interaction.editReply({
      content:
        "Setup stopped unexpectedly, and I did not mark it complete. Discord may have accepted an earlier step; rerun `/setup` to safely reuse anything already created and receive a fresh report.",
      embeds: [],
      components: [],
    });
    return null;
  });
  if (!result) return;

  const config = mergeProvisionedConfig(currentConfig, result);
  const persistenceOperations: SetupOperation[] = [];
  let configPersisted = false;
  if (result.blockedBeforeChanges) {
    persistenceOperations.push({
      key: "database-config",
      kind: "persistence",
      name: "Durable setup configuration",
      status: "skipped",
      detail:
        "Setup was blocked before Discord changes began, so the existing durable configuration was left untouched.",
    });
    persistenceOperations.push({
      key: "database-audit",
      kind: "persistence",
      name: "Privileged setup audit event",
      status: "skipped",
      detail:
        "Skipped because setup was blocked before any Discord or configuration mutation.",
    });
  } else {
    try {
      await persistGuildConfig(guildIdentity, config);
      configPersisted = true;
      persistenceOperations.push({
        key: "database-config",
        kind: "persistence",
        name: "Durable setup configuration",
        status: "updated",
        detail:
          "Saved the provisioned Discord role, channel, category, and panel identifiers.",
      });
    } catch (error) {
      logPersistenceFailure(guildId, "save setup configuration", error);
      persistenceOperations.push({
        key: "database-config",
        kind: "persistence",
        name: "Durable setup configuration",
        status: "failed",
        detail:
          "Discord resources may exist, but their identifiers were not saved. Fix the database connection and rerun /setup; existing named resources will be reused.",
      });
    }

    if (configPersisted) {
      try {
        await persistAuditEvent({
          guildId,
          actorId: interaction.user.id,
          action: "bot.setup",
          targetType: "settings",
          targetId: guildId,
          metadata: {
            eventName: config.eventName,
            onboardingMode: config.onboardingMode,
            created: result.operations.filter(
              (operation) => operation.status === "created",
            ).length,
            reusedOrUpdated: result.operations.filter(
              (operation) =>
                operation.status === "reused" || operation.status === "updated",
            ).length,
            incomplete: hasIncompleteSetup(result.operations),
          },
        });
        persistenceOperations.push({
          key: "database-audit",
          kind: "persistence",
          name: "Privileged setup audit event",
          status: "created",
        });
      } catch (error) {
        logPersistenceFailure(guildId, "record setup audit", error);
        persistenceOperations.push({
          key: "database-audit",
          kind: "persistence",
          name: "Privileged setup audit event",
          status: "failed",
          detail:
            "The setup configuration was saved, but its privileged audit event was not recorded.",
        });
      }
    } else {
      persistenceOperations.push({
        key: "database-audit",
        kind: "persistence",
        name: "Privileged setup audit event",
        status: "skipped",
        detail:
          "Skipped because the setup configuration could not be saved first.",
      });
    }
  }

  const operations = [...result.operations, ...persistenceOperations];

  const automod = defaultAutoModTemplates()
    .map((rule) => `• **${rule.name}**: ${rule.goal}`)
    .join("\n");
  const incomplete = hasIncompleteSetup(operations);
  const createdCount = operations.filter(
    (operation) => operation.status === "created",
  ).length;
  const reusedCount = operations.filter(
    (operation) =>
      operation.status === "reused" || operation.status === "updated",
  ).length;
  const embed = new EmbedBuilder()
    .setTitle(
      incomplete
        ? createdCount + reusedCount > 0
          ? "PipHackLup setup partially completed"
          : "PipHackLup setup could not start"
        : "PipHackLup setup is ready",
    )
    .setDescription(
      [
        `Event: **${config.eventName}** · onboarding: **${config.onboardingMode}**.`,
        incomplete
          ? "Some Discord work failed or was skipped. The report below distinguishes every created, reused, refreshed, and unavailable resource. Rerun `/setup` after fixing the listed issue; existing PipHackLup resources will be reused."
          : "Roles, channels, and the three event panels were created or safely reused without adding duplicates.",
      ].join("\n\n"),
    )
    .addFields(...buildSetupReportSections(operations), {
      name: "Recommended next step · not provisioned",
      value: `Review and enable the suggested Discord AutoMod rules manually:\n${automod.slice(0, 850)}`,
    })
    .setColor(incomplete ? 0xf59e0b : 0x2f8fd8);

  await interaction.editReply({
    embeds: [embed],
    components: [buildPanelActionRow()],
  });
}

function buildKnowledgeAnswerEmbed(
  result: KnowledgeAnswerResult,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(
      result.shouldEscalate
        ? "PipHackLup answer + human follow-up"
        : "PipHackLup answer",
    )
    .setDescription(truncate(result.answer, 4000))
    .addFields(
      {
        name: "Question",
        value: truncate(result.question, 500),
      },
      {
        name: "Confidence",
        value: `${result.confidence}%`,
      },
    )
    .setColor(result.shouldEscalate ? 0xf59e0b : 0x2f8fd8);

  if (result.matchedEntry) {
    embed.addFields({
      name: "Source",
      value: `Staff training: **${truncate(result.matchedEntry.title, 120)}** (\`${result.matchedEntry.id}\`)`,
    });
  }

  if (result.shouldEscalate) {
    embed.addFields({
      name: "Human follow-up",
      value: `${result.escalationTarget === "mentor" ? "Mentor" : "Staff"} ping requested. ${result.escalationReason}`,
    });
  }

  return embed;
}

async function sendKnowledgeEscalation(
  interaction: ChatInputCommandInteraction,
  result: KnowledgeAnswerResult,
  settings: KnowledgeAssistantSettings,
  privateReply: boolean,
): Promise<void> {
  const guildId = interaction.guildId!;
  const guildIdentity = guildIdentityForInteraction(interaction);
  let config;
  try {
    config = await loadPersistentGuildConfig(guildIdentity);
  } catch (error) {
    logPersistenceFailure(guildId, "load Q&A escalation config", error);
    await interaction.followUp({
      content: `I could not ${persistenceOperationName(error)}, so I did not claim that a durable staff ticket was opened. Please use \`/queue open\` or tell an organizer.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const escalationTarget =
    result.escalationTarget === "mentor" ? "mentor" : "staff";
  const roleId =
    escalationTarget === "mentor"
      ? (settings.mentorRoleId ?? config.roles.mentor)
      : (settings.staffRoleId ??
        config.roles.organizer ??
        config.roles.moderator);
  const requiresStaffPrivateChannel =
    privateReply || escalationTarget === "staff";
  const channel = requiresStaffPrivateChannel
    ? interaction.guild
      ? await fetchVerifiedStaffPrivateChannel({
          guild: interaction.guild,
          channelId: config.channels.moderationLog,
          configuredStaffRoleIds: [
            config.roles.organizer,
            config.roles.moderator,
            settings.staffRoleId,
          ],
        })
      : null
    : await resolveEscalationChannel(interaction, settings.helpChannelId);
  const ticket = createQueueTicket({
    guildId,
    kind: escalationTarget === "mentor" ? "mentor" : "staff",
    requesterId: interaction.user.id,
    topic: `Q&A escalation: ${result.question.slice(0, 56)}`,
    description: result.question,
    priority: escalationTarget === "mentor" ? 2 : 3,
  });
  try {
    await persistQueueTicket(guildIdentity, ticket);
  } catch (error) {
    logPersistenceFailure(guildId, "save Q&A escalation ticket", error);
    await interaction.followUp({
      content: `I could not ${persistenceOperationName(error)}, so no durable follow-up ticket was opened. Please use \`/queue open\` or tell an organizer.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!channel) {
    await interaction.followUp({
      content: requiresStaffPrivateChannel
        ? `I opened durable staff follow-up ticket \`${ticket.id}\`, but no verified staff-private channel was available. I did not post your question or identity anywhere else. Ask an organizer to rerun \`/setup\` and review the ticket with \`/queue status\`.`
        : `I opened staff follow-up ticket \`${ticket.id}\`, but I could not find a text channel to ping. Set one with \`/train settings help_channel:#channel\`.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const roleMention = roleId
    ? `<@&${roleId}>`
    : escalationTarget === "mentor"
      ? "Mentors"
      : "Staff";
  const embed = new EmbedBuilder()
    .setTitle(`PipHackLup Q&A escalation (${ticket.id})`)
    .setDescription(
      requiresStaffPrivateChannel
        ? truncate(result.question, 1000)
        : "A participant requested human follow-up. The question and identity were kept out of this public notification; authorized staff can review the durable ticket.",
    )
    .setColor(0xf59e0b);
  if (requiresStaffPrivateChannel) {
    embed.addFields(
      {
        name: "Participant",
        value: `<@${interaction.user.id}>`,
      },
      {
        name: "Bot answer",
        value: truncate(result.answer, 1000),
      },
      {
        name: "Reason",
        value: result.escalationReason,
      },
    );
  }

  try {
    await channel.send({
      content: `${roleMention} PipHackLup needs a human answer for this participant question.`,
      embeds: [embed],
      allowedMentions: roleId
        ? {
            roles: [roleId],
            users: requiresStaffPrivateChannel ? [interaction.user.id] : [],
          }
        : {
            users: requiresStaffPrivateChannel ? [interaction.user.id] : [],
            roles: [],
          },
    });
  } catch {
    await interaction.followUp({
      content: `I opened durable follow-up ticket \`${ticket.id}\`, but Discord rejected the staff-channel notification. An organizer can still find the ticket with \`/queue status\`.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function resolveEscalationChannel(
  interaction: ChatInputCommandInteraction,
  helpChannelId?: string,
): Promise<SendableChannel | null> {
  if (helpChannelId) {
    const configured = await interaction.guild?.channels
      .fetch(helpChannelId)
      .catch(() => null);
    if (isSendableChannel(configured)) return configured;
  }

  return isSendableChannel(interaction.channel) ? interaction.channel : null;
}

function buildKnowledgeSettingsSummary(
  settings: KnowledgeAssistantSettings,
): string {
  return [
    "PipHackLup Q&A settings saved.",
    `Public answers: **${settings.publicAnswers ? "on" : "off"}**`,
    `Minimum confidence: **${settings.minConfidence}%**`,
    `Staff role: ${settings.staffRoleId ? `<@&${settings.staffRoleId}>` : "**not set**"}`,
    `Mentor role: ${settings.mentorRoleId ? `<@&${settings.mentorRoleId}>` : "**not set**"}`,
    `Public mentor help channel: ${settings.helpChannelId ? `<#${settings.helpChannelId}>` : "**current channel fallback**"}`,
  ].join("\n");
}

async function editKnowledgeSafetyError(
  interaction: ChatInputCommandInteraction,
  error: unknown,
): Promise<boolean> {
  if (!(error instanceof KnowledgeSafetyError)) return false;

  await interaction.editReply({
    content: [
      "I blocked that training entry because it looks like prompt-injection content.",
      ...error.findings.map(
        (finding) => `- ${finding.code}: ${finding.message}`,
      ),
    ].join("\n"),
  });
  return true;
}

async function recordTrainingAudit(
  event: Parameters<typeof persistAuditEvent>[0],
): Promise<string> {
  try {
    await persistAuditEvent(event);
    return "";
  } catch (error) {
    logPersistenceFailure(event.guildId, "record training audit", error);
    return `\n\nThe change was saved, but PipHackLup could not ${persistenceOperationName(error)}. Tell an organizer so the missing audit event can be investigated.`;
  }
}

async function handleOnboard(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;
  const guildIdentity = guildIdentityForInteraction(interaction);

  if (subcommand === "nickname") {
    const name = interaction.options.getString("name", true);
    const member =
      interaction.member instanceof GuildMember ? interaction.member : null;
    if (!member) {
      await interaction.reply({
        content: "I could not read your member record.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await member.setNickname(name, "PipHackLup onboarding nickname update");
      await interaction.editReply({
        content: `Nickname updated to **${name}**.`,
      });
    } catch {
      await interaction.editReply({
        content:
          "I could not update your nickname. Ask an organizer to move my role above participant roles and grant Manage Nicknames.",
      });
    }
    return;
  }

  if (subcommand === "profile") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const skills = splitList(interaction.options.getString("skills", true));
    const interests = splitList(
      interaction.options.getString("interests") ?? "",
    );
    const timezone = interaction.options.getString("timezone") ?? undefined;
    const profile = buildMemberProfile(
      withOptionalTimezone(
        {
          userId: interaction.user.id,
          displayName:
            interaction.member instanceof GuildMember
              ? interaction.member.displayName
              : interaction.user.username,
          skills,
          interests,
          beginnerFriendly: true,
          lookingForTeam: true,
        },
        timezone,
      ),
    );

    try {
      await persistMemberProfile(guildIdentity, profile);
      await interaction.editReply({
        content: `Profile saved with skills: **${skills.join(", ") || "none"}**. You are now in the team matching pool.`,
      });
    } catch (error) {
      logPersistenceFailure(guildId, "save onboarding profile", error);
      await interaction.editReply({
        content: `Your profile was not saved because PipHackLup could not ${persistenceOperationName(error)}. Please try again after an organizer checks the database.`,
      });
    }
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let snapshot;
  try {
    snapshot = await hydrateGuildOperationalState(guildId);
  } catch (error) {
    logPersistenceFailure(guildId, "load onboarding checklist", error);
    await interaction.editReply({
      content: `I could not ${persistenceOperationName(error)}, so I cannot show a reliable checklist right now.`,
    });
    return;
  }

  let config = snapshot.config;
  if (!config) {
    try {
      config = await loadPersistentGuildConfig(guildIdentity);
    } catch (error) {
      logPersistenceFailure(guildId, "initialize onboarding config", error);
      await interaction.editReply({
        content: `I could not ${persistenceOperationName(error)}, so I cannot show a reliable checklist right now.`,
      });
      return;
    }
  }

  const member =
    interaction.member instanceof GuildMember ? interaction.member : null;
  const checklist = buildVerifiedOnboardingChecklist(config, {
    hasNickname: member?.nickname !== null && member !== null,
    participantRoleIds: member?.roles.cache.keys() ?? [],
    hasProfile: snapshot.profiles.some(
      (profile) => profile.userId === interaction.user.id,
    ),
    hasTeam: snapshot.teams.some(
      (team) =>
        team.guildId === guildId &&
        team.memberIds.includes(interaction.user.id),
    ),
  });
  const embed = new EmbedBuilder()
    .setTitle("Your PipHackLup checklist")
    .setDescription(checklist.summary)
    .addFields(
      checklist.steps.map((step) => ({
        name: `${step.complete ? "Done" : step.required ? "Required" : "Todo"}: ${step.label}`,
        value: step.actionHint,
      })),
    )
    .setColor(0x6ec6ff);

  await interaction.editReply({ embeds: [embed] });
}

async function handleQueue(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;
  const guildIdentity = guildIdentityForInteraction(interaction);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (subcommand === "open") {
    const ticket = createQueueTicket({
      guildId,
      kind: interaction.options.getString("kind", true) as QueueKind,
      requesterId: interaction.user.id,
      topic: interaction.options.getString("topic", true),
      description: interaction.options.getString("description", true),
      priority: (interaction.options.getInteger("priority") ?? 1) as
        | 0
        | 1
        | 2
        | 3,
    });
    try {
      await persistQueueTicket(guildIdentity, ticket);
      await interaction.editReply({
        content: `Opened **${ticket.kind}** ticket \`${ticket.id}\`: **${ticket.topic}**.`,
      });
    } catch (error) {
      logPersistenceFailure(guildId, "open queue ticket", error);
      await interaction.editReply({
        content: `The ticket was not opened because PipHackLup could not ${persistenceOperationName(error)}. Please try again after an organizer checks the database.`,
      });
    }
    return;
  }

  if (subcommand === "status") {
    let tickets;
    try {
      tickets = await listPersistentQueueTickets(guildId);
    } catch (error) {
      logPersistenceFailure(guildId, "load queue status", error);
      await interaction.editReply({
        content: `I could not ${persistenceOperationName(error)}, so I cannot show a reliable queue right now.`,
      });
      return;
    }
    const ordered = orderQueue(tickets);
    const memberRoles =
      interaction.member instanceof GuildMember
        ? interaction.member.roles.cache
        : (interaction.member?.roles ?? []);
    let queueAuthorization = resolveQueueWorkerAuthorization({
      permissions: interaction.memberPermissions,
      roles: memberRoles,
    });
    if (!queueAuthorization.fullStaff) {
      try {
        const [config, settings] = await Promise.all([
          loadPersistentGuildConfig(guildIdentity),
          getTrainingSettings(guildId),
        ]);
        queueAuthorization = resolveQueueWorkerAuthorization({
          permissions: interaction.memberPermissions,
          roles: memberRoles,
          fullStaffRoleIds: [
            config.roles.organizer,
            config.roles.moderator,
            settings.staffRoleId,
          ],
          mentorRoleIds: [config.roles.mentor, settings.mentorRoleId],
        });
      } catch (error) {
        logPersistenceFailure(
          guildId,
          "load queue status authorization",
          error,
        );
        // Fail closed to requester-only visibility if configured worker roles
        // cannot be verified from durable state.
      }
    }
    const visibleTickets = ordered.filter((ticket) =>
      canViewQueueTicket({
        actorId: interaction.user.id,
        requesterId: ticket.requesterId,
        kind: ticket.kind,
        ...queueAuthorization,
      }),
    );
    const lines = visibleTickets
      .slice(0, 10)
      .map(
        (ticket, index) =>
          `${index + 1}. \`${ticket.id}\` **${ticket.kind}** ${ticket.topic}`,
      );
    await interaction.editReply({
      content: lines.length
        ? lines.join("\n")
        : queueAuthorization.fullStaff
          ? "No open queue tickets right now."
          : "No queue tickets are visible to you. Authorized staff can view the full queue.",
    });
    return;
  }

  const ticketId = interaction.options.getString("ticket", true);
  let ticket;
  try {
    ticket = await loadPersistentQueueTicket(guildId, ticketId);
  } catch (error) {
    logPersistenceFailure(guildId, "load queue ticket", error);
    await interaction.editReply({
      content: `I could not ${persistenceOperationName(error)}, so no ticket action was applied.`,
    });
    return;
  }
  if (!ticket || ticket.guildId !== guildId) {
    await interaction.editReply({
      content: `Ticket \`${ticketId}\` was not found.`,
    });
    return;
  }

  let config;
  let settings;
  try {
    [config, settings] = await Promise.all([
      loadPersistentGuildConfig(guildIdentity),
      getTrainingSettings(guildId),
    ]);
  } catch (error) {
    logPersistenceFailure(guildId, "load queue authorization sources", error);
    await interaction.editReply({
      content: `I could not ${persistenceOperationName(error)}, so no ticket action was applied.`,
    });
    return;
  }
  const roles =
    interaction.member instanceof GuildMember
      ? interaction.member.roles.cache
      : (interaction.member?.roles ?? []);
  const queueAuthorization = resolveQueueWorkerAuthorization({
    permissions: interaction.memberPermissions,
    roles,
    fullStaffRoleIds: [
      config.roles.organizer,
      config.roles.moderator,
      settings.staffRoleId,
    ],
    mentorRoleIds: [config.roles.mentor, settings.mentorRoleId],
  });

  const workerAuthorized = canManageQueueTicket({
    kind: ticket.kind,
    ...queueAuthorization,
  });
  if (
    (subcommand === "claim" || subcommand === "escalate") &&
    !workerAuthorized
  ) {
    await interaction.editReply({
      content:
        "You are not authorized to manage that ticket. Staff can manage every queue; configured mentors can manage non-staff tickets.",
    });
    return;
  }

  if (
    subcommand === "close" &&
    !canCloseQueueTicketWithWorkerAccess({
      actorId: interaction.user.id,
      requesterId: ticket.requesterId,
      kind: ticket.kind,
      ...queueAuthorization,
    })
  ) {
    await interaction.editReply({
      content:
        "Only the ticket requester or an authorized queue worker can close it.",
    });
    return;
  }

  let next;
  try {
    next =
      subcommand === "claim"
        ? claimTicket(ticket, interaction.user.id)
        : subcommand === "escalate"
          ? escalateTicket(ticket)
          : closeTicket(ticket);
  } catch {
    await interaction.editReply({
      content:
        "That ticket transition is not valid from its current state. Run `/queue status` and try again from the latest state.",
    });
    return;
  }

  const privilegedAction =
    subcommand === "claim" ||
    subcommand === "escalate" ||
    (subcommand === "close" && workerAuthorized);
  let transitioned;
  try {
    transitioned = privilegedAction
      ? await transitionPersistentQueueTicketWithAudit(guildId, ticket, next, {
          guildId,
          actorId: interaction.user.id,
          action: `queue.${subcommand}`,
          targetType: "ticket",
          targetId: next.id,
          metadata: {
            previousStatus: ticket.status,
            status: next.status,
            kind: next.kind,
          },
        })
      : await transitionPersistentQueueTicket(guildId, ticket, next);
  } catch (error) {
    logPersistenceFailure(guildId, "save queue transition", error);
    await interaction.editReply({
      content: `Ticket \`${ticket.id}\` was not changed because PipHackLup could not ${persistenceOperationName(error)}.`,
    });
    return;
  }

  if (!transitioned) {
    await interaction.editReply({
      content: `Ticket \`${ticket.id}\` changed before your action could be applied. Nothing from this request was saved; run \`/queue status\` and try again from the latest state.`,
    });
    return;
  }

  await interaction.editReply({
    content: `Ticket \`${transitioned.id}\` is now **${transitioned.status}**.`,
  });
}

async function handleTeam(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;
  const guildIdentity = guildIdentityForInteraction(interaction);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (subcommand === "profile") {
    const skills = splitList(interaction.options.getString("skills", true));
    const interests = splitList(
      interaction.options.getString("interests") ?? "",
    );
    const profile = buildMemberProfile({
      userId: interaction.user.id,
      displayName:
        interaction.member instanceof GuildMember
          ? interaction.member.displayName
          : interaction.user.username,
      skills,
      interests,
      beginnerFriendly: true,
      lookingForTeam: true,
    });
    try {
      await persistMemberProfile(guildIdentity, profile);
      await interaction.editReply({
        content: "You are now marked as looking for a team.",
      });
    } catch (error) {
      logPersistenceFailure(guildId, "save team profile", error);
      await interaction.editReply({
        content: `Your team profile was not saved because PipHackLup could not ${persistenceOperationName(error)}.`,
      });
    }
    return;
  }

  if (subcommand === "create") {
    let snapshot;
    try {
      snapshot = await hydrateGuildOperationalState(guildId);
    } catch (error) {
      logPersistenceFailure(guildId, "load team state", error);
      await interaction.editReply({
        content: `The team was not created because PipHackLup could not ${persistenceOperationName(error)}.`,
      });
      return;
    }

    let profile = snapshot.profiles.find(
      (candidate) => candidate.userId === interaction.user.id,
    );
    let profileCreated = false;
    if (!profile) {
      const defaultProfile = buildMemberProfile({
        userId: interaction.user.id,
        displayName:
          interaction.member instanceof GuildMember
            ? interaction.member.displayName
            : interaction.user.username,
        skills: [],
        interests: [],
        beginnerFriendly: true,
        lookingForTeam: false,
      });
      try {
        profile = await persistMemberProfile(guildIdentity, defaultProfile);
        profileCreated = true;
      } catch (error) {
        logPersistenceFailure(guildId, "save team owner profile", error);
        await interaction.editReply({
          content: `The team was not created because PipHackLup could not ${persistenceOperationName(error)} for its owner profile.`,
        });
        return;
      }
    }

    const team = createTeam({
      guildId,
      owner: profile,
      name: interaction.options.getString("name", true),
      desiredSkills: splitList(interaction.options.getString("skills") ?? ""),
      ...optionalProjectIdea(
        interaction.options.getString("idea") ?? undefined,
      ),
    });

    try {
      await persistTeam(guildIdentity, team);
      await interaction.editReply({
        content: `Created recruiting team **${team.name}** (\`${team.id}\`).`,
      });
    } catch (error) {
      logPersistenceFailure(guildId, "save team", error);
      await interaction.editReply({
        content: `${profileCreated ? "Your owner profile was saved, but the team was not created" : "The team was not created"} because PipHackLup could not ${persistenceOperationName(error)}. The team and membership write is atomic, so you can safely retry.`,
      });
    }
    return;
  }

  if (!hasManageGuildPermission(interaction.memberPermissions)) {
    await interaction.editReply({
      content: "You need Manage Server to run team matching suggestions.",
    });
    return;
  }

  let snapshot;
  try {
    snapshot = await hydrateGuildOperationalState(guildId);
  } catch (error) {
    logPersistenceFailure(guildId, "load team matching state", error);
    await interaction.editReply({
      content: `I could not ${persistenceOperationName(error)}, so I cannot produce reliable team matches right now.`,
    });
    return;
  }

  const matches = suggestTeamMatches(snapshot.profiles, snapshot.teams, 5);
  const lines = matches.map(
    (match) =>
      `Team \`${match.teamId}\`: add ${match.addedMemberIds.map((id) => `<@${id}>`).join(", ")} (score ${match.score})`,
  );
  await interaction.editReply({
    content: lines.length
      ? lines.join("\n")
      : "No strong team matches yet. Ask participants to run `/team profile`.",
  });
}

async function handleMod(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;
  const guildIdentity = guildIdentityForInteraction(interaction);
  const user = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason", true);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (subcommand === "report") {
    const moderationCase = createModerationCase({
      guildId,
      targetUserId: user.id,
      action: "report",
      reason,
      reporterId: interaction.user.id,
      ...optionalEvidence(
        interaction.options.getString("evidence") ?? undefined,
      ),
    });
    try {
      await persistModerationCase(guildIdentity, moderationCase);
      await interaction.editReply({
        content: `Report received as case \`${moderationCase.id}\`. Staff can review it in the moderation queue.`,
      });
    } catch (error) {
      logPersistenceFailure(guildId, "save moderation report", error);
      await interaction.editReply({
        content: `Your report was not recorded because PipHackLup could not ${persistenceOperationName(error)}. Please contact an organizer directly.`,
      });
    }
    return;
  }

  if (
    !interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)
  ) {
    await interaction.editReply({
      content: "You need Moderate Members to run that action.",
    });
    return;
  }

  if (subcommand === "timeout") {
    const minutes = interaction.options.getInteger("minutes", true);
    if (!interaction.guild) {
      await interaction.editReply({
        content: "I could not access this server, so no timeout was applied.",
      });
      return;
    }

    try {
      const member = await interaction.guild.members.fetch(user.id);
      await member.timeout(minutes * 60_000, reason);
    } catch {
      console.error(
        `PipHackLup Discord timeout action failed for member ${user.id} in guild ${guildId}.`,
      );
      await interaction.editReply({
        content:
          "I could not apply that Discord timeout. Check my Moderate Members permission and role position. No timeout case was recorded.",
      });
      return;
    }

    const moderationCase = createModerationCase({
      guildId,
      targetUserId: user.id,
      action: "timeout",
      reason,
      moderatorId: interaction.user.id,
    });
    try {
      await persistModerationCaseWithAudit(guildIdentity, moderationCase, {
        guildId,
        actorId: interaction.user.id,
        action: "mod.timeout",
        targetType: "case",
        targetId: moderationCase.id,
        metadata: { targetUserId: user.id, minutes },
      });
    } catch (error) {
      logPersistenceFailure(guildId, "save and audit timeout case", error);
      await interaction.editReply({
        content: `Discord timed out <@${user.id}>, but PipHackLup could not ${persistenceOperationName(error)}. The timeout is active and the moderation case/audit record is missing; tell an organizer immediately.`,
      });
      return;
    }

    await interaction.editReply({
      content: `Timed out <@${user.id}> and created case \`${moderationCase.id}\`.`,
    });
    return;
  }

  const moderationCase = createModerationCase({
    guildId,
    targetUserId: user.id,
    action: "warn",
    reason,
    moderatorId: interaction.user.id,
  });
  try {
    await persistModerationCaseWithAudit(guildIdentity, moderationCase, {
      guildId,
      actorId: interaction.user.id,
      action: "mod.warn",
      targetType: "case",
      targetId: moderationCase.id,
      metadata: { targetUserId: user.id },
    });
  } catch (error) {
    logPersistenceFailure(guildId, "save and audit warning case", error);
    await interaction.editReply({
      content: `No warning case or audit event was created because PipHackLup could not ${persistenceOperationName(error)}.`,
    });
    return;
  }

  await interaction.editReply({
    content: `Warning case created: \`${moderationCase.id}\`.`,
  });
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function withOptionalTimezone<T extends object>(
  profile: T,
  timezone?: string,
): T & { timezone?: string } {
  return timezone ? { ...profile, timezone } : profile;
}

function optionalProjectIdea(projectIdea?: string): { projectIdea?: string } {
  return projectIdea ? { projectIdea } : {};
}

function optionalEvidence(evidenceMessageUrl?: string): {
  evidenceMessageUrl?: string;
} {
  return evidenceMessageUrl ? { evidenceMessageUrl } : {};
}

function isMutationCommand(commandName: string): boolean {
  return ["mod", "queue", "setup", "team", "train"].includes(commandName);
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, maxLength - 1)}…`;
}

function isSendableChannel(channel: unknown): channel is SendableChannel {
  return typeof (channel as { send?: unknown } | null)?.send === "function";
}

function guildIdentityForInteraction(
  interaction: ChatInputCommandInteraction,
  eventName?: string,
): GuildIdentity {
  return {
    id: interaction.guildId!,
    name: interaction.guild?.name ?? "Hackathon",
    ...(eventName ? { eventName } : {}),
  };
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
