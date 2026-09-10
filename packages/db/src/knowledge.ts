import { and, desc, eq } from "drizzle-orm";
import {
  createKnowledgeEntry,
  defaultKnowledgeSettings,
  type CreateKnowledgeEntryInput,
  type HackathonKnowledgeEntry,
  type KnowledgeAssistantSettings,
} from "@piphacklup/core";
import { getDb, type PipHackLupDb } from "./client.js";
import { ensureGuildInDb } from "./operations.js";
import { knowledgeEntries, knowledgeSettings } from "./schema.js";

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
  await ensureGuildInDb(guild, db);
}

export async function createKnowledgeEntryInDb(
  input: CreateKnowledgeEntryInput,
  guild: KnowledgeGuildContext,
  db: PipHackLupDb = getDb(),
): Promise<HackathonKnowledgeEntry> {
  const entries = await createKnowledgeEntriesInDb([input], guild, db);
  const entry = entries[0];
  if (!entry) throw new Error("Knowledge entry creation returned no entry.");
  return entry;
}

export async function createKnowledgeEntriesInDb(
  inputs: CreateKnowledgeEntryInput[],
  guild: KnowledgeGuildContext,
  db: PipHackLupDb = getDb(),
): Promise<HackathonKnowledgeEntry[]> {
  if (!inputs.length) return [];
  const entries = inputs.map((input) => createKnowledgeEntry(input));
  await ensureKnowledgeGuild(guild, db);
  await db.insert(knowledgeEntries).values(
    entries.map((entry) => ({
      id: entry.id,
      guildId: entry.guildId,
      title: entry.title,
      answer: entry.answer,
      tags: entry.tags,
      escalationTarget: entry.escalationTarget,
      createdBy: entry.createdBy,
      createdAt: new Date(entry.createdAt),
      updatedAt: new Date(entry.updatedAt),
    })),
  );
  return entries;
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
  return mapKnowledgeSettings(row);
}

export async function updateKnowledgeSettingsInDb(
  guild: KnowledgeGuildContext,
  patch: KnowledgeSettingsPatch,
  db: PipHackLupDb = getDb(),
): Promise<KnowledgeAssistantSettings> {
  await ensureKnowledgeGuild(guild, db);
  const settings: KnowledgeAssistantSettings = {
    ...defaultKnowledgeSettings,
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
  const updatedAt = new Date();
  const rows = await db
    .insert(knowledgeSettings)
    .values({
      guildId: guild.id,
      minConfidence: settings.minConfidence,
      publicAnswers: settings.publicAnswers,
      staffRoleId: settings.staffRoleId ?? null,
      mentorRoleId: settings.mentorRoleId ?? null,
      helpChannelId: settings.helpChannelId ?? null,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: knowledgeSettings.guildId,
      set: {
        ...(patch.minConfidence !== undefined
          ? { minConfidence: patch.minConfidence }
          : {}),
        ...(patch.publicAnswers !== undefined
          ? { publicAnswers: patch.publicAnswers }
          : {}),
        ...("staffRoleId" in patch
          ? { staffRoleId: patch.staffRoleId ?? null }
          : {}),
        ...("mentorRoleId" in patch
          ? { mentorRoleId: patch.mentorRoleId ?? null }
          : {}),
        ...("helpChannelId" in patch
          ? { helpChannelId: patch.helpChannelId ?? null }
          : {}),
        updatedAt,
      },
    })
    .returning();
  const row = rows[0];
  if (!row) {
    throw new Error("Knowledge settings update returned no row.");
  }
  return mapKnowledgeSettings(row);
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

function mapKnowledgeSettings(
  row: typeof knowledgeSettings.$inferSelect,
): KnowledgeAssistantSettings {
  return {
    minConfidence: row.minConfidence,
    publicAnswers: row.publicAnswers,
    ...(row.staffRoleId ? { staffRoleId: row.staffRoleId } : {}),
    ...(row.mentorRoleId ? { mentorRoleId: row.mentorRoleId } : {}),
    ...(row.helpChannelId ? { helpChannelId: row.helpChannelId } : {}),
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
