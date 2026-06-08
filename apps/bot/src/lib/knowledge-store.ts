import {
  createKnowledgeEntryInDb,
  deleteKnowledgeEntryFromDb,
  getKnowledgeSettingsFromDb,
  isDatabaseConfigured,
  listKnowledgeEntriesFromDb,
  updateKnowledgeSettingsInDb,
} from "@piphacklup/db";
import type {
  CreateKnowledgeEntryInput,
  HackathonKnowledgeEntry,
  KnowledgeAssistantSettings,
} from "@piphacklup/core";
import {
  createStoredKnowledgeEntry,
  deleteKnowledgeEntry,
  ensureKnowledgeSettings,
  getKnowledgeEntries,
  updateKnowledgeSettings,
} from "./store.js";

export async function getTrainingSettings(
  guildId: string,
): Promise<KnowledgeAssistantSettings> {
  if (isDatabaseConfigured()) return getKnowledgeSettingsFromDb(guildId);
  return ensureKnowledgeSettings(guildId);
}

export async function saveTrainingSettings(
  guildId: string,
  guildName: string,
  patch: Partial<KnowledgeAssistantSettings>,
): Promise<KnowledgeAssistantSettings> {
  if (isDatabaseConfigured()) {
    return updateKnowledgeSettingsInDb({ id: guildId, name: guildName }, patch);
  }
  return updateKnowledgeSettings(guildId, patch);
}

export async function addTrainingEntry(
  input: CreateKnowledgeEntryInput,
  guildName: string,
): Promise<HackathonKnowledgeEntry> {
  if (isDatabaseConfigured()) {
    return createKnowledgeEntryInDb(input, {
      id: input.guildId,
      name: guildName,
    });
  }
  return createStoredKnowledgeEntry(input);
}

export async function listTrainingEntries(
  guildId: string,
): Promise<HackathonKnowledgeEntry[]> {
  if (isDatabaseConfigured()) return listKnowledgeEntriesFromDb(guildId);
  return getKnowledgeEntries(guildId);
}

export async function removeTrainingEntry(
  guildId: string,
  entryId: string,
): Promise<boolean> {
  if (isDatabaseConfigured()) {
    return deleteKnowledgeEntryFromDb(guildId, entryId);
  }
  return deleteKnowledgeEntry(guildId, entryId);
}
