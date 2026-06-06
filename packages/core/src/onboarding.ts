import type { EventConfig, OnboardingState, OnboardingStep } from "./types.js";

export function buildOnboardingSteps(
  config: Pick<EventConfig, "onboardingMode">,
  state: OnboardingState
): OnboardingStep[] {
  const gated = config.onboardingMode === "gated";
  return [
    {
      id: "rules",
      label: "Read the event rules",
      complete: state.hasReadRules,
      required: gated,
      actionHint: "Open the rules channel and confirm you understand the event expectations."
    },
    {
      id: "nickname",
      label: "Set your server nickname",
      complete: state.hasNickname,
      required: gated,
      actionHint: "Use /onboard nickname so staff and teammates can recognize you."
    },
    {
      id: "roles",
      label: "Pick the right roles",
      complete: state.hasParticipantRole,
      required: gated,
      actionHint: "Choose participant, mentor, judge, and notification roles from the onboarding panel."
    },
    {
      id: "profile",
      label: "Create your hacker profile",
      complete: state.hasProfile,
      required: false,
      actionHint: "Share your skills, interests, timezone, and whether you are beginner-friendly."
    },
    {
      id: "team",
      label: "Find or create a team",
      complete: state.hasTeam,
      required: false,
      actionHint: "Use /team to browse recruiting teams or join the matching pool."
    }
  ];
}

export function onboardingProgress(steps: OnboardingStep[]): number {
  if (steps.length === 0) return 100;
  return Math.round((steps.filter((step) => step.complete).length / steps.length) * 100);
}

export function canAccessGatedServer(steps: OnboardingStep[]): boolean {
  return steps.every((step) => !step.required || step.complete);
}
