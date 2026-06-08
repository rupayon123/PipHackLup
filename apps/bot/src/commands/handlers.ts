import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  MessageFlags,
  PermissionFlagsBits,
  type MessageCreateOptions,
} from "discord.js";
import {
  answerHackathonQuestion,
  buildOnboardingSteps,
  canAccessGatedServer,
  claimTicket,
  closeTicket,
  defaultAutoModTemplates,
  escalateTicket,
  onboardingProgress,
  orderQueue,
  parseKnowledgeImportText,
  suggestTeamMatches,
  type KnowledgeAnswerResult,
  type KnowledgeEscalationTarget,
  type KnowledgeAssistantSettings,
  type OnboardingMode,
  type QueueKind,
} from "@piphacklup/core";
import {
  createStoredCase,
  createStoredTeam,
  createStoredTicket,
  ensureConfig,
  getProfiles,
  store,
  upsertProfile,
} from "../lib/store.js";
import {
  addTrainingEntry,
  getTrainingSettings,
  listTrainingEntries,
  removeTrainingEntry,
  saveTrainingSettings,
} from "../lib/knowledge-store.js";

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
  const settings = await getTrainingSettings(guildId);
  const question = interaction.options.getString("question", true);
  const result = answerHackathonQuestion(
    question,
    await listTrainingEntries(guildId),
    settings,
  );
  const privateReply =
    interaction.options.getBoolean("private") ?? !settings.publicAnswers;
  const embed = buildKnowledgeAnswerEmbed(result);

  await interaction.reply(
    privateReply
      ? { embeds: [embed], flags: MessageFlags.Ephemeral }
      : { embeds: [embed] },
  );

  if (result.shouldEscalate) {
    await sendKnowledgeEscalation(interaction, result);
  }
}

async function handleTrain(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: "You need Manage Server to train PipHackLup.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;

  if (subcommand === "add") {
    const entry = await addTrainingEntry(
      {
        guildId,
        title: interaction.options.getString("title", true),
        answer: interaction.options.getString("answer", true),
        tags: splitList(interaction.options.getString("keywords") ?? ""),
        escalationTarget: (interaction.options.getString("escalate") ??
          "none") as KnowledgeEscalationTarget,
        createdBy: interaction.user.id,
      },
      interaction.guild?.name ?? "Hackathon",
    );

    await interaction.reply({
      content: `Trained PipHackLup on **${entry.title}** as \`${entry.id}\`.`,
      flags: MessageFlags.Ephemeral,
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
    ).slice(0, 25);
    const entries = await Promise.all(
      parsed.map((entry) =>
        addTrainingEntry(
          {
            guildId,
            title: entry.title,
            answer: entry.answer,
            tags: entry.tags,
            escalationTarget: entry.escalationTarget,
            createdBy: interaction.user.id,
          },
          interaction.guild?.name ?? "Hackathon",
        ),
      ),
    );

    await interaction.reply({
      content: entries.length
        ? `Imported **${entries.length}** training entries: ${entries.map((entry) => `\`${entry.id}\``).join(", ")}.`
        : "I could not find any importable training lines.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (subcommand === "settings") {
    const staffRole = interaction.options.getRole("staff_role");
    const mentorRole = interaction.options.getRole("mentor_role");
    const helpChannel = interaction.options.getChannel("help_channel");
    const confidence = interaction.options.getInteger("confidence");
    const publicAnswers = interaction.options.getBoolean("public_answers");

    const settings = await saveTrainingSettings(
      guildId,
      interaction.guild?.name ?? "Hackathon",
      {
        ...(staffRole ? { staffRoleId: staffRole.id } : {}),
        ...(mentorRole ? { mentorRoleId: mentorRole.id } : {}),
        ...(helpChannel ? { helpChannelId: helpChannel.id } : {}),
        ...(confidence !== null ? { minConfidence: confidence } : {}),
        ...(publicAnswers !== null ? { publicAnswers } : {}),
      },
    );

    await interaction.reply({
      content: buildKnowledgeSettingsSummary(settings),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (subcommand === "list") {
    const entries = (await listTrainingEntries(guildId)).toSorted(
      (left, right) => left.title.localeCompare(right.title),
    );
    const lines = entries
      .slice(0, 20)
      .map(
        (entry) =>
          `\`${entry.id}\` **${entry.title}** (${entry.tags.join(", ") || "no keywords"}, ${entry.escalationTarget})`,
      );

    await interaction.reply({
      content: lines.length
        ? lines.join("\n")
        : "No training entries yet. Use `/train add` or `/train import`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const entryId = interaction.options.getString("entry", true);
  const deleted = await removeTrainingEntry(guildId, entryId);
  await interaction.reply({
    content: deleted
      ? `Removed training entry \`${entryId}\`.`
      : `I could not find training entry \`${entryId}\`.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleSetup(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guildId = interaction.guildId!;
  const eventName =
    interaction.options.getString("event") ??
    interaction.guild?.name ??
    "Hackathon";
  const onboarding: OnboardingMode =
    interaction.options.getString("onboarding") === "gated"
      ? "gated"
      : "guided";
  const config = {
    ...ensureConfig(guildId, eventName),
    eventName,
    onboardingMode: onboarding,
  };
  store.configs.set(guildId, config);

  const automod = defaultAutoModTemplates()
    .map((rule) => `• **${rule.name}**: ${rule.goal}`)
    .join("\n");
  const embed = new EmbedBuilder()
    .setTitle("PipHackLup setup started")
    .setDescription(
      `Configured **${config.eventName}** in **${config.onboardingMode}** onboarding mode.`,
    )
    .addFields(
      {
        name: "Built-in queues",
        value: "Mentor help, tech help, and judging/demo queues are ready.",
      },
      {
        name: "Team rules",
        value: `Default team size is ${config.teamSizeMin}-${config.teamSizeMax}.`,
      },
      {
        name: "Recommended AutoMod",
        value: automod.slice(0, 1000),
      },
    )
    .setColor(0x2f8fd8);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("piphacklup:onboarding")
      .setLabel("Preview onboarding")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("piphacklup:queues")
      .setLabel("Queue status")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("piphacklup:teams")
      .setLabel("Team status")
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.reply({
    embeds: [embed],
    components: [row],
    flags: MessageFlags.Ephemeral,
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
): Promise<void> {
  const guildId = interaction.guildId!;
  const config = ensureConfig(guildId, interaction.guild?.name);
  const settings = await getTrainingSettings(guildId);
  const escalationTarget =
    result.escalationTarget === "mentor" ? "mentor" : "staff";
  const roleId =
    escalationTarget === "mentor"
      ? (settings.mentorRoleId ?? config.roles.mentor)
      : (settings.staffRoleId ??
        config.roles.organizer ??
        config.roles.moderator);
  const channel = await resolveEscalationChannel(
    interaction,
    settings.helpChannelId,
  );
  const ticket = createStoredTicket({
    guildId,
    kind: escalationTarget === "mentor" ? "mentor" : "staff",
    requesterId: interaction.user.id,
    topic: `Q&A escalation: ${result.question.slice(0, 56)}`,
    description: result.question,
    priority: escalationTarget === "mentor" ? 2 : 3,
  });

  if (!channel) {
    await interaction.followUp({
      content: `I opened staff follow-up ticket \`${ticket.id}\`, but I could not find a text channel to ping. Set one with \`/train settings help_channel:#channel\`.`,
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
    .setDescription(truncate(result.question, 1000))
    .addFields(
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
    )
    .setColor(0xf59e0b);

  await channel.send({
    content: `${roleMention} PipHackLup needs a human answer for this participant question.`,
    embeds: [embed],
    allowedMentions: roleId
      ? { roles: [roleId], users: [interaction.user.id] }
      : { users: [interaction.user.id], roles: [] },
  });
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
    `Help channel: ${settings.helpChannelId ? `<#${settings.helpChannelId}>` : "**current channel fallback**"}`,
  ].join("\n");
}

async function handleOnboard(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;
  const config = ensureConfig(guildId, interaction.guild?.name);

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

    try {
      await member.setNickname(name, "PipHackLup onboarding nickname update");
      await interaction.reply({
        content: `Nickname updated to **${name}**.`,
        flags: MessageFlags.Ephemeral,
      });
    } catch {
      await interaction.reply({
        content:
          "I could not update your nickname. Ask an organizer to move my role above participant roles and grant Manage Nicknames.",
        flags: MessageFlags.Ephemeral,
      });
    }
    return;
  }

  if (subcommand === "profile") {
    const skills = splitList(interaction.options.getString("skills", true));
    const interests = splitList(
      interaction.options.getString("interests") ?? "",
    );
    const timezone = interaction.options.getString("timezone") ?? undefined;
    upsertProfile(
      guildId,
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

    await interaction.reply({
      content: `Profile saved with skills: **${skills.join(", ") || "none"}**. You are now in the team matching pool.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const state = {
    hasNickname:
      interaction.member instanceof GuildMember &&
      interaction.member.nickname !== null,
    hasParticipantRole: true,
    hasProfile: store.members.has(`${guildId}:${interaction.user.id}`),
    hasTeam: [...store.teams.values()].some(
      (team) =>
        team.guildId === guildId &&
        team.memberIds.includes(interaction.user.id),
    ),
    hasReadRules: config.onboardingMode === "guided",
  };
  const steps = buildOnboardingSteps(config, state);
  const embed = new EmbedBuilder()
    .setTitle("Your PipHackLup checklist")
    .setDescription(
      `Progress: **${onboardingProgress(steps)}%**. ${canAccessGatedServer(steps) ? "You are clear to explore." : "Finish required steps to unlock the server."}`,
    )
    .addFields(
      steps.map((step) => ({
        name: `${step.complete ? "Done" : step.required ? "Required" : "Todo"}: ${step.label}`,
        value: step.actionHint,
      })),
    )
    .setColor(0x6ec6ff);

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleQueue(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;

  if (subcommand === "open") {
    const ticket = createStoredTicket({
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
    await interaction.reply({
      content: `Opened **${ticket.kind}** ticket \`${ticket.id}\`: **${ticket.topic}**.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (subcommand === "status") {
    const ordered = orderQueue(
      [...store.tickets.values()].filter(
        (ticket) => ticket.guildId === guildId,
      ),
    );
    const lines = ordered
      .slice(0, 10)
      .map(
        (ticket, index) =>
          `${index + 1}. \`${ticket.id}\` **${ticket.kind}** ${ticket.topic}`,
      );
    await interaction.reply({
      content: lines.length
        ? lines.join("\n")
        : "No open queue tickets right now.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const ticketId = interaction.options.getString("ticket", true);
  const ticket = store.tickets.get(ticketId);
  if (!ticket || ticket.guildId !== guildId) {
    await interaction.reply({
      content: `Ticket \`${ticketId}\` was not found.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    const next =
      subcommand === "claim"
        ? claimTicket(ticket, interaction.user.id)
        : subcommand === "escalate"
          ? escalateTicket(ticket)
          : closeTicket(ticket);
    store.tickets.set(next.id, next);
    await interaction.reply({
      content: `Ticket \`${next.id}\` is now **${next.status}**.`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    await interaction.reply({
      content: error instanceof Error ? error.message : "Ticket update failed.",
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function handleTeam(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;

  if (subcommand === "profile") {
    const skills = splitList(interaction.options.getString("skills", true));
    const interests = splitList(
      interaction.options.getString("interests") ?? "",
    );
    upsertProfile(guildId, {
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
    await interaction.reply({
      content: "You are now marked as looking for a team.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (subcommand === "create") {
    const profile =
      store.members.get(`${guildId}:${interaction.user.id}`) ??
      upsertProfile(guildId, {
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
    const team = createStoredTeam({
      guildId,
      owner: profile,
      name: interaction.options.getString("name", true),
      desiredSkills: splitList(interaction.options.getString("skills") ?? ""),
      ...optionalProjectIdea(
        interaction.options.getString("idea") ?? undefined,
      ),
    });

    await interaction.reply({
      content: `Created recruiting team **${team.name}** (\`${team.id}\`).`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: "You need Manage Server to run team matching suggestions.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const teams = [...store.teams.values()].filter(
    (team) => team.guildId === guildId,
  );
  const matches = suggestTeamMatches(getProfiles(guildId), teams, 5);
  const lines = matches.map(
    (match) =>
      `Team \`${match.teamId}\`: add ${match.addedMemberIds.map((id) => `<@${id}>`).join(", ")} (score ${match.score})`,
  );
  await interaction.reply({
    content: lines.length
      ? lines.join("\n")
      : "No strong team matches yet. Ask participants to run `/team profile`.",
    flags: MessageFlags.Ephemeral,
  });
}

async function handleMod(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;
  const user = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason", true);

  if (subcommand === "report") {
    const moderationCase = createStoredCase({
      guildId,
      targetUserId: user.id,
      action: "report",
      reason,
      reporterId: interaction.user.id,
      ...optionalEvidence(
        interaction.options.getString("evidence") ?? undefined,
      ),
    });
    await interaction.reply({
      content: `Report received as case \`${moderationCase.id}\`. Staff can review it in the moderation queue.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (
    !interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)
  ) {
    await interaction.reply({
      content: "You need Moderate Members to run that action.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (subcommand === "timeout") {
    const minutes = interaction.options.getInteger("minutes", true);
    const member = await interaction.guild?.members
      .fetch(user.id)
      .catch(() => null);
    if (member) {
      await member.timeout(minutes * 60_000, reason).catch(() => null);
    }
    const moderationCase = createStoredCase({
      guildId,
      targetUserId: user.id,
      action: "timeout",
      reason,
      moderatorId: interaction.user.id,
    });
    await interaction.reply({
      content: `Timeout case created: \`${moderationCase.id}\`.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const moderationCase = createStoredCase({
    guildId,
    targetUserId: user.id,
    action: "warn",
    reason,
    moderatorId: interaction.user.id,
  });
  await interaction.reply({
    content: `Warning case created: \`${moderationCase.id}\`.`,
    flags: MessageFlags.Ephemeral,
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

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, maxLength - 1)}…`;
}

function isSendableChannel(channel: unknown): channel is SendableChannel {
  return typeof (channel as { send?: unknown } | null)?.send === "function";
}
