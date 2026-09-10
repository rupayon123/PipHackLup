import type {
  EventConfig,
  MemberProfile,
  ModerationCase,
  QueueTicket,
  TeamProfile,
} from "@piphacklup/core";

export interface BotMemoryCache {
  configs: Map<string, EventConfig>;
  members: Map<string, MemberProfile>;
  teams: Map<string, TeamProfile>;
  tickets: Map<string, QueueTicket>;
  cases: Map<string, ModerationCase>;
}

export interface GuildOperationalSnapshot {
  config: EventConfig | null;
  profiles: MemberProfile[];
  teams: TeamProfile[];
  tickets: QueueTicket[];
  moderationCases: ModerationCase[];
}

export const store: BotMemoryCache = {
  configs: new Map(),
  members: new Map(),
  teams: new Map(),
  tickets: new Map(),
  cases: new Map(),
};

export function profileKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

export function buildDefaultConfig(
  guildId: string,
  eventName = "Hackathon",
): EventConfig {
  return {
    guildId,
    eventName,
    onboardingMode: "guided",
    teamSizeMin: 2,
    teamSizeMax: 4,
    queueKinds: ["mentor", "tech", "judging", "staff"],
    roles: {},
    channels: {},
  };
}

export function cacheConfig(config: EventConfig): EventConfig {
  store.configs.set(config.guildId, config);
  return config;
}

export function cacheProfile(
  guildId: string,
  profile: MemberProfile,
): MemberProfile {
  store.members.set(profileKey(guildId, profile.userId), profile);
  return profile;
}

export function cacheTeam(team: TeamProfile): TeamProfile {
  store.teams.set(team.id, team);
  return team;
}

export function cacheTicket(ticket: QueueTicket): QueueTicket {
  store.tickets.set(ticket.id, ticket);
  return ticket;
}

export function cacheModerationCase(
  moderationCase: ModerationCase,
): ModerationCase {
  store.cases.set(moderationCase.id, moderationCase);
  return moderationCase;
}

export function replaceGuildOperationalState(
  guildId: string,
  snapshot: GuildOperationalSnapshot,
): void {
  evictGuildOperationalState(guildId);
  if (snapshot.config) cacheConfig(snapshot.config);
  for (const profile of snapshot.profiles) cacheProfile(guildId, profile);
  for (const team of snapshot.teams) cacheTeam(team);
  for (const ticket of snapshot.tickets) cacheTicket(ticket);
  for (const moderationCase of snapshot.moderationCases) {
    cacheModerationCase(moderationCase);
  }
}

export function replaceGuildTickets(
  guildId: string,
  tickets: readonly QueueTicket[],
): void {
  deleteMapValues(store.tickets, (ticket) => ticket.guildId === guildId);
  for (const ticket of tickets) cacheTicket(ticket);
}

export function evictGuildOperationalState(guildId: string): void {
  store.configs.delete(guildId);
  for (const key of store.members.keys()) {
    if (key.startsWith(`${guildId}:`)) store.members.delete(key);
  }
  deleteMapValues(store.teams, (team) => team.guildId === guildId);
  deleteMapValues(store.tickets, (ticket) => ticket.guildId === guildId);
  deleteMapValues(
    store.cases,
    (moderationCase) => moderationCase.guildId === guildId,
  );
}

function deleteMapValues<T>(
  values: Map<string, T>,
  predicate: (value: T) => boolean,
): void {
  for (const [key, value] of values) {
    if (predicate(value)) values.delete(key);
  }
}
