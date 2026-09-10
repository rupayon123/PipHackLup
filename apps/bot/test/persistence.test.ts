import type {
  AuditEvent,
  EventConfig,
  MemberProfile,
  ModerationCase,
  QueueTicket,
  TeamProfile,
} from "@piphacklup/core";
import type { GuildDashboardData, GuildIdentity } from "@piphacklup/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BotPersistenceError,
  buildMemberProfile,
  hydrateGuildOperationalState,
  initializeGuildPersistence,
  listPersistentQueueTickets,
  loadPersistentGuildConfig,
  loadPersistentQueueTicket,
  markGuildInstallation,
  persistAuditEvent,
  persistMemberProfile,
  persistModerationCase,
  persistModerationCaseWithAudit,
  persistQueueTicket,
  persistTeam,
  transitionPersistentQueueTicket,
  transitionPersistentQueueTicketWithAudit,
  verifyDatabaseConnection,
  type BotPersistenceDependencies,
} from "../src/lib/persistence.js";
import { profileKey, store } from "../src/lib/store.js";

const config: EventConfig = {
  guildId: "guild-1",
  eventName: "Durable Hack Day",
  onboardingMode: "guided",
  teamSizeMin: 2,
  teamSizeMax: 4,
  queueKinds: ["mentor", "tech", "judging", "staff"],
  roles: { organizer: "role-organizer" },
  channels: { helpDesk: "channel-help" },
};

const profile: MemberProfile = {
  userId: "user-1",
  displayName: "Participant One",
  skills: ["typescript"],
  interests: ["accessibility"],
  beginnerFriendly: true,
  lookingForTeam: true,
  updatedAt: "2026-08-09T12:00:00.000Z",
};

const team: TeamProfile = {
  id: "team-1",
  guildId: "guild-1",
  name: "Durable Team",
  status: "recruiting",
  ownerId: "user-1",
  memberIds: ["user-1"],
  desiredSkills: ["design"],
  maxSize: 4,
  createdAt: "2026-08-09T12:00:00.000Z",
  updatedAt: "2026-08-09T12:00:00.000Z",
};

const ticket: QueueTicket = {
  id: "ticket-1",
  guildId: "guild-1",
  kind: "mentor",
  status: "open",
  requesterId: "user-1",
  topic: "Need a mentor",
  description: "Help us validate the prototype.",
  priority: 2,
  createdAt: "2026-08-09T12:00:00.000Z",
  updatedAt: "2026-08-09T12:00:00.000Z",
};

const moderationCase: ModerationCase = {
  id: "case-1",
  guildId: "guild-1",
  targetUserId: "user-2",
  action: "report",
  reason: "Safety concern",
  reporterId: "user-1",
  status: "open",
  createdAt: "2026-08-09T12:00:00.000Z",
  updatedAt: "2026-08-09T12:00:00.000Z",
};

const snapshot: GuildDashboardData = {
  config,
  profiles: [profile],
  teams: [team],
  tickets: [ticket],
  moderationCases: [moderationCase],
};

function createDependencies(
  overrides: Partial<BotPersistenceDependencies> = {},
): BotPersistenceDependencies {
  const dependencies = {
    createAuditEventInDb: vi.fn(),
    getGuildConfigFromDb: vi.fn().mockResolvedValue(config),
    getGuildDashboardDataFromDb: vi.fn().mockResolvedValue(snapshot),
    getQueueTicketFromDb: vi.fn().mockResolvedValue(ticket),
    listQueueTicketsFromDb: vi.fn().mockResolvedValue([ticket]),
    markDiscordInstallationInDb: vi.fn().mockResolvedValue(undefined),
    saveGuildConfigInDb: vi
      .fn()
      .mockImplementation(async (saved: EventConfig) => saved),
    saveModerationCaseInDb: vi
      .fn()
      .mockImplementation(async (_guild, saved: ModerationCase) => saved),
    saveModerationCaseWithAuditInDb: vi
      .fn()
      .mockImplementation(async (_guild, saved: ModerationCase) => ({
        moderationCase: saved,
        auditEvent: {
          id: "audit-case",
          guildId: saved.guildId,
          actorId: "staff-1",
          action: "mod.warn",
          targetType: "case",
          targetId: saved.id,
          metadata: {},
          createdAt: "2026-08-09T14:00:00.000Z",
        },
      })),
    saveQueueTicketInDb: vi
      .fn()
      .mockImplementation(async (_guild, saved: QueueTicket) => saved),
    saveTeamInDb: vi
      .fn()
      .mockImplementation(async (_guild, saved: TeamProfile) => saved),
    transitionQueueTicketInDb: vi
      .fn()
      .mockImplementation(
        async (_guildId, _expected, saved: QueueTicket) => saved,
      ),
    transitionQueueTicketWithAuditInDb: vi
      .fn()
      .mockImplementation(async (_guildId, _expected, saved: QueueTicket) => ({
        ticket: saved,
        auditEvent: {
          id: "audit-ticket",
          guildId: saved.guildId,
          actorId: "staff-1",
          action: "queue.claim",
          targetType: "ticket",
          targetId: saved.id,
          metadata: {},
          createdAt: "2026-08-09T14:00:00.000Z",
        },
      })),
    upsertMemberProfileInDb: vi
      .fn()
      .mockImplementation(async (_guild, saved: MemberProfile) => saved),
    verifyDatabaseSchema: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return dependencies as BotPersistenceDependencies;
}

beforeEach(() => {
  store.configs.clear();
  store.members.clear();
  store.teams.clear();
  store.tickets.clear();
  store.cases.clear();
});

describe("guild persistence hydration", () => {
  it("verifies the current database schema before bot startup", async () => {
    const dependencies = createDependencies();

    await verifyDatabaseConnection(dependencies);

    expect(dependencies.verifyDatabaseSchema).toHaveBeenCalledOnce();
  });

  it("atomically replaces one guild cache while preserving another guild", async () => {
    store.configs.set("guild-1", { ...config, eventName: "Stale" });
    store.configs.set("guild-2", { ...config, guildId: "guild-2" });
    store.tickets.set("stale-ticket", {
      ...ticket,
      id: "stale-ticket",
    });
    store.tickets.set("other-ticket", {
      ...ticket,
      id: "other-ticket",
      guildId: "guild-2",
    });
    const dependencies = createDependencies();

    await hydrateGuildOperationalState("guild-1", dependencies);

    expect(store.configs.get("guild-1")).toEqual(config);
    expect(store.configs.has("guild-2")).toBe(true);
    expect(store.tickets.has("stale-ticket")).toBe(false);
    expect(store.tickets.get("ticket-1")).toEqual(ticket);
    expect(store.tickets.has("other-ticket")).toBe(true);
    expect(dependencies.getGuildDashboardDataFromDb).toHaveBeenCalledWith(
      "guild-1",
    );
  });

  it("records installation before hydrating on startup or guild join", async () => {
    const dependencies = createDependencies();

    await initializeGuildPersistence(
      { id: "guild-1", name: "Durable Hack Day" },
      dependencies,
    );

    expect(dependencies.markDiscordInstallationInDb).toHaveBeenCalledWith(
      { id: "guild-1", name: "Durable Hack Day" },
      true,
    );
    const markOrder = vi.mocked(dependencies.markDiscordInstallationInDb).mock
      .invocationCallOrder[0];
    const hydrateOrder = vi.mocked(dependencies.getGuildDashboardDataFromDb)
      .mock.invocationCallOrder[0];
    expect(markOrder).toBeLessThan(hydrateOrder!);
  });

  it("records a guild removal without invoking any event-data write", async () => {
    const dependencies = createDependencies();

    await markGuildInstallation(
      { id: "guild-1", name: "Durable Hack Day" },
      false,
      dependencies,
    );

    expect(dependencies.markDiscordInstallationInDb).toHaveBeenCalledWith(
      { id: "guild-1", name: "Durable Hack Day" },
      false,
    );
    expect(dependencies.saveGuildConfigInDb).not.toHaveBeenCalled();
    expect(dependencies.saveTeamInDb).not.toHaveBeenCalled();
    expect(dependencies.saveQueueTicketInDb).not.toHaveBeenCalled();
    expect(dependencies.saveModerationCaseInDb).not.toHaveBeenCalled();
  });

  it("serializes removal behind an in-flight install and hydration", async () => {
    const calls: string[] = [];
    let announceInstallStarted!: () => void;
    let releaseInstall!: () => void;
    const installStarted = new Promise<void>((resolve) => {
      announceInstallStarted = resolve;
    });
    const installGate = new Promise<void>((resolve) => {
      releaseInstall = resolve;
    });
    const markDiscordInstallationInDb = vi.fn(
      async (_guild: GuildIdentity, installed: boolean) => {
        calls.push(`mark:${installed}:start`);
        if (installed) {
          announceInstallStarted();
          await installGate;
        }
        calls.push(`mark:${installed}:finish`);
      },
    );
    const getGuildDashboardDataFromDb = vi.fn(async () => {
      calls.push("hydrate");
      return snapshot;
    });
    const dependencies = createDependencies({
      markDiscordInstallationInDb,
      getGuildDashboardDataFromDb,
    });
    const guild = { id: "guild-1", name: "Durable Hack Day" };

    const initialization = initializeGuildPersistence(guild, dependencies);
    await installStarted;
    const removal = markGuildInstallation(guild, false, dependencies);

    expect(markDiscordInstallationInDb).toHaveBeenCalledTimes(1);
    releaseInstall();
    await Promise.all([initialization, removal]);

    expect(calls).toEqual([
      "mark:true:start",
      "mark:true:finish",
      "hydrate",
      "mark:false:start",
      "mark:false:finish",
    ]);
  });
});

describe("durable writes and cache mirrors", () => {
  it("does not mutate the profile cache when the database rejects a write", async () => {
    const dependencies = createDependencies({
      upsertMemberProfileInDb: vi
        .fn()
        .mockRejectedValue(new Error("database offline")),
    });

    await expect(
      persistMemberProfile(
        { id: "guild-1", name: "Durable Hack Day" },
        profile,
        dependencies,
      ),
    ).rejects.toBeInstanceOf(BotPersistenceError);
    expect(store.members.has(profileKey("guild-1", "user-1"))).toBe(false);
  });

  it("caches queue, team, and moderation writes only after acknowledgement", async () => {
    const dependencies = createDependencies();
    const guild = { id: "guild-1", name: "Durable Hack Day" };

    await persistQueueTicket(guild, ticket, dependencies);
    await persistTeam(guild, team, dependencies);
    await persistModerationCase(guild, moderationCase, dependencies);

    expect(store.tickets.get(ticket.id)).toEqual(ticket);
    expect(store.teams.get(team.id)).toEqual(team);
    expect(store.cases.get(moderationCase.id)).toEqual(moderationCase);
  });

  it("initializes and persists a missing guild config instead of using cache as truth", async () => {
    const dependencies = createDependencies({
      getGuildConfigFromDb: vi.fn().mockResolvedValue(null),
    });

    const saved = await loadPersistentGuildConfig(
      { id: "new-guild", name: "New Guild", eventName: "Launch Day" },
      dependencies,
    );

    expect(saved).toMatchObject({
      guildId: "new-guild",
      eventName: "Launch Day",
      onboardingMode: "guided",
    });
    expect(dependencies.saveGuildConfigInDb).toHaveBeenCalledWith(
      saved,
      "New Guild",
    );
    expect(store.configs.get("new-guild")).toEqual(saved);
  });

  it("awaits and returns the database-created privileged audit event", async () => {
    const created: AuditEvent = {
      id: "audit-1",
      guildId: "guild-1",
      actorId: "staff-1",
      action: "queue.claim",
      targetType: "ticket",
      targetId: ticket.id,
      metadata: { status: "claimed" },
      createdAt: "2026-08-09T14:00:00.000Z",
    };
    const createAuditEventInDb = vi.fn().mockResolvedValue(created);
    const dependencies = createDependencies({ createAuditEventInDb });
    const input = {
      guildId: created.guildId,
      actorId: created.actorId,
      action: created.action,
      targetType: created.targetType,
      targetId: created.targetId,
      metadata: created.metadata,
    };

    await expect(persistAuditEvent(input, dependencies)).resolves.toEqual(
      created,
    );
    expect(createAuditEventInDb).toHaveBeenCalledWith(input);
  });

  it("uses compare-and-swap transitions and caches only acknowledged queue state", async () => {
    const dependencies = createDependencies();
    const next = {
      ...ticket,
      status: "claimed" as const,
      assignedTo: "staff-1",
    };

    await expect(
      transitionPersistentQueueTicket(
        ticket.guildId,
        ticket,
        next,
        dependencies,
      ),
    ).resolves.toEqual(next);
    expect(dependencies.transitionQueueTicketInDb).toHaveBeenCalledWith(
      ticket.guildId,
      { id: ticket.id, status: ticket.status, updatedAt: ticket.updatedAt },
      next,
    );
    expect(store.tickets.get(ticket.id)).toEqual(next);
  });

  it("returns null without caching when a queue transition loses its compare-and-swap", async () => {
    const dependencies = createDependencies({
      transitionQueueTicketWithAuditInDb: vi.fn().mockResolvedValue(null),
    });
    const next = {
      ...ticket,
      status: "claimed" as const,
      assignedTo: "staff-1",
    };

    await expect(
      transitionPersistentQueueTicketWithAudit(
        ticket.guildId,
        ticket,
        next,
        {
          guildId: ticket.guildId,
          actorId: "staff-1",
          action: "queue.claim",
          targetType: "ticket",
          targetId: ticket.id,
          metadata: {},
        },
        dependencies,
      ),
    ).resolves.toBeNull();
    expect(store.tickets.has(ticket.id)).toBe(false);
  });

  it("caches an atomic moderation case and audit acknowledgement", async () => {
    const dependencies = createDependencies();

    await persistModerationCaseWithAudit(
      { id: "guild-1", name: "Durable Hack Day" },
      moderationCase,
      {
        guildId: moderationCase.guildId,
        actorId: "staff-1",
        action: "mod.warn",
        targetType: "case",
        targetId: moderationCase.id,
        metadata: {},
      },
      dependencies,
    );

    expect(store.cases.get(moderationCase.id)).toEqual(moderationCase);
    expect(dependencies.saveModerationCaseWithAuditInDb).toHaveBeenCalledOnce();
  });
});

describe("fresh queue reads", () => {
  it("replaces the guild ticket cache from a durable queue listing", async () => {
    store.tickets.set("stale-ticket", { ...ticket, id: "stale-ticket" });
    const dependencies = createDependencies();

    const result = await listPersistentQueueTickets("guild-1", dependencies);

    expect(result).toEqual([ticket]);
    expect(store.tickets.has("stale-ticket")).toBe(false);
    expect(store.tickets.get(ticket.id)).toEqual(ticket);
  });

  it("removes a stale cached ticket when the database reports it missing", async () => {
    store.tickets.set(ticket.id, ticket);
    const dependencies = createDependencies({
      getQueueTicketFromDb: vi.fn().mockResolvedValue(null),
    });

    await expect(
      loadPersistentQueueTicket("guild-1", ticket.id, dependencies),
    ).resolves.toBeNull();
    expect(store.tickets.has(ticket.id)).toBe(false);
  });
});

describe("profile construction", () => {
  it("uses the supplied clock value for deterministic durable profiles", () => {
    expect(
      buildMemberProfile(
        {
          userId: "user-3",
          displayName: "Participant Three",
          skills: [],
          interests: [],
          beginnerFriendly: true,
          lookingForTeam: false,
        },
        "2026-08-09T13:00:00.000Z",
      ).updatedAt,
    ).toBe("2026-08-09T13:00:00.000Z");
  });
});
