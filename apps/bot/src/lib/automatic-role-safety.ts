import { PermissionFlagsBits } from "discord.js";
import type { EventConfig } from "@piphacklup/core";

export interface AutomaticAssignmentRoleLike {
  readonly id: string;
  readonly managed: boolean;
  readonly editable: boolean;
  readonly permissions: Readonly<{ bitfield: bigint }>;
  readonly members?: Readonly<{ size: number }>;
}

export interface AutomaticAssignmentChannelLike {
  readonly id: string;
  readonly permissionOverwrites?: {
    readonly cache: {
      values(): Iterable<{
        readonly id: string;
        readonly allow: Readonly<{ bitfield: bigint }>;
      }>;
    };
  };
}

export function isSafeAutomaticAssignmentRole(
  role: AutomaticAssignmentRoleLike | null | undefined,
  everyoneRoleId: string,
  options: Readonly<{ requireNoMembers?: boolean }> = {},
): boolean {
  if (
    !role ||
    role.id === everyoneRoleId ||
    role.managed ||
    !role.editable ||
    role.permissions.bitfield !== 0n
  ) {
    return false;
  }

  return !options.requireNoMembers || role.members?.size === 0;
}

export function hasOnlyAllowedAutomaticRoleChannelGrants(
  roleId: string,
  channels: Iterable<AutomaticAssignmentChannelLike>,
  allowedGrants: ReadonlyMap<string, bigint> = new Map(),
): boolean {
  for (const channel of channels) {
    const overwrite = channel.permissionOverwrites
      ? [...channel.permissionOverwrites.cache.values()].find(
          (candidate) => candidate.id === roleId,
        )
      : undefined;
    if (!overwrite || overwrite.allow.bitfield === 0n) continue;
    const allowed = allowedGrants.get(channel.id) ?? 0n;
    if ((overwrite.allow.bitfield & ~allowed) !== 0n) return false;
  }
  return true;
}

export function allowedAutomaticRoleChannelGrants(
  config: EventConfig,
  role: "newcomer" | "participant",
): ReadonlyMap<string, bigint> {
  if (role === "newcomer" || config.onboardingMode !== "gated") {
    return new Map();
  }

  const read =
    PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ReadMessageHistory;
  const write =
    read | PermissionFlagsBits.SendMessages | PermissionFlagsBits.EmbedLinks;
  const grants = new Map<string, bigint>();
  if (config.channels.announcements) {
    grants.set(config.channels.announcements, read);
  }
  if (config.channels.helpDesk) grants.set(config.channels.helpDesk, write);
  if (config.channels.teamCatalog) {
    grants.set(config.channels.teamCatalog, write);
  }
  return grants;
}

/**
 * Configured sensitive roles may already have legitimate members. Name-only
 * adoption is stricter: setup must have a complete member inventory and the
 * candidate must not already grant access to anyone.
 */
export function selectReusableSensitiveSetupRole<
  RoleLike extends AutomaticAssignmentRoleLike,
>(input: {
  readonly configuredRole?: RoleLike | undefined;
  readonly matchingRoles: readonly RoleLike[];
  readonly everyoneRoleId: string;
  readonly memberInventoryComplete: boolean;
  readonly configuredRoleChannelSafe?: boolean;
  readonly isNameCandidateChannelSafe?: (role: RoleLike) => boolean;
}): RoleLike | undefined {
  if (
    input.configuredRoleChannelSafe !== false &&
    isSafeAutomaticAssignmentRole(input.configuredRole, input.everyoneRoleId)
  ) {
    return input.configuredRole;
  }

  if (!input.memberInventoryComplete) return undefined;

  return input.matchingRoles.find(
    (role) =>
      (input.isNameCandidateChannelSafe?.(role) ?? true) &&
      isSafeAutomaticAssignmentRole(role, input.everyoneRoleId, {
        requireNoMembers: true,
      }),
  );
}

export const selectReusableAutomaticAssignmentRole =
  selectReusableSensitiveSetupRole;
