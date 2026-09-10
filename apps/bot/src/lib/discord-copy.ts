export function selectAmbientEscalationRoleId(input: {
  target: "mentor" | "staff";
  settings: {
    mentorRoleId?: string | undefined;
    staffRoleId?: string | undefined;
  };
  configRoles: {
    mentor?: string | undefined;
    organizer?: string | undefined;
    moderator?: string | undefined;
  };
}): string | undefined {
  return input.target === "mentor"
    ? (input.settings.mentorRoleId ?? input.configRoles.mentor)
    : (input.settings.staffRoleId ??
        input.configRoles.organizer ??
        input.configRoles.moderator);
}

export function buildWelcomeMessage(memberMention: string): string {
  return `Welcome ${memberMention}! Run \`/onboard checklist\` to verify your nickname and participant role, then see profile and team next steps.`;
}
