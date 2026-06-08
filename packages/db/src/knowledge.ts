import { and, desc, eq } from "drizzle-orm";
import {
  createKnowledgeEntry,
  defaultKnowledgeSettings,
  type CreateKnowledgeEntryInput,
  type HackathonKnowledgeEntry,
  type KnowledgeAssistantSettings,
} from "@piphacklup/core";
import { getDb, type PipHackLupDb } from "./client.js";
import { guilds, knowledgeEntries, knowledgeSettings } from "./schema.js";

export interface KnowledgeGuildContext {
  id: string;
  name: string;
  eventName?: string;
}

export type KnowledgeSettingsPatch = Partial<
  Omit<
    KnowledgeAssistantSettings,
    "staffRoleId" | "mentorRoleId" | "helpChannelId"
  >
> & {
  staffRoleId?: string | null;
  mentorRoleId?: string | null;
  helpChannelId?: string | null;
};

export function isDatabaseConfigured(): boolean {
  const databaseUrl = process.env.DATABASE_URL;
  return Boolean(
    databaseUrl &&
    !databaseUrl.includes("user:password@host") &&
    !databaseUrl.includes("example.com"),
  );
}

export async function ensureKnowledgeGuild(
  guild: KnowledgeGuildContext,
  db: PipHackLupDb = getDb(),
): Promise<void> {
  const now = new Date();
  await db
    .insert(guilds)
    .values({
      id: guild.id,
      name: guild.name,
      eventName: guild.eventName ?? guild.name,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: guilds.id,
      set: {
        name: guild.name,
        eventName: guild.eventName ?? guild.name,
        updatedAt: now,
      },
    });
}

export async function createKnowledgeEntryInDb(
  input: CreateKnowledgeEntryInput,
  guild: KnowledgeGuildContext,
  db: PipHackLupDb = getDb(),
): Promise<HackathonKnowledgeEntry> {
  await ensureKnowledgeGuild(guild, db);
  const entry = createKnowledgeEntry(input);
  await db.insert(knowledgeEntries).values({
    id: entry.id,
    guildId: entry.guildId,
    title: entry.title,
    answer: entry.answer,
    tags: entry.tags,
    escalationTarget: entry.escalationTarget,
    createdBy: entry.createdBy,
    createdAt: new Date(entry.createdAt),
    updatedAt: new Date(entry.updatedAt),
  });
  return entry;
}

export async function listKnowledgeEntriesFromDb(
  guildId: string,
  db: PipHackLupDb = getDb(),
): Promise<HackathonKnowledgeEntry[]> {
  const rows = await db
    .select()
    .from(knowledgeEntries)
    .where(eq(knowledgeEntries.guildId, guildId))
    .orderBy(desc(knowledgeEntries.updatedAt));
  return rows.map(mapKnowledgeEntry);
}

export async function deleteKnowledgeEntryFromDb(
  guildId: string,
  entryId: string,
  db: PipHackLupDb = getDb(),
): Promise<boolean> {
  const deleted = await db
    .delete(knowledgeEntries)
    .where(
      and(
        eq(knowledgeEntries.guildId, guildId),
        eq(knowledgeEntries.id, entryId),
      ),
    )
    .returning({ id: knowledgeEntries.id });
  return deleted.length > 0;
}

export async function getKnowledgeSettingsFromDb(
  guildId: string,
  db: PipHackLupDb = getDb(),
): Promise<KnowledgeAssistantSettings> {
  const row = await db.query.knowledgeSettings.findFirst({
    where: eq(knowledgeSettings.guildId, guildId),
  });

  if (!row) return { ...defaultKnowledgeSettings };
  return {
    minConfidence: row.minConfidence,
    publicAnswers: row.publicAnswers,
    ...(row.staffRoleId ? { staffRoleId: row.staffRoleId } : {}),
    ...(row.mentorRoleId ? { mentorRoleId: row.mentorRoleId } : {}),
    ...(row.helpChannelId ? { helpChannelId: row.helpChannelId } : {}),
  };
}

export async function updateKnowledgeSettingsInDb(
  guild: KnowledgeGuildContext,
  patch: KnowledgeSettingsPatch,
  db: PipHackLupDb = getDb(),
): Promise<KnowledgeAssistantSettings> {
  await ensureKnowledgeGuild(guild, db);
  const current = await getKnowledgeSettingsFromDb(guild.id, db);
  const settings: KnowledgeAssistantSettings = {
    ...current,
    ...(patch.minConfidence !== undefined
      ? { minConfidence: patch.minConfidence }
      : {}),
    ...(patch.publicAnswers !== undefined
      ? { publicAnswers: patch.publicAnswers }
      : {}),
  };
  applyOptionalSetting(settings, patch, "staffRoleId");
  applyOptionalSetting(settings, patch, "mentorRoleId");
  applyOptionalSetting(settings, patch, "helpChannelId");
  await db
    .insert(knowledgeSettings)
    .values({
      guildId: guild.id,
      minConfidence: settings.minConfidence,
      publicAnswers: settings.publicAnswers,
      staffRoleId: settings.staffRoleId ?? null,
      mentorRoleId: settings.mentorRoleId ?? null,
      helpChannelId: settings.helpChannelId ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: knowledgeSettings.guildId,
      set: {
        minConfidence: settings.minConfidence,
        publicAnswers: settings.publicAnswers,
        staffRoleId: settings.staffRoleId ?? null,
        mentorRoleId: settings.mentorRoleId ?? null,
        helpChannelId: settings.helpChannelId ?? null,
        updatedAt: new Date(),
      },
    });
  return settings;
}

function mapKnowledgeEntry(
  row: typeof knowledgeEntries.$inferSelect,
): HackathonKnowledgeEntry {
  return {
    id: row.id,
    guildId: row.guildId,
    title: row.title,
    answer: row.answer,
    tags: row.tags,
    escalationTarget: row.escalationTarget,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function applyOptionalSetting(
  settings: KnowledgeAssistantSettings,
  patch: KnowledgeSettingsPatch,
  key: "staffRoleId" | "mentorRoleId" | "helpChannelId",
): void {
  if (!(key in patch)) return;
  const value = patch[key];
  if (value) {
    settings[key] = value;
  } else {
    delete settings[key];
  }
}
