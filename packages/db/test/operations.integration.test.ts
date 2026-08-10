import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ModerationCase, QueueTicket } from "@piphacklup/core";
import type { PipHackLupDb } from "../src/client.js";
import {
  getQueueTicketFromDb,
  saveModerationCaseInDb,
  saveModerationCaseWithAuditInDb,
  saveQueueTicketInDb,
} from "../src/operations.js";
import {
  auditEvents,
  guilds,
  moderationCases,
  queueTickets,
} from "../src/schema.js";
import * as schema from "../src/schema.js";

const integrationDatabaseUrl = process.env.PIPHACKLUP_INTEGRATION_DATABASE_URL;
const integrationDescribe = integrationDatabaseUrl ? describe : describe.skip;

integrationDescribe("guild isolation on PostgreSQL", () => {
  let client: ReturnType<typeof postgres>;
  let db: PipHackLupDb;

  beforeAll(async () => {
    client = postgres(integrationDatabaseUrl!, { max: 1 });
    db = drizzle(client, { schema }) as unknown as PipHackLupDb;
    await clearRows();
  });

  afterAll(async () => {
    if (!client) return;
    await clearRows();
    await client.end({ timeout: 5 });
  });

  async function clearRows() {
    await db.delete(auditEvents);
    await db.delete(moderationCases);
    await db.delete(queueTickets);
    await db.delete(guilds);
  }

  it("rejects a cross-guild queue id collision and preserves same-guild updates", async () => {
    const first: QueueTicket = {
      id: "queue-shared-id",
      guildId: "guild-a",
      kind: "mentor",
      status: "open",
      requesterId: "requester-a",
      topic: "Original guild A topic",
      description: "Original guild A description",
      priority: 1,
      createdAt: "2026-08-09T12:00:00.000Z",
      updatedAt: "2026-08-09T12:00:00.000Z",
    };
    await saveQueueTicketInDb({ id: "guild-a", name: "Guild A" }, first, db);

    await expect(
      saveQueueTicketInDb(
        { id: "guild-b", name: "Guild B" },
        {
          ...first,
          guildId: "guild-b",
          requesterId: "requester-b",
          topic: "Malicious guild B overwrite",
          description: "Must never replace guild A",
        },
        db,
      ),
    ).rejects.toThrow("Queue ticket id is already assigned to another guild");

    await expect(
      getQueueTicketFromDb("guild-a", first.id, db),
    ).resolves.toMatchObject({
      guildId: "guild-a",
      requesterId: "requester-a",
      topic: "Original guild A topic",
    });
    await expect(
      getQueueTicketFromDb("guild-b", first.id, db),
    ).resolves.toBeNull();

    await expect(
      saveQueueTicketInDb(
        { id: "guild-a", name: "Guild A" },
        {
          ...first,
          topic: "Legitimate guild A update",
          updatedAt: "2026-08-09T12:01:00.000Z",
        },
        db,
      ),
    ).resolves.toMatchObject({
      guildId: "guild-a",
      topic: "Legitimate guild A update",
    });
  });

  it("rejects cross-guild moderation collisions without writing an audit", async () => {
    const first: ModerationCase = {
      id: "case-shared-id",
      guildId: "guild-a",
      targetUserId: "target-a",
      action: "warn",
      reason: "Original guild A reason",
      moderatorId: "moderator-a",
      status: "open",
      createdAt: "2026-08-09T12:00:00.000Z",
      updatedAt: "2026-08-09T12:00:00.000Z",
    };
    await saveModerationCaseWithAuditInDb(
      { id: "guild-a", name: "Guild A" },
      first,
      {
        guildId: "guild-a",
        actorId: "moderator-a",
        action: "moderation.warn",
        targetType: "case",
        targetId: first.id,
        metadata: { status: "open" },
      },
      db,
    );

    const collision = {
      ...first,
      guildId: "guild-b",
      targetUserId: "target-b",
      reason: "Malicious guild B overwrite",
      moderatorId: "moderator-b",
    };
    await expect(
      saveModerationCaseWithAuditInDb(
        { id: "guild-b", name: "Guild B" },
        collision,
        {
          guildId: "guild-b",
          actorId: "moderator-b",
          action: "moderation.warn",
          targetType: "case",
          targetId: collision.id,
          metadata: {},
        },
        db,
      ),
    ).rejects.toThrow(
      "Moderation case id is already assigned to another guild",
    );

    const savedCases = await db
      .select()
      .from(moderationCases)
      .where(eq(moderationCases.id, first.id));
    expect(savedCases).toHaveLength(1);
    expect(savedCases[0]).toMatchObject({
      guildId: "guild-a",
      targetUserId: "target-a",
      reason: "Original guild A reason",
    });
    const savedAudits = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.targetType, "case"),
          eq(auditEvents.targetId, first.id),
        ),
      );
    expect(savedAudits).toHaveLength(1);
    expect(savedAudits[0]?.guildId).toBe("guild-a");

    await expect(
      saveModerationCaseInDb(
        { id: "guild-b", name: "Guild B" },
        { ...collision, id: first.id },
        db,
      ),
    ).rejects.toThrow(
      "Moderation case id is already assigned to another guild",
    );
  });
});
