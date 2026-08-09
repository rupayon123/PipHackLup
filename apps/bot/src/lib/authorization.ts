import { PermissionFlagsBits } from "discord.js";

/** The permission surface exposed by discord.js interaction permission sets. */
export type PermissionSetLike = Readonly<{
  has(permission: bigint): boolean;
}>;

/**
 * Role IDs may come from an API interaction's array or a GuildMember role
 * cache. Sets and discord.js Collections both satisfy the `has` shape.
 */
export type RoleIdSource =
  | readonly string[]
  | Readonly<{ has(roleId: string): boolean }>;

export interface StaffAuthorizationInput {
  readonly permissions?: PermissionSetLike | null | undefined;
  readonly roles?: RoleIdSource | null | undefined;
  readonly configuredRoleIds?:
    | readonly (string | null | undefined)[]
    | null
    | undefined;
}

export interface QueueCloseAuthorizationInput extends StaffAuthorizationInput {
  readonly actorId: string;
  readonly requesterId: string;
}

export interface QueueWorkerAuthorizationInput {
  readonly permissions?: PermissionSetLike | null | undefined;
  readonly roles?: RoleIdSource | null | undefined;
  readonly fullStaffRoleIds?:
    | readonly (string | null | undefined)[]
    | null
    | undefined;
  readonly mentorRoleIds?:
    | readonly (string | null | undefined)[]
    | null
    | undefined;
}

export interface QueueWorkerAuthorization {
  readonly fullStaff: boolean;
  readonly mentorWorker: boolean;
}

export interface QueueTicketAuthorizationInput extends QueueWorkerAuthorization {
  readonly actorId: string;
  readonly requesterId: string;
  readonly kind: string;
}

export function hasManageGuildPermission(
  permissions: PermissionSetLike | null | undefined,
): boolean {
  return permissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

export function isStaffMember(input: StaffAuthorizationInput): boolean {
  if (
    hasManageGuildPermission(input.permissions) ||
    input.permissions?.has(PermissionFlagsBits.ModerateMembers)
  ) {
    return true;
  }

  return hasConfiguredRole(input.roles, input.configuredRoleIds ?? []);
}

export function canCloseQueueTicket(
  input: QueueCloseAuthorizationInput,
): boolean {
  if (isSafeIdentifier(input.actorId) && input.actorId === input.requesterId) {
    return true;
  }

  return isStaffMember(input);
}

export function resolveQueueWorkerAuthorization(
  input: QueueWorkerAuthorizationInput,
): QueueWorkerAuthorization {
  const fullStaff = isStaffMember({
    permissions: input.permissions,
    roles: input.roles,
    configuredRoleIds: input.fullStaffRoleIds,
  });
  return {
    fullStaff,
    mentorWorker: hasConfiguredRole(input.roles, input.mentorRoleIds ?? []),
  };
}

export function canViewQueueTicket(
  input: QueueTicketAuthorizationInput,
): boolean {
  return (
    input.fullStaff ||
    isTicketRequester(input) ||
    (input.mentorWorker && input.kind !== "staff")
  );
}

export function canManageQueueTicket(
  input: Pick<
    QueueTicketAuthorizationInput,
    "fullStaff" | "mentorWorker" | "kind"
  >,
): boolean {
  return input.fullStaff || (input.mentorWorker && input.kind !== "staff");
}

export function canCloseQueueTicketWithWorkerAccess(
  input: QueueTicketAuthorizationInput,
): boolean {
  return isTicketRequester(input) || canManageQueueTicket(input);
}

function memberHasRole(roles: RoleIdSource, roleId: string): boolean {
  return "has" in roles ? roles.has(roleId) : roles.includes(roleId);
}

function hasConfiguredRole(
  roles: RoleIdSource | null | undefined,
  configuredRoleIds: readonly (string | null | undefined)[],
): boolean {
  if (!roles) return false;
  return configuredRoleIds.some(
    (roleId) => isSafeIdentifier(roleId) && memberHasRole(roles, roleId),
  );
}

function isTicketRequester(input: {
  actorId: string;
  requesterId: string;
}): boolean {
  return isSafeIdentifier(input.actorId) && input.actorId === input.requesterId;
}

function isSafeIdentifier(value: string | null | undefined): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.trim() === value
  );
}
