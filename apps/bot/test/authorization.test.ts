import {
  Collection,
  PermissionFlagsBits,
  PermissionsBitField,
} from "discord.js";
import { describe, expect, it } from "vitest";
import {
  canCloseQueueTicketWithWorkerAccess,
  canCloseQueueTicket,
  canManageQueueTicket,
  canViewQueueTicket,
  hasManageGuildPermission,
  isStaffMember,
  resolveQueueWorkerAuthorization,
} from "../src/lib/authorization.js";

function permissionsWith(...permissions: bigint[]): PermissionsBitField {
  return new PermissionsBitField(permissions);
}

describe("hasManageGuildPermission", () => {
  it("allows Manage Server and Administrator permissions", () => {
    expect(
      hasManageGuildPermission(
        permissionsWith(PermissionFlagsBits.ManageGuild),
      ),
    ).toBe(true);
    expect(
      hasManageGuildPermission(
        permissionsWith(PermissionFlagsBits.Administrator),
      ),
    ).toBe(true);
  });

  it("denies other, empty, and missing permissions", () => {
    expect(
      hasManageGuildPermission(
        permissionsWith(PermissionFlagsBits.ModerateMembers),
      ),
    ).toBe(false);
    expect(hasManageGuildPermission(permissionsWith())).toBe(false);
    expect(hasManageGuildPermission(null)).toBe(false);
    expect(hasManageGuildPermission(undefined)).toBe(false);
  });
});

describe("isStaffMember", () => {
  it("allows members with Manage Server or Moderate Members", () => {
    expect(
      isStaffMember({
        permissions: permissionsWith(PermissionFlagsBits.ManageGuild),
      }),
    ).toBe(true);
    expect(
      isStaffMember({
        permissions: permissionsWith(PermissionFlagsBits.ModerateMembers),
      }),
    ).toBe(true);
  });

  it("allows exact configured role matches from arrays, sets, and role caches", () => {
    expect(
      isStaffMember({
        roles: ["organizer-role"],
        configuredRoleIds: ["organizer-role"],
      }),
    ).toBe(true);
    expect(
      isStaffMember({
        roles: new Set(["moderator-role"]),
        configuredRoleIds: ["moderator-role"],
      }),
    ).toBe(true);
    expect(
      isStaffMember({
        roles: new Collection([["staff-role", { name: "Staff" }]]),
        configuredRoleIds: ["staff-role"],
      }),
    ).toBe(true);
  });

  it("denies unconfigured roles and safely ignores missing role IDs", () => {
    expect(
      isStaffMember({
        permissions: permissionsWith(),
        roles: ["participant-role"],
        configuredRoleIds: ["organizer-role", undefined, null, ""],
      }),
    ).toBe(false);
    expect(
      isStaffMember({
        roles: ["organizer-role"],
        configuredRoleIds: [" organizer-role "],
      }),
    ).toBe(false);
    expect(
      isStaffMember({
        roles: [""],
        configuredRoleIds: [""],
      }),
    ).toBe(false);
  });

  it("denies empty or missing permissions, roles, and configuration", () => {
    expect(isStaffMember({})).toBe(false);
    expect(
      isStaffMember({
        permissions: null,
        roles: null,
        configuredRoleIds: null,
      }),
    ).toBe(false);
    expect(
      isStaffMember({
        permissions: permissionsWith(),
        roles: [],
        configuredRoleIds: [],
      }),
    ).toBe(false);
  });
});

describe("canCloseQueueTicket", () => {
  it("allows the requester to close their own ticket", () => {
    expect(
      canCloseQueueTicket({
        actorId: "requester-user",
        requesterId: "requester-user",
      }),
    ).toBe(true);
  });

  it("allows staff to close another member's ticket", () => {
    expect(
      canCloseQueueTicket({
        actorId: "moderator-user",
        requesterId: "requester-user",
        permissions: permissionsWith(PermissionFlagsBits.ModerateMembers),
      }),
    ).toBe(true);
    expect(
      canCloseQueueTicket({
        actorId: "staff-user",
        requesterId: "requester-user",
        roles: new Collection([["staff-role", {}]]),
        configuredRoleIds: ["staff-role"],
      }),
    ).toBe(true);
  });

  it("denies non-requesters without staff authorization", () => {
    expect(
      canCloseQueueTicket({
        actorId: "participant-user",
        requesterId: "requester-user",
        permissions: permissionsWith(),
        roles: ["participant-role"],
        configuredRoleIds: ["organizer-role"],
      }),
    ).toBe(false);
  });

  it("fails closed for missing identity values", () => {
    expect(
      canCloseQueueTicket({
        actorId: "",
        requesterId: "",
      }),
    ).toBe(false);
  });
});

describe("queue worker authorization", () => {
  it("separates full staff roles from configured mentor roles", () => {
    expect(
      resolveQueueWorkerAuthorization({
        roles: ["config-mentor"],
        fullStaffRoleIds: ["organizer", "moderator", "settings-staff"],
        mentorRoleIds: ["config-mentor", "settings-mentor"],
      }),
    ).toEqual({ fullStaff: false, mentorWorker: true, judgeWorker: false });
    expect(
      resolveQueueWorkerAuthorization({
        roles: ["settings-mentor"],
        mentorRoleIds: ["config-mentor", "settings-mentor"],
      }),
    ).toEqual({ fullStaff: false, mentorWorker: true, judgeWorker: false });
    expect(
      resolveQueueWorkerAuthorization({
        roles: ["settings-staff"],
        fullStaffRoleIds: ["settings-staff"],
        mentorRoleIds: ["settings-mentor"],
      }),
    ).toEqual({ fullStaff: true, mentorWorker: false, judgeWorker: false });
  });

  it("never exposes or delegates another requester's staff ticket to mentors", () => {
    const mentorAccess = {
      fullStaff: false,
      mentorWorker: true,
      judgeWorker: false,
      actorId: "mentor-user",
      requesterId: "safety-requester",
      kind: "staff",
    } as const;

    expect(canViewQueueTicket(mentorAccess)).toBe(false);
    expect(canManageQueueTicket(mentorAccess)).toBe(false);
    expect(canCloseQueueTicketWithWorkerAccess(mentorAccess)).toBe(false);
  });

  it("allows mentors to work non-staff tickets and requesters to retain own-ticket access", () => {
    const mentorTicket = {
      fullStaff: false,
      mentorWorker: true,
      judgeWorker: false,
      actorId: "mentor-user",
      requesterId: "participant-user",
      kind: "mentor",
    } as const;
    expect(canViewQueueTicket(mentorTicket)).toBe(true);
    expect(canManageQueueTicket(mentorTicket)).toBe(true);
    expect(canCloseQueueTicketWithWorkerAccess(mentorTicket)).toBe(true);

    const ownStaffTicket = {
      fullStaff: false,
      mentorWorker: false,
      judgeWorker: false,
      actorId: "participant-user",
      requesterId: "participant-user",
      kind: "staff",
    } as const;
    expect(canViewQueueTicket(ownStaffTicket)).toBe(true);
    expect(canManageQueueTicket(ownStaffTicket)).toBe(false);
    expect(canCloseQueueTicketWithWorkerAccess(ownStaffTicket)).toBe(true);
  });

  it("preserves full staff access to every ticket kind", () => {
    const fullStaff = resolveQueueWorkerAuthorization({
      permissions: permissionsWith(PermissionFlagsBits.ModerateMembers),
    });
    const staffTicket = {
      ...fullStaff,
      actorId: "moderator-user",
      requesterId: "participant-user",
      kind: "staff",
    };

    expect(canViewQueueTicket(staffTicket)).toBe(true);
    expect(canManageQueueTicket(staffTicket)).toBe(true);
    expect(canCloseQueueTicketWithWorkerAccess(staffTicket)).toBe(true);
  });

  it("limits configured judges to judging tickets", () => {
    const judgeAccess = resolveQueueWorkerAuthorization({
      roles: ["judge-role"],
      judgeRoleIds: ["judge-role"],
    });
    expect(judgeAccess).toEqual({
      fullStaff: false,
      mentorWorker: false,
      judgeWorker: true,
    });
    expect(
      canViewQueueTicket({
        ...judgeAccess,
        actorId: "judge-user",
        requesterId: "participant-user",
        kind: "judging",
      }),
    ).toBe(true);
    expect(canManageQueueTicket({ ...judgeAccess, kind: "judging" })).toBe(
      true,
    );
    expect(canManageQueueTicket({ ...judgeAccess, kind: "mentor" })).toBe(
      false,
    );
    expect(
      canViewQueueTicket({
        ...judgeAccess,
        actorId: "judge-user",
        requesterId: "safety-user",
        kind: "staff",
      }),
    ).toBe(false);
  });
});
