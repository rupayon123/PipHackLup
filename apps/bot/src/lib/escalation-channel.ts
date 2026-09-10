import {
  ChannelType,
  OverwriteType,
  PermissionFlagsBits,
  type Guild,
  type TextChannel,
} from "discord.js";

type PermissionSetLike = Readonly<{
  has(permission: bigint, checkAdmin?: boolean): boolean;
}>;

export interface PrivateEscalationOverwriteLike {
  readonly id: string;
  readonly type: OverwriteType;
  readonly allow: PermissionSetLike;
  readonly deny: PermissionSetLike;
}

export function hasVerifiedStaffPrivateAcl(input: {
  readonly everyoneRoleId: string;
  readonly botMemberId: string;
  readonly allowedStaffRoleIds: ReadonlySet<string>;
  readonly overwrites: readonly PrivateEscalationOverwriteLike[];
}): boolean {
  const everyoneOverwrite = input.overwrites.find(
    (overwrite) =>
      overwrite.type === OverwriteType.Role &&
      overwrite.id === input.everyoneRoleId,
  );
  if (
    !everyoneOverwrite?.deny.has(PermissionFlagsBits.ViewChannel, false) ||
    everyoneOverwrite.allow.has(PermissionFlagsBits.ViewChannel, false)
  ) {
    return false;
  }

  const botOverwrite = input.overwrites.find(
    (overwrite) =>
      overwrite.type === OverwriteType.Member &&
      overwrite.id === input.botMemberId,
  );
  if (
    !botOverwrite?.allow.has(PermissionFlagsBits.ViewChannel, false) ||
    !botOverwrite.allow.has(PermissionFlagsBits.SendMessages, false)
  ) {
    return false;
  }

  return input.overwrites.every((overwrite) => {
    if (!overwrite.allow.has(PermissionFlagsBits.ViewChannel, false)) {
      return true;
    }
    if (overwrite.type === OverwriteType.Member) {
      return overwrite.id === input.botMemberId;
    }
    return input.allowedStaffRoleIds.has(overwrite.id);
  });
}

export async function fetchVerifiedStaffPrivateChannel(input: {
  readonly guild: Guild;
  readonly channelId?: string | undefined;
  readonly configuredStaffRoleIds?: readonly (string | undefined)[];
}): Promise<TextChannel | null> {
  if (!input.channelId) return null;

  const channel = await input.guild.channels
    .fetch(input.channelId)
    .catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return null;

  const botMemberId = input.guild.members.me?.id;
  if (!botMemberId) return null;

  const allowedStaffRoleIds = new Set(
    (input.configuredStaffRoleIds ?? []).filter((roleId): roleId is string =>
      Boolean(roleId),
    ),
  );
  for (const role of input.guild.roles.cache.values()) {
    if (
      role.id !== input.guild.roles.everyone.id &&
      (role.permissions.has(PermissionFlagsBits.ManageGuild) ||
        role.permissions.has(PermissionFlagsBits.ModerateMembers))
    ) {
      allowedStaffRoleIds.add(role.id);
    }
  }

  return hasVerifiedStaffPrivateAcl({
    everyoneRoleId: input.guild.roles.everyone.id,
    botMemberId,
    allowedStaffRoleIds,
    overwrites: [...channel.permissionOverwrites.cache.values()],
  })
    ? channel
    : null;
}
