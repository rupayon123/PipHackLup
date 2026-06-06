import { createId } from "./ids.js";
import type { ModerationAction, ModerationCase, Snowflake } from "./types.js";

export interface CreateModerationCaseInput {
  guildId: Snowflake;
  targetUserId: Snowflake;
  action: ModerationAction;
  reason: string;
  reporterId?: Snowflake;
  moderatorId?: Snowflake;
  evidenceMessageUrl?: string;
  now?: string;
}

export interface AutoModRuleTemplate {
  name: string;
  goal: string;
  trigger: "keyword" | "spam" | "mention_spam";
  recommendedAction: "block_message" | "send_alert" | "timeout";
  exampleTerms: string[];
}

export function createModerationCase(input: CreateModerationCaseInput): ModerationCase {
  const now = input.now ?? new Date().toISOString();
  const moderationCase: ModerationCase = {
    id: createId("case"),
    guildId: input.guildId,
    targetUserId: input.targetUserId,
    action: input.action,
    reason: input.reason.trim(),
    status: input.action === "report" ? "open" : "resolved",
    createdAt: now,
    updatedAt: now
  };
  if (input.reporterId) moderationCase.reporterId = input.reporterId;
  if (input.moderatorId) moderationCase.moderatorId = input.moderatorId;
  if (input.evidenceMessageUrl) moderationCase.evidenceMessageUrl = input.evidenceMessageUrl;
  return moderationCase;
}

export function resolveModerationCase(
  moderationCase: ModerationCase,
  moderatorId: Snowflake,
  now = new Date().toISOString()
): ModerationCase {
  return { ...moderationCase, moderatorId, status: "resolved", updatedAt: now };
}

export function defaultAutoModTemplates(): AutoModRuleTemplate[] {
  return [
    {
      name: "Hackathon scam and phishing links",
      goal: "Block common scam, fake Nitro, wallet drain, and suspicious invite bait before it reaches participants.",
      trigger: "keyword",
      recommendedAction: "block_message",
      exampleTerms: ["free nitro", "airdrop claim", "verify wallet", "discord.gift"]
    },
    {
      name: "Mass mention protection",
      goal: "Stop raids or accidental everyone/here-style disruption during event day.",
      trigger: "mention_spam",
      recommendedAction: "block_message",
      exampleTerms: ["max_mentions: 8"]
    },
    {
      name: "Spammy message bursts",
      goal: "Reduce repeated text spam in public channels while keeping help channels usable.",
      trigger: "spam",
      recommendedAction: "send_alert",
      exampleTerms: ["repeated text", "excessive caps", "message burst"]
    }
  ];
}
