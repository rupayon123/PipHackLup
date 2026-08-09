import {
  ChannelType,
  EmbedBuilder,
  OverwriteType,
  PermissionFlagsBits,
  PermissionsBitField,
  type CategoryChannel,
  type Guild,
  type Message,
  type NonThreadGuildBasedChannel,
  type OverwriteData,
  type PermissionOverwriteOptions,
  type Role,
  type TextChannel,
} from "discord.js";
import type { EventConfig, OnboardingMode } from "@piphacklup/core";
import {
  isSafeAutomaticAssignmentRole,
  selectReusableSensitiveSetupRole,
} from "./automatic-role-safety.js";
import { buildPanelActionRow } from "./panel-actions.js";

export type EventRoleKey = keyof EventConfig["roles"];
type EventChannelKey = keyof EventConfig["channels"];
type EventResources = NonNullable<EventConfig["resources"]>;
type EventResourceKey = keyof EventResources;

export type SetupChannelAccess =
  | "public-read-only"
  | "public-conversation"
  | "staff-private";

export type SetupPermissionOverwrite = OverwriteData & {
  id: string;
  type: OverwriteType;
};

export interface SetupRolePlan {
  key: EventRoleKey;
  name: string;
}

export interface SetupCategoryPlan {
  key: "event-category";
  name: string;
}

export interface SetupChannelPlan {
  key: string;
  configKeys: readonly EventChannelKey[];
  name: string;
  topic: string;
  access: SetupChannelAccess;
}

export interface SetupPanelPlan {
  key: "onboarding" | "help" | "teams";
  channelKey: EventChannelKey;
  name: string;
  marker: string;
  title: string;
  description: string;
  fields: readonly { name: string; value: string }[];
}

export interface SetupProvisioningPlan {
  eventName: string;
  onboardingMode: OnboardingMode;
  category: SetupCategoryPlan;
  roles: readonly SetupRolePlan[];
  channels: readonly SetupChannelPlan[];
  panels: readonly SetupPanelPlan[];
}

export type SetupOperationStatus =
  | "created"
  | "reused"
  | "updated"
  | "failed"
  | "skipped";

export interface SetupOperation {
  key: string;
  kind: "preflight" | "role" | "category" | "channel" | "panel" | "persistence";
  name: string;
  status: SetupOperationStatus;
  id?: string;
  detail?: string;
}

export interface SetupProvisioningResult {
  plan: SetupProvisioningPlan;
  roles: EventConfig["roles"];
  channels: EventConfig["channels"];
  resources: EventResources;
  operations: SetupOperation[];
  missingPermissions: string[];
  blockedBeforeChanges?: boolean;
}

export interface SetupReportSection {
  name: string;
  value: string;
}

export const setupPermissionRequirements = [
  { flag: PermissionFlagsBits.ManageRoles, label: "Manage Roles" },
  { flag: PermissionFlagsBits.ManageChannels, label: "Manage Channels" },
  { flag: PermissionFlagsBits.ViewChannel, label: "View Channels" },
  { flag: PermissionFlagsBits.SendMessages, label: "Send Messages" },
  { flag: PermissionFlagsBits.EmbedLinks, label: "Embed Links" },
  {
    flag: PermissionFlagsBits.ReadMessageHistory,
    label: "Read Message History",
  },
] as const;

const guildSetupQueues = new Map<string, Promise<void>>();
const automaticAssignmentRoleKeys = new Set<EventRoleKey>([
  "newcomer",
  "participant",
]);
const sensitiveRoleNameAdoptionKeys = new Set<EventRoleKey>([
  ...automaticAssignmentRoleKeys,
  "mentor",
  "organizer",
  "moderator",
]);

export function requiresSafeRoleNameAdoption(roleKey: EventRoleKey): boolean {
  return sensitiveRoleNameAdoptionKeys.has(roleKey);
}

export function buildSetupProvisioningPlan(
  eventName: string,
  onboardingMode: OnboardingMode,
): SetupProvisioningPlan {
  const normalizedEventName = normalizeEventName(eventName);
  const modeDescription =
    onboardingMode === "gated"
      ? "This event uses participant-role gating. Set your nickname, read the rules, then use **Acknowledge rules** to receive event-channel access."
      : "This event uses guided onboarding. The checklist keeps you oriented without blocking the rest of the server.";

  return {
    eventName: normalizedEventName,
    onboardingMode,
    category: {
      key: "event-category",
      name: "PIPHACKLUP — EVENT HUB",
    },
    roles: [
      { key: "newcomer", name: "PipHackLup · Newcomer" },
      { key: "participant", name: "PipHackLup · Participant" },
      { key: "mentor", name: "PipHackLup · Mentor" },
      { key: "judge", name: "PipHackLup · Judge" },
      { key: "organizer", name: "PipHackLup · Organizer" },
      { key: "moderator", name: "PipHackLup · Moderator" },
    ],
    channels: [
      {
        key: "welcome-rules",
        configKeys: ["welcome", "rules"],
        name: "piphacklup-welcome-rules",
        topic: `${normalizedEventName} welcome, code of conduct, and onboarding instructions.`,
        access: "public-read-only",
      },
      {
        key: "announcements",
        configKeys: ["announcements"],
        name: "piphacklup-announcements",
        topic: `${normalizedEventName} schedule changes and organizer announcements.`,
        access: "public-read-only",
      },
      {
        key: "help-desk",
        configKeys: ["helpDesk"],
        name: "piphacklup-help-desk",
        topic:
          "Ask questions here or open a structured request with /queue open.",
        access: "public-conversation",
      },
      {
        key: "team-finder",
        configKeys: ["teamCatalog"],
        name: "piphacklup-team-finder",
        topic:
          "Meet teammates, share skills, and use /team match for suggestions.",
        access: "public-conversation",
      },
      {
        key: "moderation-log",
        configKeys: ["moderationLog"],
        name: "piphacklup-moderation-log",
        topic: "Private PipHackLup safety reports and moderation follow-up.",
        access: "staff-private",
      },
      {
        key: "audit-log",
        configKeys: ["auditLog"],
        name: "piphacklup-audit-log",
        topic: "Private PipHackLup operational and configuration events.",
        access: "staff-private",
      },
    ],
    panels: [
      {
        key: "onboarding",
        channelKey: "welcome",
        name: "Onboarding panel",
        marker: "PipHackLup setup panel · onboarding",
        title: `${normalizedEventName} · Start here`,
        description: `Welcome to **${normalizedEventName}**. PipHackLup can guide your profile, team search, and requests for human help.`,
        fields: [
          {
            name: "1 · Check your route",
            value: "Run `/onboard checklist` for your personal next steps.",
          },
          {
            name: "2 · Introduce yourself",
            value:
              "Use `/onboard nickname` and `/onboard profile` so teammates and staff know how to work with you.",
          },
          {
            name: "Onboarding mode",
            value: modeDescription,
          },
        ],
      },
      {
        key: "help",
        channelKey: "helpDesk",
        name: "Help desk panel",
        marker: "PipHackLup setup panel · help",
        title: `${normalizedEventName} · Human help desk`,
        description:
          "Use a structured queue ticket so mentors and organizers can see what you need and who is already helping.",
        fields: [
          {
            name: "Open a request",
            value:
              "Run `/queue open` and choose mentor, tech, judging, or staff follow-up.",
          },
          {
            name: "Check the line",
            value:
              "Run `/queue status`. Keep your ticket ID so you or staff can close it when the issue is resolved.",
          },
        ],
      },
      {
        key: "teams",
        channelKey: "teamCatalog",
        name: "Team finder panel",
        marker: "PipHackLup setup panel · teams",
        title: `${normalizedEventName} · Team finder`,
        description:
          "Share what you can contribute, describe what your project needs, and let PipHackLup suggest complementary matches.",
        fields: [
          {
            name: "Looking for teammates?",
            value: "Run `/team profile`, then `/team match` for suggestions.",
          },
          {
            name: "Already recruiting?",
            value:
              "Run `/team create` with a team name, desired skills, and an optional project idea.",
          },
        ],
      },
    ],
  };
}

export function getMissingSetupPermissions(
  permissions: Pick<PermissionsBitField, "has"> | null | undefined,
): string[] {
  if (!permissions) {
    return setupPermissionRequirements.map((requirement) => requirement.label);
  }

  return setupPermissionRequirements
    .filter((requirement) => !permissions.has(requirement.flag))
    .map((requirement) => requirement.label);
}

export function buildChannelPermissionOverwrites(input: {
  access: SetupChannelAccess;
  everyoneRoleId: string;
  botMemberId: string;
  staffRoleIds: readonly string[];
  restrictToParticipant?: boolean;
  participantRoleId?: string;
}): SetupPermissionOverwrite[] {
  const readPermissions = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.ReadMessageHistory,
  ];
  const writePermissions = [
    ...readPermissions,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
  ];
  const overwrites: SetupPermissionOverwrite[] = [];

  if (input.restrictToParticipant && !input.participantRoleId) {
    throw new Error(
      "A participant role is required for gated channel permissions.",
    );
  }

  if (input.access === "staff-private") {
    overwrites.push({
      id: input.everyoneRoleId,
      type: OverwriteType.Role,
      deny: [PermissionFlagsBits.ViewChannel],
    });
  } else if (input.restrictToParticipant) {
    overwrites.push({
      id: input.everyoneRoleId,
      type: OverwriteType.Role,
      deny: [PermissionFlagsBits.ViewChannel],
    });
    overwrites.push({
      id: input.participantRoleId!,
      type: OverwriteType.Role,
      allow:
        input.access === "public-read-only"
          ? readPermissions
          : writePermissions,
      ...(input.access === "public-read-only"
        ? { deny: [PermissionFlagsBits.SendMessages] }
        : {}),
    });
  } else if (input.access === "public-read-only") {
    overwrites.push({
      id: input.everyoneRoleId,
      type: OverwriteType.Role,
      allow: readPermissions,
      deny: [PermissionFlagsBits.SendMessages],
    });
  } else {
    overwrites.push({
      id: input.everyoneRoleId,
      type: OverwriteType.Role,
      allow: [...readPermissions, PermissionFlagsBits.SendMessages],
    });
  }

  overwrites.push({
    id: input.botMemberId,
    type: OverwriteType.Member,
    allow: writePermissions,
  });

  for (const roleId of new Set(input.staffRoleIds.filter(Boolean))) {
    overwrites.push({
      id: roleId,
      type: OverwriteType.Role,
      allow: writePermissions,
    });
  }

  return overwrites;
}

export function shouldRestrictChannelToParticipant(
  onboardingMode: OnboardingMode,
  channel: Pick<SetupChannelPlan, "access" | "configKeys">,
): boolean {
  return (
    onboardingMode === "gated" &&
    channel.access !== "staff-private" &&
    !channel.configKeys.some((key) => key === "welcome" || key === "rules")
  );
}

export function isRequiredOverwriteSatisfied(
  existing:
    | {
        allow: Pick<PermissionsBitField, "has">;
        deny: Pick<PermissionsBitField, "has">;
      }
    | null
    | undefined,
  required: Pick<OverwriteData, "allow" | "deny">,
): boolean {
  if (!existing) return false;

  const requiredAllow = new PermissionsBitField(required.allow).toArray();
  const requiredDeny = new PermissionsBitField(required.deny).toArray();
  return (
    requiredAllow.every((permission) =>
      existing.allow.has(permission, false),
    ) &&
    requiredDeny.every((permission) => existing.deny.has(permission, false))
  );
}

export function hasExactPermissionOverwriteSet(
  existing: readonly {
    id: string;
    type: OverwriteType;
    allow: Pick<PermissionsBitField, "bitfield">;
    deny: Pick<PermissionsBitField, "bitfield">;
  }[],
  required: readonly SetupPermissionOverwrite[],
): boolean {
  if (existing.length !== required.length) return false;

  return required.every((requiredOverwrite) => {
    const existingOverwrite = existing.find(
      (overwrite) => overwrite.id === requiredOverwrite.id,
    );
    return Boolean(
      existingOverwrite &&
      existingOverwrite.type === requiredOverwrite.type &&
      existingOverwrite.allow.bitfield ===
        new PermissionsBitField(requiredOverwrite.allow).bitfield &&
      existingOverwrite.deny.bitfield ===
        new PermissionsBitField(requiredOverwrite.deny).bitfield,
    );
  });
}

export function getManageGuildRoleIds(
  roles: readonly {
    id: string;
    permissions: Pick<PermissionsBitField, "has">;
  }[],
  everyoneRoleId: string,
): string[] {
  return roles
    .filter(
      (role) =>
        role.id !== everyoneRoleId &&
        role.permissions.has(PermissionFlagsBits.ManageGuild),
    )
    .map((role) => role.id);
}

export async function provisionHackathonGuild(input: {
  guild: Guild;
  setupActorId: string;
  currentConfig: EventConfig;
  eventName: string;
  onboardingMode: OnboardingMode;
}): Promise<SetupProvisioningResult> {
  const previousSetup =
    guildSetupQueues.get(input.guild.id) ?? Promise.resolve();
  let releaseSetup!: () => void;
  const currentSetup = new Promise<void>((resolve) => {
    releaseSetup = resolve;
  });
  const queuedSetup = previousSetup
    .catch(() => undefined)
    .then(() => currentSetup);
  guildSetupQueues.set(input.guild.id, queuedSetup);

  await previousSetup.catch(() => undefined);
  try {
    return await provisionHackathonGuildUnlocked(input);
  } finally {
    releaseSetup();
    if (guildSetupQueues.get(input.guild.id) === queuedSetup) {
      guildSetupQueues.delete(input.guild.id);
    }
  }
}

async function provisionHackathonGuildUnlocked(input: {
  guild: Guild;
  setupActorId: string;
  currentConfig: EventConfig;
  eventName: string;
  onboardingMode: OnboardingMode;
}): Promise<SetupProvisioningResult> {
  const plan = buildSetupProvisioningPlan(
    input.eventName,
    input.onboardingMode,
  );
  const roles: EventConfig["roles"] = {};
  const channels: EventConfig["channels"] = {};
  const resources: EventResources = {};
  const operations: SetupOperation[] = [];

  let botMember;
  try {
    botMember = input.guild.members.me ?? (await input.guild.members.fetchMe());
  } catch (error) {
    return buildBlockedResult({
      plan,
      operationName: "Bot member lookup",
      detail: describeProvisioningError(error),
    });
  }

  const missingPermissions = getMissingSetupPermissions(botMember.permissions);
  if (missingPermissions.length > 0) {
    return buildBlockedResult({
      plan,
      operationName: "Bot permission check",
      detail: `Missing: ${missingPermissions.join(", ")}`,
      missingPermissions,
    });
  }

  let guildRoles: Role[];
  let guildChannels: NonThreadGuildBasedChannel[];
  try {
    const [fetchedRoles, fetchedChannels] = await Promise.all([
      input.guild.roles.fetch(),
      input.guild.channels.fetch(),
    ]);
    guildRoles = [...fetchedRoles.values()];
    guildChannels = [...fetchedChannels.values()].filter(
      (channel): channel is NonThreadGuildBasedChannel => channel !== null,
    );
  } catch (error) {
    return buildBlockedResult({
      plan,
      operationName: "Discord role and channel inventory",
      detail: describeProvisioningError(error),
    });
  }

  let memberInventoryComplete = false;
  try {
    await input.guild.members.fetch();
    memberInventoryComplete = true;
  } catch {
    // Name-only sensitive-role adoption fails closed below. Setup can still
    // create new zero-permission roles without a complete member inventory.
  }

  const rejectedParticipantRoleIds = new Set<string>();

  for (const rolePlan of plan.roles) {
    const configuredId = input.currentConfig.roles[rolePlan.key];
    const configuredRole = configuredId
      ? guildRoles.find((role) => role.id === configuredId)
      : undefined;
    const matchingRoles = guildRoles.filter(
      (role) => role.name === rolePlan.name,
    );
    const isAutomaticAssignmentRole = automaticAssignmentRoleKeys.has(
      rolePlan.key,
    );
    const requiresSafeNameAdoption = requiresSafeRoleNameAdoption(rolePlan.key);
    const reusableRole = requiresSafeNameAdoption
      ? selectReusableSensitiveSetupRole({
          ...(configuredRole ? { configuredRole } : {}),
          matchingRoles,
          everyoneRoleId: input.guild.id,
          memberInventoryComplete,
        })
      : isReusableRole(configuredRole, input.guild.id)
        ? configuredRole
        : matchingRoles.find((role) => isReusableRole(role, input.guild.id));

    if (rolePlan.key === "participant") {
      for (const candidate of [configuredRole, ...matchingRoles]) {
        if (candidate && candidate.id !== reusableRole?.id) {
          rejectedParticipantRoleIds.add(candidate.id);
        }
      }
    }

    if (reusableRole) {
      roles[rolePlan.key] = reusableRole.id;
      operations.push(
        makeOperation({
          key: rolePlan.key,
          kind: "role",
          name: reusableRole.name,
          status: "reused",
          id: reusableRole.id,
          detail:
            matchingRoles.length > 1
              ? "Multiple matching roles already existed; reused one and created none."
              : undefined,
        }),
      );
      continue;
    }

    if (matchingRoles.length > 0 && !requiresSafeNameAdoption) {
      operations.push(
        makeOperation({
          key: rolePlan.key,
          kind: "role",
          name: rolePlan.name,
          status: "failed",
          detail:
            "A managed or reserved Discord role already uses this name; no duplicate was created.",
        }),
      );
      continue;
    }

    try {
      const createdRole = await input.guild.roles.create({
        name: rolePlan.name,
        permissions: 0n,
        mentionable: false,
        hoist: false,
        reason: `PipHackLup setup for ${plan.eventName}`,
      });
      guildRoles.push(createdRole);
      if (
        requiresSafeNameAdoption &&
        !isSafeAutomaticAssignmentRole(createdRole, input.guild.id)
      ) {
        if (rolePlan.key === "participant") {
          rejectedParticipantRoleIds.add(createdRole.id);
        }
        operations.push(
          makeOperation({
            key: rolePlan.key,
            kind: "role",
            name: createdRole.name,
            status: "failed",
            id: createdRole.id,
            detail:
              "Discord created the role, but its live permissions or hierarchy were not safe for automatic assignment or privileged access. It was not configured or granted channel access.",
          }),
        );
        continue;
      }
      roles[rolePlan.key] = createdRole.id;
      operations.push(
        makeOperation({
          key: rolePlan.key,
          kind: "role",
          name: createdRole.name,
          status: "created",
          id: createdRole.id,
          detail:
            requiresSafeNameAdoption &&
            (matchingRoles.length > 0 || configuredRole)
              ? "Created a separate zero-permission role because the prior candidate could not be safely adopted for automatic assignment."
              : undefined,
        }),
      );
    } catch (error) {
      operations.push(
        makeOperation({
          key: rolePlan.key,
          kind: "role",
          name: rolePlan.name,
          status: "failed",
          detail: describeProvisioningError(error),
        }),
      );
    }
  }

  const categoryResult = await ensureCategory({
    guild: input.guild,
    guildChannels,
    plan: plan.category,
    eventName: plan.eventName,
    configuredCategoryId: input.currentConfig.resources?.eventCategoryId,
  });
  operations.push(categoryResult.operation);
  if (categoryResult.channel) {
    resources.eventCategoryId = categoryResult.channel.id;
    if (
      !guildChannels.some(
        (channel) => channel.id === categoryResult.channel!.id,
      )
    ) {
      guildChannels.push(categoryResult.channel);
    }
  }

  const resolvedChannels: Partial<Record<EventChannelKey, TextChannel>> = {};
  const channelWasCreated = new Map<EventChannelKey, boolean>();
  const actorAccess = await ensureSetupActorAccess({
    guild: input.guild,
    setupActorId: input.setupActorId,
    organizerRoleId: roles.organizer,
    guildRoles,
    eventName: plan.eventName,
  });
  operations.push(actorAccess.operation);
  const staffRoleIds = [
    roles.organizer,
    roles.moderator,
    ...actorAccess.managementRoleIds,
  ].filter((roleId): roleId is string => Boolean(roleId));
  const obsoleteParticipantRoleOverwriteIds = [
    ...rejectedParticipantRoleIds,
    ...(input.currentConfig.roles.participant &&
    input.currentConfig.roles.participant !== roles.participant
      ? [input.currentConfig.roles.participant]
      : []),
  ].filter(
    (roleId, index, roleIds) =>
      roleId !== roles.participant &&
      !staffRoleIds.includes(roleId) &&
      roleIds.indexOf(roleId) === index,
  );

  for (const channelPlan of plan.channels) {
    if (!categoryResult.channel) {
      operations.push(
        makeOperation({
          key: channelPlan.key,
          kind: "channel",
          name: channelPlan.name,
          status: "skipped",
          detail: "The PipHackLup event category was unavailable.",
        }),
      );
      continue;
    }

    const restrictToParticipant = shouldRestrictChannelToParticipant(
      plan.onboardingMode,
      channelPlan,
    );
    if (restrictToParticipant && !roles.participant) {
      operations.push(
        makeOperation({
          key: channelPlan.key,
          kind: "channel",
          name: channelPlan.name,
          status: "failed",
          detail:
            "Gated access requires the PipHackLup Participant role. The channel was not created or changed; fix role setup and rerun /setup.",
        }),
      );
      continue;
    }

    const configuredChannelIds = channelPlan.configKeys
      .map((key) => input.currentConfig.channels[key])
      .filter((channelId): channelId is string => Boolean(channelId));
    const configuredChannel = guildChannels.find(
      (channel) =>
        configuredChannelIds.includes(channel.id) &&
        channel.type === ChannelType.GuildText,
    ) as TextChannel | undefined;
    const matchingChannels = guildChannels.filter(
      (channel) => channel.name === channelPlan.name,
    );
    const reusableChannel =
      configuredChannel ??
      (matchingChannels.find(
        (channel) => channel.type === ChannelType.GuildText,
      ) as TextChannel | undefined);

    if (reusableChannel) {
      const reconciliation = await reconcileExistingTextChannel({
        channel: reusableChannel,
        category: categoryResult.channel,
        plan: channelPlan,
        permissionOverwrites: buildChannelPermissionOverwrites({
          access: channelPlan.access,
          everyoneRoleId: input.guild.roles.everyone.id,
          botMemberId: botMember.id,
          staffRoleIds,
          restrictToParticipant,
          ...(roles.participant
            ? { participantRoleId: roles.participant }
            : {}),
        }),
        obsoleteRoleOverwriteIds: restrictToParticipant
          ? obsoleteParticipantRoleOverwriteIds
          : [],
        enforceExactPermissionOverwrites:
          channelPlan.access === "staff-private" || restrictToParticipant,
        eventName: plan.eventName,
      });
      if (reconciliation.error) {
        operations.push(
          makeOperation({
            key: channelPlan.key,
            kind: "channel",
            name: reusableChannel.name,
            status: "failed",
            id: reusableChannel.id,
            detail: [
              "Found the existing channel, but could not finish making it setup-safe.",
              reconciliation.completed.length > 0
                ? `Completed first: ${reconciliation.completed.join(", ")}.`
                : null,
              reconciliation.error,
              "No panel was posted there.",
            ]
              .filter((part): part is string => Boolean(part))
              .join(" "),
          }),
        );
        continue;
      }

      for (const configKey of channelPlan.configKeys) {
        channels[configKey] = reusableChannel.id;
        resolvedChannels[configKey] = reusableChannel;
        channelWasCreated.set(configKey, false);
      }
      operations.push(
        makeOperation({
          key: channelPlan.key,
          kind: "channel",
          name: reusableChannel.name,
          status: reconciliation.completed.length > 0 ? "updated" : "reused",
          id: reusableChannel.id,
          detail: [
            matchingChannels.length > 1
              ? "Multiple matching channels already existed; reused one and created none."
              : null,
            reconciliation.completed.length > 0
              ? `Refreshed: ${reconciliation.completed.join(", ")}.`
              : null,
          ]
            .filter((part): part is string => Boolean(part))
            .join(" "),
        }),
      );
      continue;
    }

    if (matchingChannels.length > 0) {
      operations.push(
        makeOperation({
          key: channelPlan.key,
          kind: "channel",
          name: channelPlan.name,
          status: "failed",
          detail:
            "A non-text Discord channel already uses this name; no duplicate was created.",
        }),
      );
      continue;
    }

    try {
      const createdChannel = await input.guild.channels.create({
        name: channelPlan.name,
        type: ChannelType.GuildText,
        parent: categoryResult.channel,
        topic: channelPlan.topic,
        permissionOverwrites: buildChannelPermissionOverwrites({
          access: channelPlan.access,
          everyoneRoleId: input.guild.roles.everyone.id,
          botMemberId: botMember.id,
          staffRoleIds,
          restrictToParticipant,
          ...(roles.participant
            ? { participantRoleId: roles.participant }
            : {}),
        }),
        reason: `PipHackLup setup for ${plan.eventName}`,
      });
      guildChannels.push(createdChannel);
      for (const configKey of channelPlan.configKeys) {
        channels[configKey] = createdChannel.id;
        resolvedChannels[configKey] = createdChannel;
        channelWasCreated.set(configKey, true);
      }
      operations.push(
        makeOperation({
          key: channelPlan.key,
          kind: "channel",
          name: createdChannel.name,
          status: "created",
          id: createdChannel.id,
        }),
      );
    } catch (error) {
      operations.push(
        makeOperation({
          key: channelPlan.key,
          kind: "channel",
          name: channelPlan.name,
          status: "failed",
          detail: describeProvisioningError(error),
        }),
      );
    }
  }

  for (const panelPlan of plan.panels) {
    const channel = resolvedChannels[panelPlan.channelKey];
    if (!channel) {
      operations.push(
        makeOperation({
          key: panelPlan.key,
          kind: "panel",
          name: panelPlan.name,
          status: "skipped",
          detail: "Its target channel was unavailable.",
        }),
      );
      continue;
    }

    const resourceKey = panelResourceKey(panelPlan.key);
    const panelOperation = await ensurePanel({
      botMemberId: botMember.id,
      channel,
      channelWasCreated: channelWasCreated.get(panelPlan.channelKey) ?? false,
      plan: panelPlan,
      rememberedMessageId: input.currentConfig.resources?.[resourceKey],
    });
    operations.push(panelOperation);
    if (
      panelOperation.id &&
      !["failed", "skipped"].includes(panelOperation.status)
    ) {
      resources[resourceKey] = panelOperation.id;
    }
  }

  return {
    plan,
    roles,
    channels,
    resources,
    operations,
    missingPermissions: [],
    blockedBeforeChanges: false,
  };
}

export function mergeProvisionedConfig(
  currentConfig: EventConfig,
  result: SetupProvisioningResult,
): EventConfig {
  if (result.blockedBeforeChanges) return { ...currentConfig };

  return {
    ...currentConfig,
    eventName: result.plan.eventName,
    onboardingMode: result.plan.onboardingMode,
    // Setup owns every planned Discord resource. Do not retain a stale ID
    // when live reconciliation rejected that resource as unsafe or failed.
    roles: { ...result.roles },
    channels: { ...result.channels },
    resources: { ...result.resources },
  };
}

export function buildSetupReportSections(
  operations: readonly SetupOperation[],
): SetupReportSection[] {
  const groups = [
    {
      name: "Created",
      operations: operations.filter(
        (operation) => operation.status === "created",
      ),
    },
    {
      name: "Reused or refreshed",
      operations: operations.filter(
        (operation) =>
          operation.status === "reused" || operation.status === "updated",
      ),
    },
    {
      name: "Not created",
      operations: operations.filter(
        (operation) =>
          operation.status === "failed" || operation.status === "skipped",
      ),
    },
  ].filter((group) => group.operations.length > 0);

  return groups.flatMap((group) => {
    const lines = group.operations.map(formatOperationLine);
    const chunks = chunkLines(lines, 1_000);
    return chunks.map((value, index) => ({
      name: `${group.name} (${group.operations.length})${chunks.length > 1 ? ` · ${index + 1}/${chunks.length}` : ""}`,
      value,
    }));
  });
}

export function hasIncompleteSetup(
  operations: readonly SetupOperation[],
): boolean {
  return operations.some(
    (operation) =>
      operation.status === "failed" || operation.status === "skipped",
  );
}

function normalizeEventName(eventName: string): string {
  const normalized = eventName.replace(/\s+/gu, " ").trim() || "Hackathon";
  return normalized.length <= 80 ? normalized : normalized.slice(0, 80);
}

function isReusableRole(
  role: Role | undefined,
  everyoneRoleId: string,
): role is Role {
  return Boolean(role && !role.managed && role.id !== everyoneRoleId);
}

async function ensureSetupActorAccess(input: {
  guild: Guild;
  setupActorId: string;
  organizerRoleId?: string | undefined;
  guildRoles: readonly Role[];
  eventName: string;
}): Promise<{ operation: SetupOperation; managementRoleIds: string[] }> {
  let member;
  try {
    member =
      input.guild.members.cache.get(input.setupActorId) ??
      (await input.guild.members.fetch(input.setupActorId));
  } catch (error) {
    return {
      operation: makeOperation({
        key: "setup-actor-organizer",
        kind: "role",
        name: "Organizer role assignment for the setup caller",
        status: "failed",
        detail: describeProvisioningError(error),
      }),
      managementRoleIds: [],
    };
  }

  const managementRoleIds = getManageGuildRoleIds(
    [...member.roles.cache.values()],
    input.guild.id,
  );
  const operationName = `Organizer role assignment for <@${input.setupActorId}>`;

  if (!input.organizerRoleId) {
    return {
      operation: makeOperation({
        key: "setup-actor-organizer",
        kind: "role",
        name: operationName,
        status: "skipped",
        detail: "The PipHackLup Organizer role was unavailable.",
      }),
      managementRoleIds,
    };
  }

  if (member.roles.cache.has(input.organizerRoleId)) {
    return {
      operation: makeOperation({
        key: "setup-actor-organizer",
        kind: "role",
        name: operationName,
        status: "reused",
        id: input.organizerRoleId,
        detail: "The setup caller already had the Organizer role.",
      }),
      managementRoleIds,
    };
  }

  const organizerRole = input.guildRoles.find(
    (role) => role.id === input.organizerRoleId,
  );
  if (!organizerRole?.editable) {
    return {
      operation: makeOperation({
        key: "setup-actor-organizer",
        kind: "role",
        name: operationName,
        status: "failed",
        id: input.organizerRoleId,
        detail:
          "Discord role hierarchy prevents PipHackLup from assigning the Organizer role. Move the bot role above it and rerun setup.",
      }),
      managementRoleIds,
    };
  }

  try {
    await member.roles.add(
      organizerRole,
      `PipHackLup setup organizer for ${input.eventName}`,
    );
    return {
      operation: makeOperation({
        key: "setup-actor-organizer",
        kind: "role",
        name: operationName,
        status: "updated",
        id: organizerRole.id,
        detail: "Assigned the PipHackLup Organizer role.",
      }),
      managementRoleIds,
    };
  } catch (error) {
    return {
      operation: makeOperation({
        key: "setup-actor-organizer",
        kind: "role",
        name: operationName,
        status: "failed",
        id: organizerRole.id,
        detail: describeProvisioningError(error),
      }),
      managementRoleIds,
    };
  }
}

async function ensureCategory(input: {
  guild: Guild;
  guildChannels: readonly NonThreadGuildBasedChannel[];
  plan: SetupCategoryPlan;
  eventName: string;
  configuredCategoryId?: string | undefined;
}): Promise<{
  channel: CategoryChannel | null;
  operation: SetupOperation;
}> {
  const configuredCategory = input.configuredCategoryId
    ? (input.guildChannels.find(
        (channel) =>
          channel.id === input.configuredCategoryId &&
          channel.type === ChannelType.GuildCategory,
      ) as CategoryChannel | undefined)
    : undefined;
  if (configuredCategory) {
    if (configuredCategory.name === input.plan.name) {
      return {
        channel: configuredCategory,
        operation: makeOperation({
          key: input.plan.key,
          kind: "category",
          name: input.plan.name,
          status: "reused",
          id: configuredCategory.id,
        }),
      };
    }

    try {
      const updatedCategory = await configuredCategory.setName(
        input.plan.name,
        `PipHackLup setup refresh for ${input.eventName}`,
      );
      return {
        channel: updatedCategory,
        operation: makeOperation({
          key: input.plan.key,
          kind: "category",
          name: input.plan.name,
          status: "updated",
          id: updatedCategory.id,
          detail: "Restored the configured event category name.",
        }),
      };
    } catch (error) {
      return {
        channel: configuredCategory,
        operation: makeOperation({
          key: input.plan.key,
          kind: "category",
          name: input.plan.name,
          status: "failed",
          id: configuredCategory.id,
          detail: `Reused the configured category ID, but could not restore its name. ${describeProvisioningError(error)}`,
        }),
      };
    }
  }

  const matchingChannels = input.guildChannels.filter(
    (channel) => channel.name === input.plan.name,
  );
  const existingCategory = matchingChannels.find(
    (channel) => channel.type === ChannelType.GuildCategory,
  ) as CategoryChannel | undefined;

  if (existingCategory) {
    return {
      channel: existingCategory,
      operation: makeOperation({
        key: input.plan.key,
        kind: "category",
        name: input.plan.name,
        status: "reused",
        id: existingCategory.id,
        detail:
          matchingChannels.length > 1
            ? "Multiple matching categories already existed; reused one and created none."
            : undefined,
      }),
    };
  }

  if (matchingChannels.length > 0) {
    return {
      channel: null,
      operation: makeOperation({
        key: input.plan.key,
        kind: "category",
        name: input.plan.name,
        status: "failed",
        detail:
          "A non-category Discord channel already uses this name; no duplicate was created.",
      }),
    };
  }

  try {
    const category = await input.guild.channels.create({
      name: input.plan.name,
      type: ChannelType.GuildCategory,
      reason: `PipHackLup setup for ${input.eventName}`,
    });
    return {
      channel: category,
      operation: makeOperation({
        key: input.plan.key,
        kind: "category",
        name: input.plan.name,
        status: "created",
        id: category.id,
      }),
    };
  } catch (error) {
    return {
      channel: null,
      operation: makeOperation({
        key: input.plan.key,
        kind: "category",
        name: input.plan.name,
        status: "failed",
        detail: describeProvisioningError(error),
      }),
    };
  }
}

async function reconcileExistingTextChannel(input: {
  channel: TextChannel;
  category: CategoryChannel;
  plan: SetupChannelPlan;
  permissionOverwrites: readonly SetupPermissionOverwrite[];
  obsoleteRoleOverwriteIds: readonly string[];
  enforceExactPermissionOverwrites: boolean;
  eventName: string;
}): Promise<{ completed: string[]; error: string | null }> {
  const completed: string[] = [];
  const reason = `PipHackLup setup refresh for ${input.eventName}`;

  try {
    if (input.channel.parentId !== input.category.id) {
      await input.channel.setParent(input.category, {
        lockPermissions: false,
        reason,
      });
      completed.push("moved into the event hub");
    }

    if (input.channel.topic !== input.plan.topic) {
      await input.channel.setTopic(input.plan.topic, reason);
      completed.push("updated the channel topic");
    }

    if (input.enforceExactPermissionOverwrites) {
      if (
        !hasExactPermissionOverwriteSet(
          [...input.channel.permissionOverwrites.cache.values()],
          input.permissionOverwrites,
        )
      ) {
        await input.channel.permissionOverwrites.set(
          input.permissionOverwrites,
          reason,
        );
        completed.push("replaced the channel ACL with the exact safe policy");
      }
    } else {
      for (const obsoleteRoleId of input.obsoleteRoleOverwriteIds) {
        if (!input.channel.permissionOverwrites.cache.has(obsoleteRoleId)) {
          continue;
        }
        await input.channel.permissionOverwrites.delete(obsoleteRoleId, reason);
        completed.push(
          `removed the obsolete participant overwrite for ${obsoleteRoleId}`,
        );
      }

      for (const requiredOverwrite of input.permissionOverwrites) {
        const existingOverwrite = input.channel.permissionOverwrites.cache.get(
          requiredOverwrite.id,
        );
        if (
          isRequiredOverwriteSatisfied(existingOverwrite, requiredOverwrite)
        ) {
          continue;
        }

        await input.channel.permissionOverwrites.edit(
          requiredOverwrite.id,
          toPermissionOverwriteOptions(requiredOverwrite),
          {
            type: requiredOverwrite.type,
            reason,
          },
        );
        completed.push(
          `updated the permission overwrite for ${requiredOverwrite.id}`,
        );
      }
    }

    return { completed, error: null };
  } catch (error) {
    return { completed, error: describeProvisioningError(error) };
  }
}

function toPermissionOverwriteOptions(
  overwrite: Pick<OverwriteData, "allow" | "deny">,
): PermissionOverwriteOptions {
  const options: PermissionOverwriteOptions = {};
  for (const permission of new PermissionsBitField(overwrite.allow).toArray()) {
    options[permission] = true;
  }
  for (const permission of new PermissionsBitField(overwrite.deny).toArray()) {
    options[permission] = false;
  }
  return options;
}

async function ensurePanel(input: {
  botMemberId: string;
  channel: TextChannel;
  channelWasCreated: boolean;
  plan: SetupPanelPlan;
  rememberedMessageId?: string | undefined;
}): Promise<SetupOperation> {
  const payload = buildPanelPayload(input.plan);

  try {
    if (input.channelWasCreated) {
      const message = await input.channel.send(payload);
      return makeOperation({
        key: input.plan.key,
        kind: "panel",
        name: input.plan.name,
        status: "created",
        id: message.id,
      });
    }

    const rememberedMessage = input.rememberedMessageId
      ? await input.channel.messages
          .fetch(input.rememberedMessageId)
          .catch(() => null)
      : null;
    const matchingRememberedMessage =
      rememberedMessage &&
      isMatchingPanelMessage(
        rememberedMessage,
        input.botMemberId,
        input.plan.marker,
      )
        ? rememberedMessage
        : null;
    const existingMessage =
      matchingRememberedMessage ??
      (await findExistingPanelMessage(
        input.channel,
        input.botMemberId,
        input.plan.marker,
      ));

    if (existingMessage) {
      const updatedMessage = await existingMessage.edit(payload);
      return makeOperation({
        key: input.plan.key,
        kind: "panel",
        name: input.plan.name,
        status: "updated",
        id: updatedMessage.id,
      });
    }

    const message = await input.channel.send(payload);
    return makeOperation({
      key: input.plan.key,
      kind: "panel",
      name: input.plan.name,
      status: "created",
      id: message.id,
    });
  } catch (error) {
    return makeOperation({
      key: input.plan.key,
      kind: "panel",
      name: input.plan.name,
      status: "failed",
      detail: describeProvisioningError(error),
    });
  }
}

async function findExistingPanelMessage(
  channel: TextChannel,
  botMemberId: string,
  marker: string,
): Promise<Message<true> | null> {
  let before: string | undefined;

  for (;;) {
    const messages = await channel.messages.fetch(
      before ? { limit: 100, before } : { limit: 100 },
    );
    const match = messages.find((message) =>
      isMatchingPanelMessage(message, botMemberId, marker),
    );
    if (match) return match;
    if (messages.size < 100) return null;

    const oldestMessage = messages.last();
    if (!oldestMessage || oldestMessage.id === before) return null;
    before = oldestMessage.id;
  }
}

function buildPanelPayload(plan: SetupPanelPlan): {
  embeds: EmbedBuilder[];
  components: ReturnType<typeof buildPanelActionRow>[];
  allowedMentions: { parse: [] };
} {
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle(plan.title)
        .setDescription(plan.description)
        .addFields([...plan.fields])
        .setColor(0x2f8fd8)
        .setFooter({ text: plan.marker }),
    ],
    components: [buildPanelActionRow(plan.key === "onboarding")],
    allowedMentions: { parse: [] },
  };
}

function isMatchingPanelMessage(
  message: {
    author: { id: string };
    embeds: readonly { footer: { text: string } | null }[];
  },
  botMemberId: string,
  marker: string,
): boolean {
  return (
    message.author.id === botMemberId &&
    message.embeds.some((embed) => embed.footer?.text === marker)
  );
}

function buildBlockedResult(input: {
  plan: SetupProvisioningPlan;
  operationName: string;
  detail: string;
  missingPermissions?: string[];
}): SetupProvisioningResult {
  const blockedDetail = `Blocked by ${input.operationName.toLowerCase()}.`;
  const operations = [
    makeOperation({
      key: "preflight",
      kind: "preflight",
      name: input.operationName,
      status: "failed",
      detail: input.detail,
    }),
    ...input.plan.roles.map((role) =>
      makeOperation({
        key: role.key,
        kind: "role",
        name: role.name,
        status: "skipped",
        detail: blockedDetail,
      }),
    ),
    makeOperation({
      key: "setup-actor-organizer",
      kind: "role",
      name: "Organizer role assignment for the setup caller",
      status: "skipped",
      detail: blockedDetail,
    }),
    makeOperation({
      key: input.plan.category.key,
      kind: "category",
      name: input.plan.category.name,
      status: "skipped",
      detail: blockedDetail,
    }),
    ...input.plan.channels.map((channel) =>
      makeOperation({
        key: channel.key,
        kind: "channel",
        name: channel.name,
        status: "skipped",
        detail: blockedDetail,
      }),
    ),
    ...input.plan.panels.map((panel) =>
      makeOperation({
        key: panel.key,
        kind: "panel",
        name: panel.name,
        status: "skipped",
        detail: blockedDetail,
      }),
    ),
  ];

  return {
    plan: input.plan,
    roles: {},
    channels: {},
    resources: {},
    operations,
    missingPermissions: input.missingPermissions ?? [],
    blockedBeforeChanges: true,
  };
}

function panelResourceKey(
  panelKey: SetupPanelPlan["key"],
): Exclude<EventResourceKey, "eventCategoryId"> {
  switch (panelKey) {
    case "onboarding":
      return "onboardingPanelMessageId";
    case "help":
      return "helpPanelMessageId";
    case "teams":
      return "teamsPanelMessageId";
  }
}

function makeOperation(input: {
  key: string;
  kind: SetupOperation["kind"];
  name: string;
  status: SetupOperationStatus;
  id?: string | undefined;
  detail?: string | undefined;
}): SetupOperation {
  return {
    key: input.key,
    kind: input.kind,
    name: input.name,
    status: input.status,
    ...(input.id ? { id: input.id } : {}),
    ...(input.detail ? { detail: input.detail } : {}),
  };
}

function describeProvisioningError(error: unknown): string {
  const apiError = error as { code?: number | string; message?: string } | null;
  const code = apiError?.code;
  const message = apiError?.message
    ?.replace(/[\r\n\t]+/gu, " ")
    .replace(/[*_`~>|]/gu, "")
    .trim();
  const description = [
    code === undefined ? null : `Discord error ${String(code)}`,
    message || null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(": ");
  return description
    ? truncate(description, 180)
    : "Discord did not complete this operation.";
}

function formatOperationLine(operation: SetupOperation): string {
  const kind =
    operation.kind === "preflight"
      ? "Preflight"
      : `${operation.kind[0]?.toUpperCase() ?? ""}${operation.kind.slice(1)}`;
  const status =
    operation.status === "failed"
      ? "FAILED · "
      : operation.status === "skipped"
        ? "SKIPPED · "
        : operation.status === "updated"
          ? "REFRESHED · "
          : "";
  const detail = operation.detail ? ` — ${operation.detail}` : "";
  return truncate(`• ${status}${kind}: ${operation.name}${detail}`, 950);
}

function chunkLines(lines: readonly string[], maxLength: number): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length <= maxLength) {
      current = next;
      continue;
    }
    if (current) chunks.push(current);
    current = truncate(line, maxLength);
  }

  if (current) chunks.push(current);
  return chunks;
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, maxLength - 1)}…`;
}
