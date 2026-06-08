export type Snowflake = string;

export type QueueKind = "mentor" | "tech" | "judging" | "staff";

export type QueueStatus =
  | "open"
  | "claimed"
  | "escalated"
  | "closed"
  | "canceled";

export type OnboardingMode = "guided" | "gated";

export type TeamStatus =
  | "solo"
  | "looking"
  | "recruiting"
  | "full"
  | "assigned";

export type ModerationAction =
  | "report"
  | "note"
  | "warn"
  | "timeout"
  | "kick"
  | "ban"
  | "resolve";

export interface EventConfig {
  guildId: Snowflake;
  eventName: string;
  onboardingMode: OnboardingMode;
  teamSizeMin: number;
  teamSizeMax: number;
  queueKinds: QueueKind[];
  roles: {
    newcomer?: Snowflake;
    participant?: Snowflake;
    mentor?: Snowflake;
    judge?: Snowflake;
    organizer?: Snowflake;
    moderator?: Snowflake;
  };
  channels: {
    welcome?: Snowflake;
    rules?: Snowflake;
    announcements?: Snowflake;
    helpDesk?: Snowflake;
    teamCatalog?: Snowflake;
    moderationLog?: Snowflake;
    auditLog?: Snowflake;
  };
}

export interface MemberProfile {
  userId: Snowflake;
  displayName: string;
  skills: string[];
  interests: string[];
  timezone?: string;
  beginnerFriendly: boolean;
  lookingForTeam: boolean;
  preferredTeamSize?: number;
  updatedAt: string;
}

export interface TeamProfile {
  id: string;
  guildId: Snowflake;
  name: string;
  status: TeamStatus;
  ownerId: Snowflake;
  memberIds: Snowflake[];
  desiredSkills: string[];
  projectIdea?: string;
  maxSize: number;
  createdAt: string;
  updatedAt: string;
}

export interface QueueTicket {
  id: string;
  guildId: Snowflake;
  kind: QueueKind;
  status: QueueStatus;
  requesterId: Snowflake;
  teamId?: string;
  topic: string;
  description: string;
  priority: 0 | 1 | 2 | 3;
  assignedTo?: Snowflake;
  transcriptChannelId?: Snowflake;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
}

export interface ModerationCase {
  id: string;
  guildId: Snowflake;
  targetUserId: Snowflake;
  action: ModerationAction;
  reason: string;
  reporterId?: Snowflake;
  moderatorId?: Snowflake;
  evidenceMessageUrl?: string;
  status: "open" | "resolved";
  createdAt: string;
  updatedAt: string;
}

export interface AuditEvent {
  id: string;
  guildId: Snowflake;
  actorId: Snowflake;
  action: string;
  targetType: "guild" | "member" | "team" | "ticket" | "case" | "settings";
  targetId: string;
  metadata: Record<string, string | number | boolean>;
  createdAt: string;
}

export type KnowledgeEscalationTarget = "none" | "mentor" | "staff";

export interface HackathonKnowledgeEntry {
  id: string;
  guildId: Snowflake;
  title: string;
  answer: string;
  tags: string[];
  escalationTarget: KnowledgeEscalationTarget;
  createdBy: Snowflake;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeAssistantSettings {
  minConfidence: number;
  publicAnswers: boolean;
  staffRoleId?: Snowflake;
  mentorRoleId?: Snowflake;
  helpChannelId?: Snowflake;
}

export interface KnowledgeAnswerResult {
  question: string;
  answer: string;
  confidence: number;
  matchedEntry?: HackathonKnowledgeEntry;
  shouldEscalate: boolean;
  escalationTarget: KnowledgeEscalationTarget;
  escalationReason: string;
}

export interface OnboardingState {
  hasNickname: boolean;
  hasParticipantRole: boolean;
  hasProfile: boolean;
  hasTeam: boolean;
  hasReadRules: boolean;
}

export interface OnboardingStep {
  id: "nickname" | "roles" | "profile" | "team" | "rules";
  label: string;
  complete: boolean;
  required: boolean;
  actionHint: string;
}
