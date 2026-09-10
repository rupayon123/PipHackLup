import {
  buildOnboardingSteps,
  onboardingProgress,
  type EventConfig,
  type OnboardingStep,
} from "@piphacklup/core";

export interface VerifiedOnboardingEvidence {
  hasNickname: boolean;
  participantRoleIds: Iterable<string>;
  hasProfile: boolean;
  hasTeam: boolean;
}

export interface VerifiedOnboardingChecklist {
  steps: OnboardingStep[];
  progress: number;
  summary: string;
}

export function buildVerifiedOnboardingChecklist(
  config: EventConfig,
  evidence: VerifiedOnboardingEvidence,
): VerifiedOnboardingChecklist {
  const roleIds = new Set(evidence.participantRoleIds);
  const participantRoleId = config.roles.participant;
  const hasParticipantRole = participantRoleId
    ? roleIds.has(participantRoleId)
    : false;
  const steps = buildOnboardingSteps(config, {
    hasNickname: evidence.hasNickname,
    hasParticipantRole,
    hasProfile: evidence.hasProfile,
    hasTeam: evidence.hasTeam,
    // The participant role is the durable Discord-native acknowledgement.
    hasReadRules: hasParticipantRole,
  }).map((step) => makeStepTruthful(step, config, hasParticipantRole));
  const progress = onboardingProgress(steps);
  const summary = hasParticipantRole
    ? config.onboardingMode === "gated"
      ? `Progress: **${progress}%**. Your participant role is verified. PipHackLup setup uses that Discord role for gated event-channel access.`
      : `Progress: **${progress}%**. Your participant role and rules acknowledgement are verified in Discord.`
    : config.onboardingMode === "gated"
      ? `Progress: **${progress}%**. Read the rules and use **Acknowledge rules** in the onboarding panel after setting your nickname. Gated event channels remain restricted until Discord grants the participant role.`
      : `Progress: **${progress}%**. Read the rules and use **Acknowledge rules** in the onboarding panel to record acknowledgement with the participant role.`;

  return { steps, progress, summary };
}

function makeStepTruthful(
  step: OnboardingStep,
  config: EventConfig,
  hasParticipantRole: boolean,
): OnboardingStep {
  if (step.id === "rules") {
    const rulesDestination = config.channels.rules
      ? `<#${config.channels.rules}>`
      : "the event rules channel";
    return {
      ...step,
      label: "Read and acknowledge the event rules",
      complete: hasParticipantRole,
      actionHint: hasParticipantRole
        ? `Acknowledgement is recorded by your configured participant role. You can review ${rulesDestination} again at any time.`
        : `Read ${rulesDestination}, then use **Acknowledge rules** in the onboarding panel.`,
    };
  }

  if (step.id === "roles") {
    const participantRoleId = config.roles.participant;
    return {
      ...step,
      label: "Verify your participant role",
      complete: hasParticipantRole,
      actionHint: hasParticipantRole
        ? "Your configured participant role is present in Discord."
        : participantRoleId
          ? `Read the rules, then use **Acknowledge rules** in the onboarding panel to request <@&${participantRoleId}>.`
          : "An organizer has not configured a participant role yet.",
    };
  }

  if (step.id === "team") {
    return {
      ...step,
      actionHint:
        "Use `/team profile` to join the matching pool or `/team create` to publish a recruiting team.",
    };
  }

  return step;
}
