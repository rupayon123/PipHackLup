import { PermissionFlagsBits, PermissionsBitField } from "discord.js";
import { describe, expect, it } from "vitest";
import {
  isSafeAutomaticAssignmentRole,
  selectReusableAutomaticAssignmentRole,
  selectReusableSensitiveSetupRole,
  type AutomaticAssignmentRoleLike,
} from "../src/lib/automatic-role-safety.js";
import { requiresSafeRoleNameAdoption } from "../src/lib/setup-provisioning.js";

function role(
  id: string,
  options: Partial<{
    managed: boolean;
    editable: boolean;
    permissions: bigint;
    members: number;
  }> = {},
): AutomaticAssignmentRoleLike {
  return {
    id,
    managed: options.managed ?? false,
    editable: options.editable ?? true,
    permissions: new PermissionsBitField(options.permissions ?? 0n),
    members: { size: options.members ?? 0 },
  };
}

describe("automatic assignment role safety", () => {
  it("accepts only editable, unmanaged, zero-permission non-everyone roles", () => {
    expect(isSafeAutomaticAssignmentRole(role("participant"), "everyone")).toBe(
      true,
    );
    expect(
      isSafeAutomaticAssignmentRole(
        role("elevated", { permissions: PermissionFlagsBits.Administrator }),
        "everyone",
      ),
    ).toBe(false);
    expect(
      isSafeAutomaticAssignmentRole(
        role("manager", { permissions: PermissionFlagsBits.ManageGuild }),
        "everyone",
      ),
    ).toBe(false);
    expect(
      isSafeAutomaticAssignmentRole(
        role("managed", { managed: true }),
        "everyone",
      ),
    ).toBe(false);
    expect(
      isSafeAutomaticAssignmentRole(
        role("uneditable", { editable: false }),
        "everyone",
      ),
    ).toBe(false);
    expect(isSafeAutomaticAssignmentRole(role("everyone"), "everyone")).toBe(
      false,
    );
  });

  it("never adopts a hostile elevated exact-name role", () => {
    const hostile = role("hostile-participant", {
      permissions: PermissionFlagsBits.ManageRoles,
    });

    expect(
      selectReusableAutomaticAssignmentRole({
        matchingRoles: [hostile],
        everyoneRoleId: "everyone",
        memberInventoryComplete: true,
      }),
    ).toBeUndefined();
  });

  it("never adopts a broadly assigned role by name", () => {
    const broadlyAssigned = role("broad-newcomer", { members: 42 });

    expect(
      selectReusableAutomaticAssignmentRole({
        matchingRoles: [broadlyAssigned],
        everyoneRoleId: "everyone",
        memberInventoryComplete: true,
      }),
    ).toBeUndefined();
  });

  it("never adopts assigned or elevated organizer and moderator roles by name", () => {
    const assignedOrganizer = role("hostile-organizer", { members: 8 });
    const elevatedModerator = role("hostile-moderator", {
      permissions: PermissionFlagsBits.Administrator,
    });

    expect(
      selectReusableSensitiveSetupRole({
        matchingRoles: [assignedOrganizer],
        everyoneRoleId: "everyone",
        memberInventoryComplete: true,
      }),
    ).toBeUndefined();
    expect(
      selectReusableSensitiveSetupRole({
        matchingRoles: [elevatedModerator],
        everyoneRoleId: "everyone",
        memberInventoryComplete: true,
      }),
    ).toBeUndefined();
  });

  it("never adopts populated or permissioned mentor roles by name", () => {
    const populatedMentor = role("hostile-populated-mentor", { members: 12 });
    const permissionedMentor = role("hostile-permissioned-mentor", {
      permissions: PermissionFlagsBits.ManageGuild,
    });

    expect(requiresSafeRoleNameAdoption("mentor")).toBe(true);
    expect(
      selectReusableSensitiveSetupRole({
        matchingRoles: [populatedMentor, permissionedMentor],
        everyoneRoleId: "everyone",
        memberInventoryComplete: true,
      }),
    ).toBeUndefined();
  });

  it("preserves an explicitly configured safe role with existing legitimate members", () => {
    const configured = role("configured-participant", { members: 42 });

    expect(
      selectReusableAutomaticAssignmentRole({
        configuredRole: configured,
        matchingRoles: [],
        everyoneRoleId: "everyone",
        memberInventoryComplete: false,
      }),
    ).toBe(configured);
  });

  it("fails closed on name adoption when member inventory is incomplete", () => {
    const apparentlyEmpty = role("matching-participant");

    expect(
      selectReusableAutomaticAssignmentRole({
        matchingRoles: [apparentlyEmpty],
        everyoneRoleId: "everyone",
        memberInventoryComplete: false,
      }),
    ).toBeUndefined();
  });
});
