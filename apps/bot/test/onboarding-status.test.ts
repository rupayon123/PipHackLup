import type { EventConfig } from "@piphacklup/core";
import { describe, expect, it } from "vitest";
import { buildVerifiedOnboardingChecklist } from "../src/lib/onboarding-status.js";

const config: EventConfig = {
  guildId: "guild-onboarding",
  eventName: "Truthful Hack Day",
  onboardingMode: "guided",
  teamSizeMin: 2,
  teamSizeMax: 4,
  queueKinds: ["mentor", "tech", "judging", "staff"],
  roles: { participant: "participant-role" },
  channels: { rules: "rules-channel" },
};

describe("buildVerifiedOnboardingChecklist", () => {
  it("derives participant-role completion from the configured Discord role", () => {
    const verified = buildVerifiedOnboardingChecklist(config, {
      hasNickname: true,
      participantRoleIds: ["participant-role"],
      hasProfile: true,
      hasTeam: false,
    });
    const missing = buildVerifiedOnboardingChecklist(config, {
      hasNickname: true,
      participantRoleIds: ["different-role"],
      hasProfile: true,
      hasTeam: false,
    });

    expect(verified.steps.find((step) => step.id === "roles")?.complete).toBe(
      true,
    );
    expect(missing.steps.find((step) => step.id === "roles")?.complete).toBe(
      false,
    );
    expect(
      missing.steps.find((step) => step.id === "roles")?.actionHint,
    ).toContain("Acknowledge rules");
  });

  it("derives rules acknowledgement only from the participant role", () => {
    const checklist = buildVerifiedOnboardingChecklist(config, {
      hasNickname: true,
      participantRoleIds: ["participant-role"],
      hasProfile: true,
      hasTeam: true,
    });
    const rules = checklist.steps.find((step) => step.id === "rules");

    expect(rules?.complete).toBe(true);
    expect(rules?.actionHint).toContain("participant role");
    expect(checklist.summary).toContain("verified in Discord");

    const missing = buildVerifiedOnboardingChecklist(config, {
      hasNickname: true,
      participantRoleIds: [],
      hasProfile: true,
      hasTeam: true,
    });
    expect(missing.steps.find((step) => step.id === "rules")?.complete).toBe(
      false,
    );
    expect(missing.summary).toContain("Acknowledge rules");
  });

  it("describes gated access as participant-role enforcement", () => {
    const checklist = buildVerifiedOnboardingChecklist(
      { ...config, onboardingMode: "gated" },
      {
        hasNickname: true,
        participantRoleIds: ["participant-role"],
        hasProfile: true,
        hasTeam: true,
      },
    );

    expect(checklist.summary).toContain("participant role is verified");
    expect(checklist.summary).toContain("gated event-channel access");
  });
});
