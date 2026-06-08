import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const onboardingModeEnum = pgEnum("onboarding_mode", [
  "guided",
  "gated",
]);
export const queueKindEnum = pgEnum("queue_kind", [
  "mentor",
  "tech",
  "judging",
  "staff",
]);
export const queueStatusEnum = pgEnum("queue_status", [
  "open",
  "claimed",
  "escalated",
  "closed",
  "canceled",
]);
export const teamStatusEnum = pgEnum("team_status", [
  "solo",
  "looking",
  "recruiting",
  "full",
  "assigned",
]);
export const moderationActionEnum = pgEnum("moderation_action", [
  "report",
  "note",
  "warn",
  "timeout",
  "kick",
  "ban",
  "resolve",
]);
export const moderationStatusEnum = pgEnum("moderation_status", [
  "open",
  "resolved",
]);
export const knowledgeEscalationTargetEnum = pgEnum(
  "knowledge_escalation_target",
  ["none", "mentor", "staff"],
);

export const guilds = pgTable("guilds", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  eventName: text("event_name").notNull(),
  onboardingMode: onboardingModeEnum("onboarding_mode")
    .notNull()
    .default("guided"),
  teamSizeMin: integer("team_size_min").notNull().default(2),
  teamSizeMax: integer("team_size_max").notNull().default(4),
  roles: jsonb("roles").$type<Record<string, string>>().notNull().default({}),
  channels: jsonb("channels")
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const memberProfiles = pgTable(
  "member_profiles",
  {
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    displayName: text("display_name").notNull(),
    skills: jsonb("skills").$type<string[]>().notNull().default([]),
    interests: jsonb("interests").$type<string[]>().notNull().default([]),
    timezone: text("timezone"),
    beginnerFriendly: boolean("beginner_friendly").notNull().default(true),
    lookingForTeam: boolean("looking_for_team").notNull().default(false),
    preferredTeamSize: integer("preferred_team_size"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.guildId, table.userId] }),
  }),
);

export const teams = pgTable("teams", {
  id: text("id").primaryKey(),
  guildId: text("guild_id")
    .notNull()
    .references(() => guilds.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  status: teamStatusEnum("status").notNull().default("recruiting"),
  ownerId: text("owner_id").notNull(),
  desiredSkills: jsonb("desired_skills")
    .$type<string[]>()
    .notNull()
    .default([]),
  projectIdea: text("project_idea"),
  maxSize: integer("max_size").notNull().default(4),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.teamId, table.userId] }),
  }),
);

export const queueTickets = pgTable(
  "queue_tickets",
  {
    id: text("id").primaryKey(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    kind: queueKindEnum("kind").notNull(),
    status: queueStatusEnum("status").notNull().default("open"),
    requesterId: text("requester_id").notNull(),
    teamId: text("team_id").references(() => teams.id, {
      onDelete: "set null",
    }),
    topic: text("topic").notNull(),
    description: text("description").notNull(),
    priority: integer("priority").notNull().default(1),
    assignedTo: text("assigned_to"),
    transcriptChannelId: text("transcript_channel_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => ({
    guildStatusIdx: uniqueIndex("queue_ticket_guild_id_idx").on(
      table.guildId,
      table.id,
    ),
  }),
);

export const moderationCases = pgTable("moderation_cases", {
  id: text("id").primaryKey(),
  guildId: text("guild_id")
    .notNull()
    .references(() => guilds.id, { onDelete: "cascade" }),
  targetUserId: text("target_user_id").notNull(),
  action: moderationActionEnum("action").notNull(),
  reason: text("reason").notNull(),
  reporterId: text("reporter_id"),
  moderatorId: text("moderator_id"),
  evidenceMessageUrl: text("evidence_message_url"),
  status: moderationStatusEnum("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey(),
  guildId: text("guild_id")
    .notNull()
    .references(() => guilds.id, { onDelete: "cascade" }),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  metadata: jsonb("metadata")
    .$type<Record<string, string | number | boolean>>()
    .notNull()
    .default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const knowledgeEntries = pgTable(
  "knowledge_entries",
  {
    id: text("id").primaryKey(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    answer: text("answer").notNull(),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    escalationTarget: knowledgeEscalationTargetEnum("escalation_target")
      .notNull()
      .default("none"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    guildEntryIdx: uniqueIndex("knowledge_entry_guild_id_idx").on(
      table.guildId,
      table.id,
    ),
  }),
);

export const knowledgeSettings = pgTable("knowledge_settings", {
  guildId: text("guild_id")
    .primaryKey()
    .references(() => guilds.id, { onDelete: "cascade" }),
  minConfidence: integer("min_confidence").notNull().default(45),
  publicAnswers: boolean("public_answers").notNull().default(true),
  staffRoleId: text("staff_role_id"),
  mentorRoleId: text("mentor_role_id"),
  helpChannelId: text("help_channel_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
