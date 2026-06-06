import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  MessageFlags,
  PermissionFlagsBits
} from "discord.js";
import {
  buildOnboardingSteps,
  canAccessGatedServer,
  claimTicket,
  closeTicket,
  defaultAutoModTemplates,
  escalateTicket,
  onboardingProgress,
  orderQueue,
  suggestTeamMatches,
  type OnboardingMode,
  type QueueKind
} from "@piphacklup/core";
import {
  createStoredCase,
  createStoredTeam,
  createStoredTicket,
  ensureConfig,
  getProfiles,
  store,
  upsertProfile
} from "../lib/store.js";

export async function handleChatInput(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: "PipHackLup works inside hackathon servers.", flags: MessageFlags.Ephemeral });
    return;
  }

  switch (interaction.commandName) {
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
      await interaction.reply({ content: "Unknown command.", flags: MessageFlags.Ephemeral });
  }
}

async function handleSetup(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const eventName = interaction.options.getString("event") ?? interaction.guild?.name ?? "Hackathon";
  const onboarding: OnboardingMode = interaction.options.getString("onboarding") === "gated" ? "gated" : "guided";
  const config = { ...ensureConfig(guildId, eventName), eventName, onboardingMode: onboarding };
  store.configs.set(guildId, config);

  const automod = defaultAutoModTemplates().map((rule) => `• **${rule.name}**: ${rule.goal}`).join("\n");
  const embed = new EmbedBuilder()
    .setTitle("PipHackLup setup started")
    .setDescription(`Configured **${config.eventName}** in **${config.onboardingMode}** onboarding mode.`)
    .addFields(
      {
        name: "Built-in queues",
        value: "Mentor help, tech help, and judging/demo queues are ready."
      },
      {
        name: "Team rules",
        value: `Default team size is ${config.teamSizeMin}-${config.teamSizeMax}.`
      },
      {
        name: "Recommended AutoMod",
        value: automod.slice(0, 1000)
      }
    )
    .setColor(0x2f8fd8);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("piphacklup:onboarding").setLabel("Preview onboarding").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("piphacklup:queues").setLabel("Queue status").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("piphacklup:teams").setLabel("Team status").setStyle(ButtonStyle.Secondary)
  );

  await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
}

async function handleOnboard(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;
  const config = ensureConfig(guildId, interaction.guild?.name);

  if (subcommand === "nickname") {
    const name = interaction.options.getString("name", true);
    const member = interaction.member instanceof GuildMember ? interaction.member : null;
    if (!member) {
      await interaction.reply({ content: "I could not read your member record.", flags: MessageFlags.Ephemeral });
      return;
    }

    try {
      await member.setNickname(name, "PipHackLup onboarding nickname update");
      await interaction.reply({ content: `Nickname updated to **${name}**.`, flags: MessageFlags.Ephemeral });
    } catch {
      await interaction.reply({
        content: "I could not update your nickname. Ask an organizer to move my role above participant roles and grant Manage Nicknames.",
        flags: MessageFlags.Ephemeral
      });
    }
    return;
  }

  if (subcommand === "profile") {
    const skills = splitList(interaction.options.getString("skills", true));
    const interests = splitList(interaction.options.getString("interests") ?? "");
    const timezone = interaction.options.getString("timezone") ?? undefined;
    upsertProfile(guildId, withOptionalTimezone({
      userId: interaction.user.id,
      displayName: interaction.member instanceof GuildMember ? interaction.member.displayName : interaction.user.username,
      skills,
      interests,
      beginnerFriendly: true,
      lookingForTeam: true
    }, timezone));

    await interaction.reply({
      content: `Profile saved with skills: **${skills.join(", ") || "none"}**. You are now in the team matching pool.`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const state = {
    hasNickname: interaction.member instanceof GuildMember && interaction.member.nickname !== null,
    hasParticipantRole: true,
    hasProfile: store.members.has(`${guildId}:${interaction.user.id}`),
    hasTeam: [...store.teams.values()].some((team) => team.guildId === guildId && team.memberIds.includes(interaction.user.id)),
    hasReadRules: config.onboardingMode === "guided"
  };
  const steps = buildOnboardingSteps(config, state);
  const embed = new EmbedBuilder()
    .setTitle("Your PipHackLup checklist")
    .setDescription(`Progress: **${onboardingProgress(steps)}%**. ${canAccessGatedServer(steps) ? "You are clear to explore." : "Finish required steps to unlock the server."}`)
    .addFields(
      steps.map((step) => ({
        name: `${step.complete ? "Done" : step.required ? "Required" : "Todo"}: ${step.label}`,
        value: step.actionHint
      }))
    )
    .setColor(0x6ec6ff);

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleQueue(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;

  if (subcommand === "open") {
    const ticket = createStoredTicket({
      guildId,
      kind: interaction.options.getString("kind", true) as QueueKind,
      requesterId: interaction.user.id,
      topic: interaction.options.getString("topic", true),
      description: interaction.options.getString("description", true),
      priority: (interaction.options.getInteger("priority") ?? 1) as 0 | 1 | 2 | 3
    });
    await interaction.reply({
      content: `Opened **${ticket.kind}** ticket \`${ticket.id}\`: **${ticket.topic}**.`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (subcommand === "status") {
    const ordered = orderQueue([...store.tickets.values()].filter((ticket) => ticket.guildId === guildId));
    const lines = ordered.slice(0, 10).map((ticket, index) => `${index + 1}. \`${ticket.id}\` **${ticket.kind}** ${ticket.topic}`);
    await interaction.reply({
      content: lines.length ? lines.join("\n") : "No open queue tickets right now.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const ticketId = interaction.options.getString("ticket", true);
  const ticket = store.tickets.get(ticketId);
  if (!ticket || ticket.guildId !== guildId) {
    await interaction.reply({ content: `Ticket \`${ticketId}\` was not found.`, flags: MessageFlags.Ephemeral });
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
    await interaction.reply({ content: `Ticket \`${next.id}\` is now **${next.status}**.`, flags: MessageFlags.Ephemeral });
  } catch (error) {
    await interaction.reply({ content: error instanceof Error ? error.message : "Ticket update failed.", flags: MessageFlags.Ephemeral });
  }
}

async function handleTeam(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;

  if (subcommand === "profile") {
    const skills = splitList(interaction.options.getString("skills", true));
    const interests = splitList(interaction.options.getString("interests") ?? "");
    upsertProfile(guildId, {
      userId: interaction.user.id,
      displayName: interaction.member instanceof GuildMember ? interaction.member.displayName : interaction.user.username,
      skills,
      interests,
      beginnerFriendly: true,
      lookingForTeam: true
    });
    await interaction.reply({ content: "You are now marked as looking for a team.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (subcommand === "create") {
    const profile =
      store.members.get(`${guildId}:${interaction.user.id}`) ??
      upsertProfile(guildId, {
        userId: interaction.user.id,
        displayName: interaction.member instanceof GuildMember ? interaction.member.displayName : interaction.user.username,
        skills: [],
        interests: [],
        beginnerFriendly: true,
        lookingForTeam: false
      });
    const team = createStoredTeam({
      guildId,
      owner: profile,
      name: interaction.options.getString("name", true),
      desiredSkills: splitList(interaction.options.getString("skills") ?? ""),
      ...optionalProjectIdea(interaction.options.getString("idea") ?? undefined)
    });

    await interaction.reply({
      content: `Created recruiting team **${team.name}** (\`${team.id}\`).`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: "You need Manage Server to run team matching suggestions.", flags: MessageFlags.Ephemeral });
    return;
  }

  const teams = [...store.teams.values()].filter((team) => team.guildId === guildId);
  const matches = suggestTeamMatches(getProfiles(guildId), teams, 5);
  const lines = matches.map(
    (match) =>
      `Team \`${match.teamId}\`: add ${match.addedMemberIds.map((id) => `<@${id}>`).join(", ")} (score ${match.score})`
  );
  await interaction.reply({
    content: lines.length ? lines.join("\n") : "No strong team matches yet. Ask participants to run `/team profile`.",
    flags: MessageFlags.Ephemeral
  });
}

async function handleMod(interaction: ChatInputCommandInteraction): Promise<void> {
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
      ...optionalEvidence(interaction.options.getString("evidence") ?? undefined)
    });
    await interaction.reply({
      content: `Report received as case \`${moderationCase.id}\`. Staff can review it in the moderation queue.`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
    await interaction.reply({ content: "You need Moderate Members to run that action.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (subcommand === "timeout") {
    const minutes = interaction.options.getInteger("minutes", true);
    const member = await interaction.guild?.members.fetch(user.id).catch(() => null);
    if (member) {
      await member.timeout(minutes * 60_000, reason).catch(() => null);
    }
    const moderationCase = createStoredCase({
      guildId,
      targetUserId: user.id,
      action: "timeout",
      reason,
      moderatorId: interaction.user.id
    });
    await interaction.reply({ content: `Timeout case created: \`${moderationCase.id}\`.`, flags: MessageFlags.Ephemeral });
    return;
  }

  const moderationCase = createStoredCase({
    guildId,
    targetUserId: user.id,
    action: "warn",
    reason,
    moderatorId: interaction.user.id
  });
  await interaction.reply({ content: `Warning case created: \`${moderationCase.id}\`.`, flags: MessageFlags.Ephemeral });
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function withOptionalTimezone<T extends object>(profile: T, timezone?: string): T & { timezone?: string } {
  return timezone ? { ...profile, timezone } : profile;
}

function optionalProjectIdea(projectIdea?: string): { projectIdea?: string } {
  return projectIdea ? { projectIdea } : {};
}

function optionalEvidence(evidenceMessageUrl?: string): { evidenceMessageUrl?: string } {
  return evidenceMessageUrl ? { evidenceMessageUrl } : {};
}
