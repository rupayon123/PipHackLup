import type { Guild } from "discord.js";

export interface RoleNotificationTarget {
  label: string;
  userIds: string[];
  truncated: boolean;
}

const maximumDirectRoleNotifications = 50;

/**
 * Resolve role holders into explicit user mentions. Discord does not notify a
 * non-mentionable role unless the sender has the broad Mention Everyone
 * permission, which PipHackLup deliberately does not request.
 */
export async function resolveRoleNotificationTarget(
  guild: Guild,
  roleId: string | undefined,
  fallbackLabel: string,
): Promise<RoleNotificationTarget> {
  if (!roleId) return fallbackTarget(fallbackLabel);

  try {
    await guild.members.fetch();
    const role = await guild.roles.fetch(roleId);
    if (!role) return fallbackTarget(fallbackLabel);

    const eligibleIds = [...role.members.values()]
      .filter((member) => !member.user.bot)
      .map((member) => member.id);
    const userIds = eligibleIds.slice(0, maximumDirectRoleNotifications);
    if (userIds.length === 0) return fallbackTarget(fallbackLabel);

    return {
      label: userIds.map((userId) => `<@${userId}>`).join(" "),
      userIds,
      truncated: eligibleIds.length > userIds.length,
    };
  } catch {
    return fallbackTarget(fallbackLabel);
  }
}

function fallbackTarget(label: string): RoleNotificationTarget {
  return { label, userIds: [], truncated: false };
}
