import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

export const panelActionIds = {
  onboarding: "piphacklup:onboarding",
  queues: "piphacklup:queues",
  teams: "piphacklup:teams",
} as const;

export const onboardingRulesAcknowledgementId = "piphacklup:acknowledge-rules";

export type PanelActionId =
  (typeof panelActionIds)[keyof typeof panelActionIds];

const panelActionResponses: Readonly<Record<PanelActionId, string>> = {
  [panelActionIds.onboarding]: [
    "**Start your hackathon onboarding**",
    "1. Run `/onboard checklist` to see what is left.",
    "2. Use `/onboard nickname` and `/onboard profile` to introduce yourself.",
    "3. Read the server rules, then use the team and help panels whenever you need them.",
  ].join("\n"),
  [panelActionIds.queues]: [
    "**Get human help**",
    "Open a mentor, tech, judging, or staff request with `/queue open`.",
    "Use `/queue status` to see the active line. Keep your ticket ID so you or staff can close it when the issue is resolved.",
  ].join("\n"),
  [panelActionIds.teams]: [
    "**Find or form a team**",
    "Use `/team profile` if you are looking for teammates, or `/team create` if you are recruiting for a team.",
    "Run `/team match` for suggestions based on skills and interests.",
  ].join("\n"),
};

export function getPanelActionResponse(customId: string): string | null {
  return Object.hasOwn(panelActionResponses, customId)
    ? panelActionResponses[customId as PanelActionId]
    : null;
}

export function buildPanelActionRow(
  includeRulesAcknowledgement = false,
): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(panelActionIds.onboarding)
      .setLabel("Start onboarding")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(panelActionIds.queues)
      .setLabel("Get help")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(panelActionIds.teams)
      .setLabel("Find a team")
      .setStyle(ButtonStyle.Secondary),
  );
  if (includeRulesAcknowledgement) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(onboardingRulesAcknowledgementId)
        .setLabel("Acknowledge rules")
        .setStyle(ButtonStyle.Success),
    );
  }
  return row;
}
