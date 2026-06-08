CREATE TYPE "public"."knowledge_escalation_target" AS ENUM('none', 'mentor', 'staff');--> statement-breakpoint
CREATE TYPE "public"."moderation_action" AS ENUM('report', 'note', 'warn', 'timeout', 'kick', 'ban', 'resolve');--> statement-breakpoint
CREATE TYPE "public"."moderation_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."onboarding_mode" AS ENUM('guided', 'gated');--> statement-breakpoint
CREATE TYPE "public"."queue_kind" AS ENUM('mentor', 'tech', 'judging', 'staff');--> statement-breakpoint
CREATE TYPE "public"."queue_status" AS ENUM('open', 'claimed', 'escalated', 'closed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."team_status" AS ENUM('solo', 'looking', 'recruiting', 'full', 'assigned');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guilds" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"event_name" text NOT NULL,
	"onboarding_mode" "onboarding_mode" DEFAULT 'guided' NOT NULL,
	"team_size_min" integer DEFAULT 2 NOT NULL,
	"team_size_max" integer DEFAULT 4 NOT NULL,
	"roles" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"channels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"title" text NOT NULL,
	"answer" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"escalation_target" "knowledge_escalation_target" DEFAULT 'none' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"min_confidence" integer DEFAULT 45 NOT NULL,
	"public_answers" boolean DEFAULT true NOT NULL,
	"staff_role_id" text,
	"mentor_role_id" text,
	"help_channel_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_profiles" (
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"display_name" text NOT NULL,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"interests" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"timezone" text,
	"beginner_friendly" boolean DEFAULT true NOT NULL,
	"looking_for_team" boolean DEFAULT false NOT NULL,
	"preferred_team_size" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_profiles_guild_id_user_id_pk" PRIMARY KEY("guild_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "moderation_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"target_user_id" text NOT NULL,
	"action" "moderation_action" NOT NULL,
	"reason" text NOT NULL,
	"reporter_id" text,
	"moderator_id" text,
	"evidence_message_url" text,
	"status" "moderation_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "queue_tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"kind" "queue_kind" NOT NULL,
	"status" "queue_status" DEFAULT 'open' NOT NULL,
	"requester_id" text NOT NULL,
	"team_id" text,
	"topic" text NOT NULL,
	"description" text NOT NULL,
	"priority" integer DEFAULT 1 NOT NULL,
	"assigned_to" text,
	"transcript_channel_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_team_id_user_id_pk" PRIMARY KEY("team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"name" text NOT NULL,
	"status" "team_status" DEFAULT 'recruiting' NOT NULL,
	"owner_id" text NOT NULL,
	"desired_skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"project_idea" text,
	"max_size" integer DEFAULT 4 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_settings" ADD CONSTRAINT "knowledge_settings_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_profiles" ADD CONSTRAINT "member_profiles_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_cases" ADD CONSTRAINT "moderation_cases_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_tickets" ADD CONSTRAINT "queue_tickets_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_tickets" ADD CONSTRAINT "queue_tickets_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_entry_guild_id_idx" ON "knowledge_entries" USING btree ("guild_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "queue_ticket_guild_id_idx" ON "queue_tickets" USING btree ("guild_id","id");