export interface AutomaticAssignmentRoleLike {
  readonly id: string;
  readonly managed: boolean;
  readonly editable: boolean;
  readonly permissions: Readonly<{ bitfield: bigint }>;
  readonly members?: Readonly<{ size: number }>;
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
}): RoleLike | undefined {
  if (
    isSafeAutomaticAssignmentRole(input.configuredRole, input.everyoneRoleId)
  ) {
    return input.configuredRole;
  }

  if (!input.memberInventoryComplete) return undefined;

  return input.matchingRoles.find((role) =>
    isSafeAutomaticAssignmentRole(role, input.everyoneRoleId, {
      requireNoMembers: true,
    }),
  );
}

export const selectReusableAutomaticAssignmentRole =
  selectReusableSensitiveSetupRole;
