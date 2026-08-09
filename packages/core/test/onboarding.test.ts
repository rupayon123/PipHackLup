import { describe, expect, it } from "vitest";
import {
  buildOnboardingSteps,
  canAccessGatedServer,
  onboardingProgress,
} from "../src/index.js";

describe("onboarding", () => {
  it("blocks gated access until required steps are complete", () => {
    const steps = buildOnboardingSteps(
      { onboardingMode: "gated" },
      {
        hasNickname: true,
        hasParticipantRole: false,
        hasProfile: false,
        hasTeam: false,
        hasReadRules: true,
      },
    );

    expect(canAccessGatedServer(steps)).toBe(false);
    expect(onboardingProgress(steps)).toBe(40);
    expect(steps.find((step) => step.id === "roles")).toMatchObject({
      label: "Verify your participant access",
      actionHint:
        "Read the rules and use the server acknowledgement control, or ask an organizer to verify the participant role.",
    });
  });

  it("allows guided access even when optional steps are incomplete", () => {
    const steps = buildOnboardingSteps(
      { onboardingMode: "guided" },
      {
        hasNickname: false,
        hasParticipantRole: false,
        hasProfile: false,
        hasTeam: false,
        hasReadRules: false,
      },
    );

    expect(canAccessGatedServer(steps)).toBe(true);
  });
});
