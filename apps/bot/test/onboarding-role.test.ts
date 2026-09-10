import { describe, expect, it } from "vitest";
import { planOnboardingRoleTransition } from "../src/lib/onboarding-role.js";

const baseInput = {
  onboardingMode: "gated" as const,
  hasNickname: true,
  participantRoleId: "participant",
  newcomerRoleId: "newcomer",
  memberRoleIds: ["newcomer"],
  participantRoleAvailable: true,
  participantRoleSafe: true,
  participantRoleManageable: true,
  newcomerRoleManageable: true,
};

describe("planOnboardingRoleTransition", () => {
  it("fails closed when setup has no participant role", () => {
    expect(
      planOnboardingRoleTransition({ ...baseInput, participantRoleId: "" }),
    ).toEqual({ allowed: false, reason: "missing-participant-role" });
  });

  it("blocks gated acknowledgement until the member has a server nickname", () => {
    expect(
      planOnboardingRoleTransition({ ...baseInput, hasNickname: false }),
    ).toEqual({ allowed: false, reason: "nickname-required" });
  });

  it("fails closed when Discord role availability or hierarchy is unsafe", () => {
    expect(
      planOnboardingRoleTransition({
        ...baseInput,
        participantRoleAvailable: false,
      }),
    ).toEqual({ allowed: false, reason: "participant-role-unavailable" });
    expect(
      planOnboardingRoleTransition({
        ...baseInput,
        participantRoleSafe: false,
      }),
    ).toEqual({ allowed: false, reason: "participant-role-unsafe" });
    expect(
      planOnboardingRoleTransition({
        ...baseInput,
        participantRoleManageable: false,
      }),
    ).toEqual({ allowed: false, reason: "participant-role-unmanageable" });
    expect(
      planOnboardingRoleTransition({
        ...baseInput,
        newcomerRoleManageable: false,
      }),
    ).toEqual({ allowed: false, reason: "newcomer-role-unmanageable" });
  });

  it("adds participant and removes newcomer only when both changes are safe", () => {
    expect(planOnboardingRoleTransition(baseInput)).toEqual({
      allowed: true,
      alreadyAcknowledged: false,
      addParticipant: true,
      removeNewcomer: true,
    });
  });

  it("is idempotent for an already acknowledged participant", () => {
    expect(
      planOnboardingRoleTransition({
        ...baseInput,
        hasNickname: false,
        memberRoleIds: ["participant"],
      }),
    ).toEqual({
      allowed: true,
      alreadyAcknowledged: true,
      addParticipant: false,
      removeNewcomer: false,
    });
  });

  it("does not require a nickname in guided mode", () => {
    expect(
      planOnboardingRoleTransition({
        ...baseInput,
        onboardingMode: "guided",
        hasNickname: false,
        memberRoleIds: [],
      }),
    ).toMatchObject({ allowed: true, addParticipant: true });
  });
});
