import {
  OverwriteType,
  PermissionFlagsBits,
  PermissionsBitField,
  type OverwriteData,
} from "discord.js";
import type { EventConfig } from "@piphacklup/core";
import { describe, expect, it } from "vitest";
import {
  buildChannelPermissionOverwrites,
  buildSetupProvisioningPlan,
  buildSetupReportSections,
  getManageGuildRoleIds,
  getMissingSetupPermissions,
  hasIncompleteSetup,
  hasExactPermissionOverwriteSet,
  isRequiredOverwriteSatisfied,
  mergeProvisionedConfig,
  shouldRestrictChannelToParticipant,
  setupPermissionRequirements,
  type SetupOperation,
  type SetupProvisioningResult,
} from "../src/lib/setup-provisioning.js";

function hasPermission(
  permissions: OverwriteData["allow"] | OverwriteData["deny"],
  permission: bigint,
): boolean {
  return new PermissionsBitField(permissions).has(permission, false);
}

describe("buildSetupProvisioningPlan", () => {
  it("produces stable, uniquely named event resources and three useful panels", () => {
    const plan = buildSetupProvisioningPlan(
      "  Global   Accessibility Hack Day  ",
      "gated",
    );

    expect(plan.eventName).toBe("Global Accessibility Hack Day");
    expect(plan.onboardingMode).toBe("gated");
    expect(plan.roles).toHaveLength(6);
    expect(plan.channels).toHaveLength(6);
    expect(plan.panels.map((panel) => panel.key)).toEqual([
      "onboarding",
      "help",
      "teams",
    ]);
    expect(new Set(plan.roles.map((role) => role.name)).size).toBe(
      plan.roles.length,
    );
    expect(new Set(plan.channels.map((channel) => channel.name)).size).toBe(
      plan.channels.length,
    );
    expect(plan.channels[0]?.configKeys).toEqual(["welcome", "rules"]);
    expect(
      plan.panels
        .find((panel) => panel.key === "onboarding")
        ?.fields.some((field) => field.value.includes("Acknowledge rules")),
    ).toBe(true);
    expect(
      buildSetupProvisioningPlan("A renamed event", "guided").category.name,
    ).toBe(plan.category.name);
  });

  it("uses a safe fallback and respects the event-name limit", () => {
    expect(buildSetupProvisioningPlan("   ", "guided").eventName).toBe(
      "Hackathon",
    );
    expect(
      buildSetupProvisioningPlan("x".repeat(100), "guided").eventName,
    ).toHaveLength(80);
  });
});

describe("getMissingSetupPermissions", () => {
  it("reports every requirement when the bot member is unavailable", () => {
    expect(getMissingSetupPermissions(null)).toEqual(
      setupPermissionRequirements.map((requirement) => requirement.label),
    );
  });

  it("accepts the exact required set or Administrator", () => {
    expect(
      getMissingSetupPermissions(
        new PermissionsBitField(
          setupPermissionRequirements.map((requirement) => requirement.flag),
        ),
      ),
    ).toEqual([]);
    expect(
      getMissingSetupPermissions(
        new PermissionsBitField(PermissionFlagsBits.Administrator),
      ),
    ).toEqual([]);
  });

  it("names only the permissions that are missing", () => {
    const missing = getMissingSetupPermissions(
      new PermissionsBitField([
        PermissionFlagsBits.ManageRoles,
        PermissionFlagsBits.ManageChannels,
      ]),
    );

    expect(missing).not.toContain("Manage Roles");
    expect(missing).not.toContain("Manage Channels");
    expect(missing).toContain("Manage Nicknames");
    expect(missing).toContain("Moderate Members");
    expect(missing).toContain("Send Messages");
    expect(missing).toContain("Read Message History");
  });

  it("finds only real Manage Server or Administrator roles for staff access", () => {
    expect(
      getManageGuildRoleIds(
        [
          {
            id: "everyone",
            permissions: new PermissionsBitField(
              PermissionFlagsBits.ManageGuild,
            ),
          },
          {
            id: "manager",
            permissions: new PermissionsBitField(
              PermissionFlagsBits.ManageGuild,
            ),
          },
          {
            id: "admin",
            permissions: new PermissionsBitField(
              PermissionFlagsBits.Administrator,
            ),
          },
          {
            id: "participant",
            permissions: new PermissionsBitField(
              PermissionFlagsBits.ViewChannel,
            ),
          },
        ],
        "everyone",
      ),
    ).toEqual(["manager", "admin"]);
  });
});

describe("buildChannelPermissionOverwrites", () => {
  const baseInput = {
    everyoneRoleId: "everyone",
    botMemberId: "bot",
    staffRoleIds: ["staff", "staff"],
  } as const;

  it("keeps staff logs private while allowing the bot and configured staff", () => {
    const overwrites = buildChannelPermissionOverwrites({
      ...baseInput,
      access: "staff-private",
    });
    const everyone = overwrites.find(
      (overwrite) => overwrite.id === "everyone",
    );
    const bot = overwrites.find((overwrite) => overwrite.id === "bot");
    const staff = overwrites.filter((overwrite) => overwrite.id === "staff");

    expect(everyone?.type).toBe(OverwriteType.Role);
    expect(hasPermission(everyone?.deny, PermissionFlagsBits.ViewChannel)).toBe(
      true,
    );
    expect(bot?.type).toBe(OverwriteType.Member);
    expect(hasPermission(bot?.allow, PermissionFlagsBits.SendMessages)).toBe(
      true,
    );
    expect(staff).toHaveLength(1);
    expect(staff[0]?.type).toBe(OverwriteType.Role);
    expect(
      overwrites
        .filter((overwrite) => overwrite.type === OverwriteType.Member)
        .map((overwrite) => overwrite.id),
    ).toEqual(["bot"]);
  });

  it("makes announcement channels readable but read-only for everyone", () => {
    const overwrites = buildChannelPermissionOverwrites({
      ...baseInput,
      access: "public-read-only",
    });
    const everyone = overwrites.find(
      (overwrite) => overwrite.id === "everyone",
    );

    expect(
      hasPermission(everyone?.allow, PermissionFlagsBits.ViewChannel),
    ).toBe(true);
    expect(
      hasPermission(everyone?.allow, PermissionFlagsBits.ReadMessageHistory),
    ).toBe(true);
    expect(
      hasPermission(everyone?.deny, PermissionFlagsBits.SendMessages),
    ).toBe(true);
  });

  it("makes help and team channels usable by participants", () => {
    const overwrites = buildChannelPermissionOverwrites({
      ...baseInput,
      access: "public-conversation",
    });
    const everyone = overwrites.find(
      (overwrite) => overwrite.id === "everyone",
    );

    expect(
      hasPermission(everyone?.allow, PermissionFlagsBits.ViewChannel),
    ).toBe(true);
    expect(
      hasPermission(everyone?.allow, PermissionFlagsBits.SendMessages),
    ).toBe(true);
  });

  it("gates non-welcome public channels to participants while retaining bot and staff access", () => {
    const overwrites = buildChannelPermissionOverwrites({
      ...baseInput,
      access: "public-conversation",
      restrictToParticipant: true,
      participantRoleId: "participant",
    });
    const everyone = overwrites.find(
      (overwrite) => overwrite.id === "everyone",
    );
    const participant = overwrites.find(
      (overwrite) => overwrite.id === "participant",
    );
    const bot = overwrites.find((overwrite) => overwrite.id === "bot");
    const staff = overwrites.find((overwrite) => overwrite.id === "staff");

    expect(hasPermission(everyone?.deny, PermissionFlagsBits.ViewChannel)).toBe(
      true,
    );
    expect(
      hasPermission(participant?.allow, PermissionFlagsBits.ViewChannel),
    ).toBe(true);
    expect(
      hasPermission(participant?.allow, PermissionFlagsBits.SendMessages),
    ).toBe(true);
    expect(hasPermission(bot?.allow, PermissionFlagsBits.SendMessages)).toBe(
      true,
    );
    expect(hasPermission(staff?.allow, PermissionFlagsBits.SendMessages)).toBe(
      true,
    );
  });

  it("keeps gated announcement channels read-only for participants", () => {
    const overwrites = buildChannelPermissionOverwrites({
      ...baseInput,
      access: "public-read-only",
      restrictToParticipant: true,
      participantRoleId: "participant",
    });
    const participant = overwrites.find(
      (overwrite) => overwrite.id === "participant",
    );

    expect(
      hasPermission(participant?.allow, PermissionFlagsBits.ViewChannel),
    ).toBe(true);
    expect(
      hasPermission(participant?.deny, PermissionFlagsBits.SendMessages),
    ).toBe(true);
  });

  it("fails closed when gated permissions lack a participant role", () => {
    expect(() =>
      buildChannelPermissionOverwrites({
        ...baseInput,
        access: "public-conversation",
        restrictToParticipant: true,
      }),
    ).toThrow(/participant role is required/iu);
  });

  it("restricts gated event channels but keeps welcome/rules and staff logs on their intended paths", () => {
    const plan = buildSetupProvisioningPlan("Gated Event", "gated");
    const welcome = plan.channels.find(
      (channel) => channel.key === "welcome-rules",
    )!;
    const help = plan.channels.find((channel) => channel.key === "help-desk")!;
    const staffLog = plan.channels.find(
      (channel) => channel.key === "moderation-log",
    )!;

    expect(shouldRestrictChannelToParticipant("gated", welcome)).toBe(false);
    expect(shouldRestrictChannelToParticipant("gated", help)).toBe(true);
    expect(shouldRestrictChannelToParticipant("gated", staffLog)).toBe(false);
    expect(shouldRestrictChannelToParticipant("guided", help)).toBe(false);
  });

  it("detects when a reused channel still needs a required overwrite", () => {
    const required = buildChannelPermissionOverwrites({
      ...baseInput,
      access: "public-read-only",
    }).find((overwrite) => overwrite.id === "everyone");
    expect(required).toBeDefined();

    expect(
      isRequiredOverwriteSatisfied(
        {
          allow: new PermissionsBitField([
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.ReadMessageHistory,
          ]),
          deny: new PermissionsBitField(PermissionFlagsBits.SendMessages),
        },
        required!,
      ),
    ).toBe(true);
    expect(
      isRequiredOverwriteSatisfied(
        {
          allow: new PermissionsBitField(PermissionFlagsBits.ViewChannel),
          deny: new PermissionsBitField(),
        },
        required!,
      ),
    ).toBe(false);
  });

  it("recognizes already-correct gated overwrites as idempotent", () => {
    const required = buildChannelPermissionOverwrites({
      ...baseInput,
      access: "public-conversation",
      restrictToParticipant: true,
      participantRoleId: "participant",
    });

    for (const overwrite of required) {
      expect(
        isRequiredOverwriteSatisfied(
          {
            allow: new PermissionsBitField(overwrite.allow),
            deny: new PermissionsBitField(overwrite.deny),
          },
          overwrite,
        ),
      ).toBe(true);
    }
  });

  it("rejects a hostile extra View Channel overwrite on a reused private channel", () => {
    const required = buildChannelPermissionOverwrites({
      ...baseInput,
      access: "staff-private",
    });
    const existing = required.map((overwrite) => ({
      id: overwrite.id,
      type: overwrite.type,
      allow: new PermissionsBitField(overwrite.allow),
      deny: new PermissionsBitField(overwrite.deny),
    }));

    expect(hasExactPermissionOverwriteSet(existing, required)).toBe(true);
    expect(
      hasExactPermissionOverwriteSet(
        [
          ...existing,
          {
            id: "hostile-broad-role",
            type: OverwriteType.Role,
            allow: new PermissionsBitField(PermissionFlagsBits.ViewChannel),
            deny: new PermissionsBitField(),
          },
        ],
        required,
      ),
    ).toBe(false);
  });
});

describe("setup result helpers", () => {
  it("keeps only successfully resolved IDs and fails closed on stale resources", () => {
    const currentConfig: EventConfig = {
      guildId: "guild",
      eventName: "Old event",
      onboardingMode: "guided",
      teamSizeMin: 2,
      teamSizeMax: 4,
      queueKinds: ["mentor", "tech", "judging", "staff"],
      roles: { newcomer: "existing-newcomer" },
      channels: { auditLog: "existing-audit" },
    };
    const result: SetupProvisioningResult = {
      plan: buildSetupProvisioningPlan("New event", "gated"),
      roles: { participant: "new-participant" },
      channels: { helpDesk: "new-help" },
      resources: {
        eventCategoryId: "new-category",
        onboardingPanelMessageId: "new-onboarding-panel",
      },
      operations: [],
      missingPermissions: [],
    };

    expect(mergeProvisionedConfig(currentConfig, result)).toMatchObject({
      eventName: "New event",
      onboardingMode: "gated",
      roles: {
        participant: "new-participant",
      },
      channels: {
        helpDesk: "new-help",
      },
      resources: {
        eventCategoryId: "new-category",
        onboardingPanelMessageId: "new-onboarding-panel",
      },
    });
    const merged = mergeProvisionedConfig(currentConfig, result);
    expect(merged.roles.newcomer).toBeUndefined();
    expect(merged.channels.auditLog).toBeUndefined();
  });

  it("preserves a populated configuration when setup is blocked before changes", () => {
    const currentConfig: EventConfig = {
      guildId: "guild-blocked",
      eventName: "Existing event",
      onboardingMode: "gated",
      teamSizeMin: 2,
      teamSizeMax: 4,
      queueKinds: ["mentor", "tech", "judging", "staff"],
      roles: {
        participant: "existing-participant",
        organizer: "existing-organizer",
      },
      channels: {
        moderationLog: "existing-private-log",
        helpDesk: "existing-help",
      },
      resources: { eventCategoryId: "existing-category" },
    };
    const blocked: SetupProvisioningResult = {
      plan: buildSetupProvisioningPlan("Replacement event", "guided"),
      roles: {},
      channels: {},
      resources: {},
      operations: [
        {
          key: "preflight",
          kind: "preflight",
          name: "Bot permission check",
          status: "failed",
        },
      ],
      missingPermissions: ["Manage Roles"],
      blockedBeforeChanges: true,
    };

    expect(mergeProvisionedConfig(currentConfig, blocked)).toEqual(
      currentConfig,
    );
  });

  it("keeps truthful reports within Discord field limits without dropping names", () => {
    const operations: SetupOperation[] = Array.from(
      { length: 18 },
      (_, index) => ({
        key: `resource-${index}`,
        kind: "channel",
        name: `piphacklup-resource-${index}`,
        status: "failed",
        detail: `Discord rejected operation ${index}: ${"detail ".repeat(18)}`,
      }),
    );
    const sections = buildSetupReportSections(operations);
    const rendered = sections.map((section) => section.value).join("\n");

    expect(sections.length).toBeGreaterThan(1);
    expect(sections.every((section) => section.value.length <= 1_024)).toBe(
      true,
    );
    expect(rendered).toContain("piphacklup-resource-0");
    expect(rendered).toContain("piphacklup-resource-17");
    expect(rendered).toContain("FAILED");
    expect(hasIncompleteSetup(operations)).toBe(true);
    expect(
      hasIncompleteSetup([
        { key: "role", kind: "role", name: "Role", status: "reused" },
      ]),
    ).toBe(false);
  });
});
