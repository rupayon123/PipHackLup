import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  EventConfig,
  ModerationCase,
  QueueTicket,
  TeamProfile,
} from "@piphacklup/core";
import type { PipHackLupDb } from "../src/client.js";
import {
  getDiscordInstallationFromDb,
  getGuildConfigFromDb,
  getQueueTicketFromDb,
  listQueueTicketsFromDb,
  listTeamsFromDb,
  markDiscordInstallationInDb,
  saveGuildConfigInDb,
  saveModerationCaseWithAuditInDb,
  saveTeamInDb,
  transitionQueueTicketInDb,
  transitionQueueTicketWithAuditInDb,
} from "../src/operations.js";
import {
  auditEvents,
  discordInstallations,
  guilds,
  moderationCases,
  queueTickets,
  teamMembers,
  teams,
} from "../src/schema.js";

interface SelectCall {
  table: object;
  where?: SQL;
  orderBy: unknown[];
  limit?: number;
}

interface InsertCall {
  table: object;
  values: unknown;
  conflict?: {
    kind: "nothing" | "update";
    config?: unknown;
  };
}

interface DeleteCall {
  table: object;
  where?: SQL;
}

interface UpdateCall {
  table: object;
  values?: unknown;
  where?: SQL;
}

interface FakeDbOptions {
  rowsByTable?: Map<object, unknown[]>;
  installationRow?: unknown;
  guildRow?: unknown;
  updateRows?: unknown[];
  executeRows?: Record<string, unknown>[];
  batchResults?: unknown[];
}

function createFakeDb(options: FakeDbOptions = {}) {
  const rowsByTable = options.rowsByTable ?? new Map<object, unknown[]>();
  const selects: SelectCall[] = [];
  const inserts: InsertCall[] = [];
  const deletes: DeleteCall[] = [];
  const updates: UpdateCall[] = [];
  const batches: unknown[][] = [];
  const executions: SQL[] = [];
  const installationFindOptions: Array<{ where?: SQL }> = [];

  const db = {
    query: {
      discordInstallations: {
        findFirst: vi.fn(async (queryOptions: { where?: SQL }) => {
          installationFindOptions.push(queryOptions);
          return options.installationRow;
        }),
      },
      guilds: {
        findFirst: vi.fn(async () => options.guildRow),
      },
    },
    select: vi.fn(() => {
      let call: SelectCall | undefined;
      const chain = {
        from(table: object) {
          call = { table, orderBy: [] };
          selects.push(call);
          return chain;
        },
        where(where: SQL) {
          if (!call) throw new Error("where() called before from() in fake db");
          call.where = where;
          return chain;
        },
        orderBy(...orderBy: unknown[]) {
          if (!call)
            throw new Error("orderBy() called before from() in fake db");
          call.orderBy = orderBy;
          return chain;
        },
        limit(limit: number) {
          if (!call) throw new Error("limit() called before from() in fake db");
          call.limit = limit;
          return chain;
        },
        then<TResult1 = unknown[], TResult2 = never>(
          onFulfilled?:
            | ((value: unknown[]) => TResult1 | PromiseLike<TResult1>)
            | null,
          onRejected?:
            | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
            | null,
        ) {
          if (!call) {
            return Promise.reject(
              new Error("select query awaited before from() in fake db"),
            ).then(onFulfilled, onRejected);
          }
          return Promise.resolve(rowsByTable.get(call.table) ?? []).then(
            onFulfilled,
            onRejected,
          );
        },
      };
      return chain;
    }),
    insert: vi.fn((table: object) => {
      let call: InsertCall | undefined;
      const chain = {
        values(values: unknown) {
          call = { table, values };
          inserts.push(call);
          return chain;
        },
        select(query: SQL) {
          call = { table, values: query };
          inserts.push(call);
          return chain;
        },
        onConflictDoUpdate(config: unknown) {
          if (!call) {
            throw new Error(
              "onConflictDoUpdate() called before values() in fake db",
            );
          }
          call.conflict = { kind: "update", config };
          return chain;
        },
        onConflictDoNothing() {
          if (!call) {
            throw new Error(
              "onConflictDoNothing() called before values() in fake db",
            );
          }
          call.conflict = { kind: "nothing" };
          return chain;
        },
        returning() {
          return chain;
        },
        then<TResult1 = void, TResult2 = never>(
          onFulfilled?:
            | ((value: void) => TResult1 | PromiseLike<TResult1>)
            | null,
          onRejected?:
            | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
            | null,
        ) {
          return Promise.resolve().then(onFulfilled, onRejected);
        },
      };
      return chain;
    }),
    delete: vi.fn((table: object) => {
      const call: DeleteCall = { table };
      deletes.push(call);
      const chain = {
        where(where: SQL) {
          call.where = where;
          return chain;
        },
        then<TResult1 = void, TResult2 = never>(
          onFulfilled?:
            | ((value: void) => TResult1 | PromiseLike<TResult1>)
            | null,
          onRejected?:
            | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
            | null,
        ) {
          return Promise.resolve().then(onFulfilled, onRejected);
        },
      };
      return chain;
    }),
    update: vi.fn((table: object) => {
      const call: UpdateCall = { table };
      updates.push(call);
      const chain = {
        set(values: unknown) {
          call.values = values;
          return chain;
        },
        where(where: SQL) {
          call.where = where;
          return chain;
        },
        returning: vi.fn(async () => options.updateRows ?? []),
      };
      return chain;
    }),
    batch: vi.fn(async (queries: unknown[]) => {
      batches.push(queries);
      return (
        options.batchResults ??
        queries.map((_, index) =>
          index === 0 ? [{ id: "team-a", guildId: "guild-a" }] : undefined,
        )
      );
    }),
    execute: vi.fn(async (query: SQL) => {
      executions.push(query);
      return { rows: options.executeRows ?? [] };
    }),
  };

  return {
    db: db as unknown as PipHackLupDb,
    batches,
    deletes,
    executions,
    inserts,
    installationFindOptions,
    selects,
    updates,
  };
}

function findSelect(calls: SelectCall[], table: object): SelectCall {
  const call = calls.find((candidate) => candidate.table === table);
  if (!call) throw new Error("Expected select was not recorded");
  return call;
}

function findInsert(calls: InsertCall[], table: object): InsertCall {
  const call = calls.find((candidate) => candidate.table === table);
  if (!call) throw new Error("Expected insert was not recorded");
  return call;
}

function sqlParams(where: SQL | undefined): unknown[] {
  if (!where) throw new Error("Expected a SQL where clause");
  return new PgDialect().sqlToQuery(where).params;
}

function conflictUpdateSet(call: InsertCall): Record<string, unknown> {
  const config = call.conflict?.config as
    | { set?: Record<string, unknown> }
    | undefined;
  if (!config?.set) throw new Error("Expected an update conflict set");
  return config.set;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Discord installation operations", () => {
  it("preserves the original install time on ordinary ready upserts and resets it after removal", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-08-09T16:00:00.000Z");
    vi.setSystemTime(now);
    const { db, inserts } = createFakeDb();

    await markDiscordInstallationInDb(
      { id: "guild-a", name: "Hack North Test" },
      true,
      db,
    );

    const installationInsert = findInsert(inserts, discordInstallations);
    expect(installationInsert.values).toMatchObject({
      guildId: "guild-a",
      installedAt: now,
      removedAt: null,
      lastSeenAt: now,
    });
    const installedAt = conflictUpdateSet(installationInsert).installedAt;
    expect(installedAt).toBeDefined();
    const query = new PgDialect().sqlToQuery(installedAt as SQL);
    expect(query.sql).toContain("case");
    expect(query.sql).toContain("removed_at");
    expect(query.sql).toContain("installed_at");
    expect(query.sql).toContain("else");
    expect(
      query.params.some(
        (parameter) =>
          parameter instanceof Date && parameter.getTime() === now.getTime(),
      ),
    ).toBe(true);
  });

  it("maps installation timestamps and scopes the lookup to the requested guild", async () => {
    const installedAt = new Date("2026-08-09T14:00:00.000Z");
    const lastSeenAt = new Date("2026-08-09T15:30:00.000Z");
    const { db, installationFindOptions } = createFakeDb({
      installationRow: {
        guildId: "guild-a",
        guildName: "Hack North Test",
        installedAt,
        removedAt: null,
        lastSeenAt,
      },
    });

    await expect(getDiscordInstallationFromDb("guild-a", db)).resolves.toEqual({
      guildId: "guild-a",
      guildName: "Hack North Test",
      installed: true,
      installedAt: installedAt.toISOString(),
      lastSeenAt: lastSeenAt.toISOString(),
    });
    expect(installationFindOptions).toHaveLength(1);
    expect(sqlParams(installationFindOptions[0]?.where)).toContain("guild-a");
  });

  it("records a guild-scoped removal without claiming the bot was last seen", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-08-09T16:00:00.000Z");
    vi.setSystemTime(now);
    const { db, inserts } = createFakeDb();

    await markDiscordInstallationInDb(
      { id: "guild-a", name: "Hack North Test" },
      false,
      db,
    );

    expect(findInsert(inserts, guilds).values).toMatchObject({
      id: "guild-a",
      name: "Hack North Test",
    });
    expect(findInsert(inserts, discordInstallations).values).toEqual({
      guildId: "guild-a",
      guildName: "Hack North Test",
      installedAt: null,
      removedAt: now,
      lastSeenAt: null,
      updatedAt: now,
    });
  });
});

describe("guild configuration operations", () => {
  it("loads persisted Discord category and panel resource ids", async () => {
    const { db } = createFakeDb({
      guildRow: {
        id: "guild-a",
        eventName: "Hack North Test",
        onboardingMode: "guided",
        teamSizeMin: 2,
        teamSizeMax: 4,
        roles: { organizer: "role-a" },
        channels: { helpDesk: "channel-a" },
        resources: {
          eventCategoryId: "category-a",
          helpPanelMessageId: "message-a",
        },
      },
    });

    await expect(getGuildConfigFromDb("guild-a", db)).resolves.toMatchObject({
      guildId: "guild-a",
      resources: {
        eventCategoryId: "category-a",
        helpPanelMessageId: "message-a",
      },
    });
  });

  it("persists Discord category and panel resource ids with the guild config", async () => {
    const { db, inserts } = createFakeDb();
    const config: EventConfig = {
      guildId: "guild-a",
      eventName: "Hack North Test",
      onboardingMode: "guided",
      teamSizeMin: 2,
      teamSizeMax: 4,
      queueKinds: ["mentor", "tech", "judging", "staff"],
      roles: {},
      channels: {},
      resources: {
        eventCategoryId: "category-a",
        onboardingPanelMessageId: "message-a",
      },
    };

    await expect(
      saveGuildConfigInDb(config, "Hack North Discord", db),
    ).resolves.toBe(config);
    const guildInsert = findInsert(inserts, guilds);
    expect(guildInsert.values).toMatchObject({
      id: "guild-a",
      resources: config.resources,
    });
    expect(conflictUpdateSet(guildInsert).resources).toEqual(config.resources);
  });
});

describe("team operations", () => {
  it("maps ordered memberships and falls back to the owner for legacy teams", async () => {
    const createdAt = new Date("2026-08-09T10:00:00.000Z");
    const updatedAt = new Date("2026-08-09T11:00:00.000Z");
    const teamRows = [
      {
        id: "team-a",
        guildId: "guild-a",
        name: "Pixel Pioneers",
        status: "recruiting",
        ownerId: "owner-a",
        desiredSkills: ["design"],
        projectIdea: "A kind mentor matcher",
        maxSize: 4,
        createdAt,
        updatedAt,
      },
      {
        id: "team-b",
        guildId: "guild-a",
        name: "Circuit Friends",
        status: "solo",
        ownerId: "owner-b",
        desiredSkills: [],
        projectIdea: null,
        maxSize: 3,
        createdAt,
        updatedAt,
      },
    ];
    const memberships = [
      { teamId: "team-a", userId: "owner-a" },
      { teamId: "team-a", userId: "member-a" },
    ];
    const { db, selects } = createFakeDb({
      rowsByTable: new Map([
        [teams, teamRows],
        [teamMembers, memberships],
      ]),
    });

    await expect(listTeamsFromDb("guild-a", db)).resolves.toEqual([
      {
        id: "team-a",
        guildId: "guild-a",
        name: "Pixel Pioneers",
        status: "recruiting",
        ownerId: "owner-a",
        memberIds: ["owner-a", "member-a"],
        desiredSkills: ["design"],
        projectIdea: "A kind mentor matcher",
        maxSize: 4,
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
      },
      {
        id: "team-b",
        guildId: "guild-a",
        name: "Circuit Friends",
        status: "solo",
        ownerId: "owner-b",
        memberIds: ["owner-b"],
        desiredSkills: [],
        maxSize: 3,
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
      },
    ]);
    expect(sqlParams(findSelect(selects, teams).where)).toContain("guild-a");
    expect(sqlParams(findSelect(selects, teamMembers).where)).toEqual(
      expect.arrayContaining(["team-a", "team-b"]),
    );
  });

  it("stores the authoritative guild id instead of trusting the team payload", async () => {
    const { batches, db, deletes, inserts } = createFakeDb();
    const team: TeamProfile = {
      id: "team-a",
      guildId: "untrusted-payload-guild",
      name: "Pixel Pioneers",
      status: "recruiting",
      ownerId: "owner-a",
      memberIds: ["owner-a", "member-a"],
      desiredSkills: ["design"],
      maxSize: 4,
      createdAt: "2026-08-09T10:00:00.000Z",
      updatedAt: "2026-08-09T11:00:00.000Z",
    };

    await expect(
      saveTeamInDb({ id: "guild-a", name: "Hack North Test" }, team, db),
    ).resolves.toMatchObject({
      guildId: "guild-a",
      memberIds: ["owner-a", "member-a"],
    });

    const teamInsert = findInsert(inserts, teams);
    expect(teamInsert.values).toMatchObject({
      id: "team-a",
      guildId: "guild-a",
      ownerId: "owner-a",
    });
    const teamConflict = teamInsert.conflict?.config as
      | { setWhere?: SQL }
      | undefined;
    expect(sqlParams(teamConflict?.setWhere)).toContain("guild-a");
    const membershipInsert = findInsert(inserts, teamMembers).values as SQL;
    expect(new PgDialect().sqlToQuery(membershipInsert).params).toEqual(
      expect.arrayContaining(["team-a", "guild-a", "owner-a", "member-a"]),
    );
    expect(deletes).toHaveLength(1);
    expect(deletes[0]?.table).toBe(teamMembers);
    expect(sqlParams(deletes[0]?.where)).toEqual(
      expect.arrayContaining(["team-a", "guild-a"]),
    );
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(3);
  });

  it("atomically removes stale memberships and keeps the owner in the replacement set", async () => {
    const { batches, db, inserts } = createFakeDb();
    const team: TeamProfile = {
      id: "team-a",
      guildId: "guild-a",
      name: "Pixel Pioneers",
      status: "recruiting",
      ownerId: "owner-a",
      memberIds: ["member-a", "member-a"],
      desiredSkills: [],
      maxSize: 4,
      createdAt: "2026-08-09T10:00:00.000Z",
      updatedAt: "2026-08-09T11:00:00.000Z",
    };

    await saveTeamInDb({ id: "guild-a", name: "Hack North Test" }, team, db);

    const membershipInsert = findInsert(inserts, teamMembers).values as SQL;
    const membershipParams = new PgDialect().sqlToQuery(
      membershipInsert,
    ).params;
    expect(
      membershipParams.filter((value) => value === "member-a"),
    ).toHaveLength(1);
    expect(membershipParams).toEqual(
      expect.arrayContaining(["team-a", "guild-a", "owner-a"]),
    );
    expect(batches[0]).toHaveLength(3);
  });

  it("fails closed when a team id is already owned by another guild", async () => {
    const { db } = createFakeDb({
      batchResults: [[], undefined, undefined],
    });
    const team: TeamProfile = {
      id: "team-a",
      guildId: "guild-a",
      name: "Pixel Pioneers",
      status: "recruiting",
      ownerId: "owner-a",
      memberIds: ["owner-a"],
      desiredSkills: [],
      maxSize: 4,
      createdAt: "2026-08-09T10:00:00.000Z",
      updatedAt: "2026-08-09T11:00:00.000Z",
    };

    await expect(
      saveTeamInDb({ id: "guild-a", name: "Hack North Test" }, team, db),
    ).rejects.toThrow("already assigned to another guild");
  });
});

describe("queue operations", () => {
  const createdAt = new Date("2026-08-09T12:00:00.000Z");
  const updatedAt = new Date("2026-08-09T12:10:00.000Z");
  const closedAt = new Date("2026-08-09T12:30:00.000Z");

  const queueRow = {
    id: "ticket-a",
    guildId: "guild-a",
    kind: "mentor",
    status: "closed",
    requesterId: "requester-a",
    teamId: "team-a",
    topic: "Pitch feedback",
    description: "Could someone review our pitch?",
    priority: 9,
    assignedTo: "mentor-a",
    transcriptChannelId: "channel-a",
    createdAt,
    updatedAt,
    closedAt,
  };

  const expectedTicket: QueueTicket = {
    id: "ticket-a",
    guildId: "guild-a",
    kind: "mentor",
    status: "closed",
    requesterId: "requester-a",
    teamId: "team-a",
    topic: "Pitch feedback",
    description: "Could someone review our pitch?",
    priority: 3,
    assignedTo: "mentor-a",
    transcriptChannelId: "channel-a",
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    closedAt: closedAt.toISOString(),
  };

  it("maps database rows and clamps out-of-range priorities", async () => {
    const { db, selects } = createFakeDb({
      rowsByTable: new Map([[queueTickets, [queueRow]]]),
    });

    await expect(listQueueTicketsFromDb("guild-a", db)).resolves.toEqual([
      expectedTicket,
    ]);
    expect(sqlParams(findSelect(selects, queueTickets).where)).toContain(
      "guild-a",
    );
  });

  it("uses both guild and ticket ids when loading one ticket", async () => {
    const { db, selects } = createFakeDb({
      rowsByTable: new Map([[queueTickets, [queueRow]]]),
    });

    await expect(
      getQueueTicketFromDb("guild-a", "ticket-a", db),
    ).resolves.toEqual(expectedTicket);
    expect(sqlParams(findSelect(selects, queueTickets).where)).toEqual(
      expect.arrayContaining(["guild-a", "ticket-a"]),
    );
    expect(findSelect(selects, queueTickets).limit).toBe(1);
  });

  it("compares guild, id, prior status, and prior timestamp in one transition update", async () => {
    const priorUpdatedAt = "2026-08-09T12:05:00.000Z";
    const { db, updates } = createFakeDb({ updateRows: [queueRow] });

    await expect(
      transitionQueueTicketInDb(
        "guild-a",
        { id: "ticket-a", status: "open", updatedAt: priorUpdatedAt },
        expectedTicket,
        db,
      ),
    ).resolves.toEqual(expectedTicket);

    expect(updates).toHaveLength(1);
    expect(updates[0]?.table).toBe(queueTickets);
    expect(sqlParams(updates[0]?.where)).toEqual(
      expect.arrayContaining(["guild-a", "ticket-a", "open", priorUpdatedAt]),
    );
  });

  it("returns null for a stale queue transition without overwriting newer state", async () => {
    const { db } = createFakeDb({ updateRows: [] });

    await expect(
      transitionQueueTicketInDb(
        "guild-a",
        {
          id: "ticket-a",
          status: "open",
          updatedAt: "2026-08-09T12:05:00.000Z",
        },
        expectedTicket,
        db,
      ),
    ).resolves.toBeNull();
  });

  it("writes no audit row when an atomic privileged transition is stale", async () => {
    const { db, executions } = createFakeDb({ executeRows: [] });

    await expect(
      transitionQueueTicketWithAuditInDb(
        "guild-a",
        {
          id: "ticket-a",
          status: "open",
          updatedAt: "2026-08-09T12:05:00.000Z",
        },
        expectedTicket,
        {
          guildId: "guild-a",
          actorId: "mentor-a",
          action: "queue.close",
          targetType: "ticket",
          targetId: "ticket-a",
          metadata: { previousStatus: "open", status: "closed" },
        },
        db,
      ),
    ).resolves.toBeNull();

    expect(executions).toHaveLength(1);
    const query = new PgDialect().sqlToQuery(executions[0]!);
    expect(query.sql).toContain("with updated_ticket as");
    expect(query.sql).toContain("inserted_audit as");
    expect(query.sql).toContain('and "status" =');
    expect(query.sql).toContain("from updated_ticket");
    expect(query.params).toEqual(
      expect.arrayContaining(["guild-a", "ticket-a", "open"]),
    );
  });

  it("returns both durable records after an atomic privileged transition", async () => {
    const { db } = createFakeDb({
      executeRows: [{ ticketId: "ticket-a" }],
    });

    await expect(
      transitionQueueTicketWithAuditInDb(
        "guild-a",
        {
          id: "ticket-a",
          status: "open",
          updatedAt: "2026-08-09T12:05:00.000Z",
        },
        expectedTicket,
        {
          guildId: "guild-a",
          actorId: "mentor-a",
          action: "queue.close",
          targetType: "ticket",
          targetId: "ticket-a",
          metadata: { previousStatus: "open", status: "closed" },
          createdAt: "2026-08-09T12:10:00.000Z",
        },
        db,
      ),
    ).resolves.toMatchObject({
      ticket: expectedTicket,
      auditEvent: {
        guildId: "guild-a",
        actorId: "mentor-a",
        action: "queue.close",
        targetType: "ticket",
        targetId: "ticket-a",
        createdAt: "2026-08-09T12:10:00.000Z",
      },
    });
  });

  it("rejects a mismatched atomic queue audit before issuing SQL", async () => {
    const { db, executions } = createFakeDb();

    await expect(
      transitionQueueTicketWithAuditInDb(
        "guild-a",
        {
          id: "ticket-a",
          status: "open",
          updatedAt: "2026-08-09T12:05:00.000Z",
        },
        expectedTicket,
        {
          guildId: "guild-b",
          actorId: "mentor-a",
          action: "queue.close",
          targetType: "ticket",
          targetId: "ticket-a",
          metadata: {},
        },
        db,
      ),
    ).rejects.toThrow("must match the mutation guild");
    expect(executions).toHaveLength(0);
  });
});

describe("moderation durability", () => {
  it("batches a moderation case with its matching privileged audit event", async () => {
    const { batches, db, inserts } = createFakeDb();
    const moderationCase: ModerationCase = {
      id: "case-a",
      guildId: "guild-a",
      targetUserId: "user-a",
      action: "warn",
      reason: "Repeated harassment",
      moderatorId: "moderator-a",
      status: "open",
      createdAt: "2026-08-09T12:00:00.000Z",
      updatedAt: "2026-08-09T12:00:00.000Z",
    };

    await expect(
      saveModerationCaseWithAuditInDb(
        { id: "guild-a", name: "Hack North Test" },
        moderationCase,
        {
          guildId: "guild-a",
          actorId: "moderator-a",
          action: "moderation.warn",
          targetType: "case",
          targetId: "case-a",
          metadata: { status: "open" },
        },
        db,
      ),
    ).resolves.toMatchObject({ moderationCase });

    expect(findInsert(inserts, moderationCases).values).toMatchObject({
      id: "case-a",
      guildId: "guild-a",
    });
    expect(findInsert(inserts, auditEvents).values).toMatchObject({
      guildId: "guild-a",
      targetType: "case",
      targetId: "case-a",
    });
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
  });
});
