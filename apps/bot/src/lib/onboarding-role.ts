import { GuildMember, MessageFlags, type ButtonInteraction } from "discord.js";
import type { OnboardingMode } from "@piphacklup/core";
import {
  allowedAutomaticRoleChannelGrants,
  hasOnlyAllowedAutomaticRoleChannelGrants,
  isSafeAutomaticAssignmentRole,
} from "./automatic-role-safety.js";
import {
  loadPersistentGuildConfig,
  persistAuditEvent,
  persistenceOperationName,
} from "./persistence.js";
import {
  botRateLimitKey,
  botRateLimitPolicies,
  checkBotRateLimit,
} from "./rate-limit.js";

export type OnboardingRoleBlockReason =
  | "missing-participant-role"
  | "nickname-required"
  | "participant-role-unavailable"
  | "participant-role-unsafe"
  | "participant-role-unmanageable"
  | "newcomer-role-unmanageable";

export type OnboardingRoleTransition =
  | { allowed: false; reason: OnboardingRoleBlockReason }
  | {
      allowed: true;
      alreadyAcknowledged: boolean;
      addParticipant: boolean;
      removeNewcomer: boolean;
    };

export function planOnboardingRoleTransition(input: {
  onboardingMode: OnboardingMode;
  hasNickname: boolean;
  participantRoleId?: string;
  newcomerRoleId?: string;
  memberRoleIds: Iterable<string>;
  participantRoleAvailable: boolean;
  participantRoleSafe: boolean;
  participantRoleManageable: boolean;
  newcomerRoleManageable: boolean;
}): OnboardingRoleTransition {
  if (!input.participantRoleId) {
    return { allowed: false, reason: "missing-participant-role" };
  }

  const memberRoleIds = new Set(input.memberRoleIds);
  const alreadyAcknowledged = memberRoleIds.has(input.participantRoleId);
  const removeNewcomer = Boolean(
    input.newcomerRoleId && memberRoleIds.has(input.newcomerRoleId),
  );

  if (!input.participantRoleAvailable) {
    return { allowed: false, reason: "participant-role-unavailable" };
  }
  if (!input.participantRoleSafe) {
    return { allowed: false, reason: "participant-role-unsafe" };
  }
  if (
    input.onboardingMode === "gated" &&
    !input.hasNickname &&
    !alreadyAcknowledged
  ) {
    return { allowed: false, reason: "nickname-required" };
  }
  if (!alreadyAcknowledged && !input.participantRoleManageable) {
    return { allowed: false, reason: "participant-role-unmanageable" };
  }
  if (removeNewcomer && !input.newcomerRoleManageable) {
    return { allowed: false, reason: "newcomer-role-unmanageable" };
  }

  return {
    allowed: true,
    alreadyAcknowledged,
    addParticipant: !alreadyAcknowledged,
    removeNewcomer,
  };
}

export async function handleOnboardingRulesAcknowledgement(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "Rules acknowledgement only works inside a hackathon server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const rateLimit = checkBotRateLimit(
    botRateLimitKey([
      "onboarding-rules",
      interaction.guildId,
      interaction.user.id,
    ]),
    botRateLimitPolicies.buttonMutation,
  );
  if (!rateLimit.allowed) {
    await interaction.reply({
      content: `That action is rate limited. Try again in ${rateLimit.retryAfterSeconds}s.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guildId = interaction.guildId;
  const guildIdentity = { id: guildId, name: interaction.guild.name };

  let config;
  try {
    config = await loadPersistentGuildConfig(guildIdentity);
  } catch (error) {
    logOnboardingRoleFailure(guildId, "load onboarding config", error);
    await interaction.editReply({
      content: `I could not ${persistenceOperationName(error)}, so no Discord roles were changed.`,
    });
    return;
  }

  let member: GuildMember;
  try {
    member = await interaction.guild.members.fetch(interaction.user.id);
  } catch {
    await interaction.editReply({
      content:
        "I could not load your current server membership, so no roles were changed.",
    });
    return;
  }

  const participantRoleId = config.roles.participant;
  const newcomerRoleId = config.roles.newcomer;
  const [participantRole, newcomerRole] = await Promise.all([
    participantRoleId
      ? interaction.guild.roles.fetch(participantRoleId).catch(() => null)
      : Promise.resolve(null),
    newcomerRoleId
      ? interaction.guild.roles.fetch(newcomerRoleId).catch(() => null)
      : Promise.resolve(null),
  ]);
  const transition = planOnboardingRoleTransition({
    onboardingMode: config.onboardingMode,
    hasNickname: member.nickname !== null,
    ...(participantRoleId ? { participantRoleId } : {}),
    ...(newcomerRoleId ? { newcomerRoleId } : {}),
    memberRoleIds: member.roles.cache.keys(),
    participantRoleAvailable: participantRole !== null,
    participantRoleSafe:
      isSafeAutomaticAssignmentRole(
        participantRole,
        interaction.guild.roles.everyone.id,
      ) &&
      (!participantRole ||
        hasOnlyAllowedAutomaticRoleChannelGrants(
          participantRole.id,
          interaction.guild.channels.cache.values(),
          allowedAutomaticRoleChannelGrants(config, "participant"),
        )),
    participantRoleManageable: participantRole?.editable ?? false,
    newcomerRoleManageable:
      !newcomerRoleId || !member.roles.cache.has(newcomerRoleId)
        ? true
        : (newcomerRole?.editable ?? false),
  });

  if (!transition.allowed) {
    await interaction.editReply({
      content: onboardingRoleBlockMessage(transition.reason),
    });
    return;
  }

  if (!transition.addParticipant && !transition.removeNewcomer) {
    await interaction.editReply({
      content:
        "Your rules acknowledgement and participant role are already recorded. No roles were changed.",
    });
    return;
  }

  let participantAdded = false;
  let newcomerRemoved = false;
  if (transition.addParticipant) {
    try {
      await member.roles.add(
        participantRole!,
        "PipHackLup rules acknowledgement",
      );
      participantAdded = true;
    } catch {
      await interaction.editReply({
        content:
          "Discord rejected the participant-role assignment. Ask an organizer to move the PipHackLup bot role above the participant role and grant Manage Roles. No acknowledgement was recorded.",
      });
      return;
    }
  }

  if (transition.removeNewcomer) {
    try {
      await member.roles.remove(
        newcomerRole!,
        "PipHackLup onboarding completed",
      );
      newcomerRemoved = true;
    } catch {
      await interaction.editReply({
        content: participantAdded
          ? "Your participant role and rules acknowledgement were recorded, but Discord rejected removal of the newcomer role. Ask an organizer to remove it manually."
          : "Your participant role was already present, but Discord rejected removal of the newcomer role. Ask an organizer to remove it manually.",
      });
      return;
    }
  }

  try {
    await persistAuditEvent({
      guildId,
      actorId: interaction.user.id,
      action: "onboarding.rules_acknowledged",
      targetType: "member",
      targetId: interaction.user.id,
      metadata: {
        onboardingMode: config.onboardingMode,
        participantAdded,
        newcomerRemoved,
      },
    });
  } catch (error) {
    logOnboardingRoleFailure(guildId, "record onboarding audit", error);
    await interaction.editReply({
      content: `Your participant role and rules acknowledgement are recorded in Discord, but PipHackLup could not ${persistenceOperationName(error)}. Tell an organizer so the missing audit event can be investigated.`,
    });
    return;
  }

  await interaction.editReply({
    content:
      "Rules acknowledged. Your participant role is active, and the newcomer role was removed when present.",
  });
}

function onboardingRoleBlockMessage(reason: OnboardingRoleBlockReason): string {
  switch (reason) {
    case "missing-participant-role":
      return "An organizer must run `/setup` successfully before rules acknowledgement can grant a participant role.";
    case "nickname-required":
      return "This server uses gated onboarding. Set a server nickname with `/onboard nickname`, then acknowledge the rules again.";
    case "participant-role-unavailable":
      return "The configured participant role no longer exists. Ask an organizer to rerun `/setup`. No roles were changed.";
    case "participant-role-unsafe":
      return "The configured participant role is no longer safe for automatic assignment. Ask an organizer to rerun `/setup`; no roles were changed.";
    case "participant-role-unmanageable":
      return "PipHackLup cannot assign the participant role because of Discord role hierarchy or missing Manage Roles permission. No roles were changed.";
    case "newcomer-role-unmanageable":
      return "PipHackLup cannot safely finish onboarding because it cannot remove your newcomer role. Ask an organizer to fix the bot role hierarchy; no roles were changed.";
  }
}

function logOnboardingRoleFailure(
  guildId: string,
  context: string,
  error: unknown,
): void {
  console.error(
    `PipHackLup onboarding role failure (${context}) in guild ${guildId}: ${persistenceOperationName(error)}.`,
  );
}
