import {
  createAuditEventInDb,
  getGuildConfigFromDb,
  getGuildDashboardDataFromDb,
  getQueueTicketFromDb,
  listQueueTicketsFromDb,
  markDiscordInstallationInDb,
  saveGuildConfigInDb,
  saveModerationCaseInDb,
  saveModerationCaseWithAuditInDb,
  saveQueueTicketInDb,
  saveTeamInDb,
  transitionQueueTicketInDb,
  transitionQueueTicketWithAuditInDb,
  upsertMemberProfileInDb,
  verifyDatabaseSchema,
  type GuildDashboardData,
  type GuildIdentity,
} from "@piphacklup/db";
import type {
  AuditEvent,
  EventConfig,
  MemberProfile,
  ModerationCase,
  QueueTicket,
  TeamProfile,
} from "@piphacklup/core";
import {
  cacheConfig,
  cacheModerationCase,
  cacheProfile,
  cacheTeam,
  cacheTicket,
  buildDefaultConfig,
  evictGuildOperationalState,
  replaceGuildOperationalState,
  replaceGuildTickets,
  store,
} from "./store.js";
import { BotPersistenceError } from "./persistence-error.js";

export {
  BotPersistenceError,
  persistenceOperationName,
} from "./persistence-error.js";

export interface BotPersistenceDependencies {
  createAuditEventInDb: typeof createAuditEventInDb;
  getGuildConfigFromDb: typeof getGuildConfigFromDb;
  getGuildDashboardDataFromDb: typeof getGuildDashboardDataFromDb;
  getQueueTicketFromDb: typeof getQueueTicketFromDb;
  listQueueTicketsFromDb: typeof listQueueTicketsFromDb;
  markDiscordInstallationInDb: typeof markDiscordInstallationInDb;
  saveGuildConfigInDb: typeof saveGuildConfigInDb;
  saveModerationCaseInDb: typeof saveModerationCaseInDb;
  saveModerationCaseWithAuditInDb: typeof saveModerationCaseWithAuditInDb;
  saveQueueTicketInDb: typeof saveQueueTicketInDb;
  saveTeamInDb: typeof saveTeamInDb;
  transitionQueueTicketInDb: typeof transitionQueueTicketInDb;
  transitionQueueTicketWithAuditInDb: typeof transitionQueueTicketWithAuditInDb;
  upsertMemberProfileInDb: typeof upsertMemberProfileInDb;
  verifyDatabaseSchema: typeof verifyDatabaseSchema;
}

const defaultDependencies: BotPersistenceDependencies = {
  createAuditEventInDb,
  getGuildConfigFromDb,
  getGuildDashboardDataFromDb,
  getQueueTicketFromDb,
  listQueueTicketsFromDb,
  markDiscordInstallationInDb,
  saveGuildConfigInDb,
  saveModerationCaseInDb,
  saveModerationCaseWithAuditInDb,
  saveQueueTicketInDb,
  saveTeamInDb,
  transitionQueueTicketInDb,
  transitionQueueTicketWithAuditInDb,
  upsertMemberProfileInDb,
  verifyDatabaseSchema,
};

const guildLifecycleQueues = new Map<string, Promise<void>>();

export async function initializeGuildPersistence(
  guild: GuildIdentity,
  dependencies: BotPersistenceDependencies = defaultDependencies,
): Promise<GuildDashboardData> {
  return runGuildLifecycleOperation(guild.id, async () => {
    await markGuildInstallationUnlocked(guild, true, dependencies);
    return hydrateGuildOperationalState(guild.id, dependencies);
  });
}

export async function verifyDatabaseConnection(
  dependencies: BotPersistenceDependencies = defaultDependencies,
): Promise<void> {
  await runPersistenceOperation("verify the database schema", () =>
    dependencies.verifyDatabaseSchema(),
  );
}

export async function markGuildInstallation(
  guild: GuildIdentity,
  installed: boolean,
  dependencies: BotPersistenceDependencies = defaultDependencies,
): Promise<void> {
  await runGuildLifecycleOperation(guild.id, () =>
    markGuildInstallationUnlocked(guild, installed, dependencies),
  );
}

async function markGuildInstallationUnlocked(
  guild: GuildIdentity,
  installed: boolean,
  dependencies: BotPersistenceDependencies,
): Promise<void> {
  await runPersistenceOperation(
    installed
      ? "record the Discord installation"
      : "record the Discord removal",
    () => dependencies.markDiscordInstallationInDb(guild, installed),
  );
}

export async function hydrateGuildOperationalState(
  guildId: string,
  dependencies: BotPersistenceDependencies = defaultDependencies,
): Promise<GuildDashboardData> {
  const snapshot = await runPersistenceOperation("load guild state", () =>
    dependencies.getGuildDashboardDataFromDb(guildId),
  );
  replaceGuildOperationalState(guildId, snapshot);
  return snapshot;
}

export async function loadPersistentGuildConfig(
  guild: GuildIdentity,
  dependencies: BotPersistenceDependencies = defaultDependencies,
): Promise<EventConfig> {
  const config = await runPersistenceOperation(
    "load the guild configuration",
    () => dependencies.getGuildConfigFromDb(guild.id),
  );
  if (config) return cacheConfig(config);

  const persisted = await runPersistenceOperation(
    "initialize the guild configuration",
    () =>
      dependencies.saveGuildConfigInDb(
        buildDefaultConfig(guild.id, guild.eventName ?? guild.name),
        guild.name,
      ),
  );
  return cacheConfig(persisted);
}

export async function persistGuildConfig(
  guild: GuildIdentity,
  config: EventConfig,
  dependencies: BotPersistenceDependencies = defaultDependencies,
): Promise<EventConfig> {
  const persisted = await runPersistenceOperation(
    "save the guild configuration",
    () => dependencies.saveGuildConfigInDb(config, guild.name),
  );
  return cacheConfig(persisted);
}

export function buildMemberProfile(
  profile: Omit<MemberProfile, "updatedAt">,
  now = new Date().toISOString(),
): MemberProfile {
  return { ...profile, updatedAt: now };
}

export async function persistMemberProfile(
  guild: GuildIdentity,
  profile: MemberProfile,
  dependencies: BotPersistenceDependencies = defaultDependencies,
): Promise<MemberProfile> {
  const persisted = await runPersistenceOperation(
    "save the member profile",
    () => dependencies.upsertMemberProfileInDb(guild, profile),
  );
  return cacheProfile(guild.id, persisted);
}

export async function persistTeam(
  guild: GuildIdentity,
  team: TeamProfile,
  dependencies: BotPersistenceDependencies = defaultDependencies,
): Promise<TeamProfile> {
  const persisted = await runPersistenceOperation("save the team", () =>
    dependencies.saveTeamInDb(guild, team),
  );
  return cacheTeam(persisted);
}

export async function loadPersistentQueueTicket(
  guildId: string,
  ticketId: string,
  dependencies: BotPersistenceDependencies = defaultDependencies,
): Promise<QueueTicket | null> {
  const ticket = await runPersistenceOperation("load the queue ticket", () =>
    dependencies.getQueueTicketFromDb(guildId, ticketId),
  );
  if (ticket) return cacheTicket(ticket);

  const cached = store.tickets.get(ticketId);
  if (cached?.guildId === guildId) store.tickets.delete(ticketId);
  return null;
}

export async function listPersistentQueueTickets(
  guildId: string,
  dependencies: BotPersistenceDependencies = defaultDependencies,
): Promise<QueueTicket[]> {
  const tickets = await runPersistenceOperation("load the queue tickets", () =>
    dependencies.listQueueTicketsFromDb(guildId),
  );
  replaceGuildTickets(guildId, tickets);
  return tickets;
}

export async function persistQueueTicket(
  guild: GuildIdentity,
  ticket: QueueTicket,
  dependencies: BotPersistenceDependencies = defaultDependencies,
): Promise<QueueTicket> {
  const persisted = await runPersistenceOperation("save the queue ticket", () =>
    dependencies.saveQueueTicketInDb(guild, ticket),
  );
  return cacheTicket(persisted);
}

export async function transitionPersistentQueueTicket(
  guildId: string,
  previous: QueueTicket,
  next: QueueTicket,
  dependencies: BotPersistenceDependencies = defaultDependencies,
): Promise<QueueTicket | null> {
  const persisted = await runPersistenceOperation(
    "apply the queue ticket transition",
    () =>
      dependencies.transitionQueueTicketInDb(
        guildId,
        {
          id: previous.id,
          status: previous.status,
          updatedAt: previous.updatedAt,
        },
        next,
      ),
  );
  return persisted ? cacheTicket(persisted) : null;
}

export async function transitionPersistentQueueTicketWithAudit(
  guildId: string,
  previous: QueueTicket,
  next: QueueTicket,
  auditEvent: Omit<AuditEvent, "id" | "createdAt"> & { createdAt?: string },
  dependencies: BotPersistenceDependencies = defaultDependencies,
): Promise<QueueTicket | null> {
  const persisted = await runPersistenceOperation(
    "apply and audit the queue ticket transition",
    () =>
      dependencies.transitionQueueTicketWithAuditInDb(
        guildId,
        {
          id: previous.id,
          status: previous.status,
          updatedAt: previous.updatedAt,
        },
        next,
        auditEvent,
      ),
  );
  return persisted ? cacheTicket(persisted.ticket) : null;
}

export async function persistModerationCase(
  guild: GuildIdentity,
  moderationCase: ModerationCase,
  dependencies: BotPersistenceDependencies = defaultDependencies,
): Promise<ModerationCase> {
  const persisted = await runPersistenceOperation(
    "save the moderation case",
    () => dependencies.saveModerationCaseInDb(guild, moderationCase),
  );
  return cacheModerationCase(persisted);
}

export async function persistModerationCaseWithAudit(
  guild: GuildIdentity,
  moderationCase: ModerationCase,
  auditEvent: Omit<AuditEvent, "id" | "createdAt"> & { createdAt?: string },
  dependencies: BotPersistenceDependencies = defaultDependencies,
): Promise<ModerationCase> {
  const persisted = await runPersistenceOperation(
    "save and audit the moderation case",
    () =>
      dependencies.saveModerationCaseWithAuditInDb(
        guild,
        moderationCase,
        auditEvent,
      ),
  );
  return cacheModerationCase(persisted.moderationCase);
}

export async function persistAuditEvent(
  event: Omit<AuditEvent, "id" | "createdAt"> & { createdAt?: string },
  dependencies: BotPersistenceDependencies = defaultDependencies,
): Promise<AuditEvent> {
  return runPersistenceOperation("record the audit event", () =>
    dependencies.createAuditEventInDb(event),
  );
}

export function evictGuildOperationalCache(guildId: string): void {
  evictGuildOperationalState(guildId);
}

async function runPersistenceOperation<T>(
  operation: string,
  callback: () => Promise<T>,
): Promise<T> {
  try {
    return await callback();
  } catch (error) {
    throw new BotPersistenceError(operation, error);
  }
}

async function runGuildLifecycleOperation<T>(
  guildId: string,
  callback: () => Promise<T>,
): Promise<T> {
  const previous = guildLifecycleQueues.get(guildId) ?? Promise.resolve();
  const operation = previous.catch(() => undefined).then(callback);
  const queued = operation.then(
    () => undefined,
    () => undefined,
  );
  guildLifecycleQueues.set(guildId, queued);

  try {
    return await operation;
  } finally {
    if (guildLifecycleQueues.get(guildId) === queued) {
      guildLifecycleQueues.delete(guildId);
    }
  }
}
