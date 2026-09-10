import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  createKnowledgeEntriesInDb: vi.fn(),
  createKnowledgeEntryInDb: vi.fn(),
  deleteKnowledgeEntryFromDb: vi.fn(),
  getKnowledgeSettingsFromDb: vi.fn(),
  listKnowledgeEntriesFromDb: vi.fn(),
  updateKnowledgeSettingsInDb: vi.fn(),
}));

vi.mock("@piphacklup/db", () => dbMocks);

import {
  addTrainingEntries,
  getTrainingSettings,
} from "../src/lib/knowledge-store.js";
import { BotPersistenceError } from "../src/lib/persistence-error.js";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("durable knowledge store", () => {
  it("sends an entire validated import through one database bulk call", async () => {
    const inputs = [
      {
        guildId: "guild-knowledge",
        title: "Schedule",
        answer: "Doors open at 9.",
        createdBy: "staff-1",
      },
      {
        guildId: "guild-knowledge",
        title: "Lunch",
        answer: "Lunch is at noon.",
        createdBy: "staff-1",
      },
    ];
    dbMocks.createKnowledgeEntriesInDb.mockResolvedValue(inputs);

    await addTrainingEntries(inputs, "Knowledge Guild");

    expect(dbMocks.createKnowledgeEntriesInDb).toHaveBeenCalledOnce();
    expect(dbMocks.createKnowledgeEntriesInDb).toHaveBeenCalledWith(inputs, {
      id: "guild-knowledge",
      name: "Knowledge Guild",
    });
  });

  it("fails closed instead of returning process-local settings on database failure", async () => {
    dbMocks.getKnowledgeSettingsFromDb.mockRejectedValue(
      new Error("database unavailable"),
    );

    await expect(getTrainingSettings("guild-knowledge")).rejects.toEqual(
      expect.objectContaining({
        name: "BotPersistenceError",
        operation: "load the Q&A settings",
      }),
    );
    await expect(getTrainingSettings("guild-knowledge")).rejects.toBeInstanceOf(
      BotPersistenceError,
    );
  });
});
