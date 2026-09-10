import {
  createKnowledgeEntriesInDb,
  createKnowledgeEntryInDb,
  deleteKnowledgeEntryFromDb,
  getKnowledgeSettingsFromDb,
  listKnowledgeEntriesFromDb,
  updateKnowledgeSettingsInDb,
} from "@piphacklup/db";
import type {
  CreateKnowledgeEntryInput,
  HackathonKnowledgeEntry,
  KnowledgeAssistantSettings,
} from "@piphacklup/core";
import { BotPersistenceError } from "./persistence-error.js";

export async function getTrainingSettings(
  guildId: string,
): Promise<KnowledgeAssistantSettings> {
  return runKnowledgeOperation("load the Q&A settings", () =>
    getKnowledgeSettingsFromDb(guildId),
  );
}

export async function saveTrainingSettings(
  guildId: string,
  guildName: string,
  patch: Partial<KnowledgeAssistantSettings>,
): Promise<KnowledgeAssistantSettings> {
  return runKnowledgeOperation("save the Q&A settings", () =>
    updateKnowledgeSettingsInDb({ id: guildId, name: guildName }, patch),
  );
}

export async function addTrainingEntry(
  input: CreateKnowledgeEntryInput,
  guildName: string,
): Promise<HackathonKnowledgeEntry> {
  return runKnowledgeOperation("save the training entry", () =>
    createKnowledgeEntryInDb(input, {
      id: input.guildId,
      name: guildName,
    }),
  );
}

export async function addTrainingEntries(
  inputs: CreateKnowledgeEntryInput[],
  guildName: string,
): Promise<HackathonKnowledgeEntry[]> {
  if (inputs.length === 0) return [];
  const guildId = inputs[0]!.guildId;
  return runKnowledgeOperation("save the training import", () =>
    createKnowledgeEntriesInDb(inputs, { id: guildId, name: guildName }),
  );
}

export async function listTrainingEntries(
  guildId: string,
): Promise<HackathonKnowledgeEntry[]> {
  return runKnowledgeOperation("load the training entries", () =>
    listKnowledgeEntriesFromDb(guildId),
  );
}

export async function removeTrainingEntry(
  guildId: string,
  entryId: string,
): Promise<boolean> {
  return runKnowledgeOperation("remove the training entry", () =>
    deleteKnowledgeEntryFromDb(guildId, entryId),
  );
}

async function runKnowledgeOperation<T>(
  operation: string,
  callback: () => Promise<T>,
): Promise<T> {
  try {
    return await callback();
  } catch (error) {
    if (error instanceof BotPersistenceError) throw error;
    throw new BotPersistenceError(operation, error);
  }
}
