import {
  createModerationCase,
  createQueueTicket,
  createTeam,
  type EventConfig,
  type MemberProfile,
  type ModerationCase,
  type QueueTicket,
  type TeamProfile
} from "@piphacklup/core";

export interface DemoStore {
  configs: Map<string, EventConfig>;
  members: Map<string, MemberProfile>;
  teams: Map<string, TeamProfile>;
  tickets: Map<string, QueueTicket>;
  cases: Map<string, ModerationCase>;
}

export const store: DemoStore = {
  configs: new Map(),
  members: new Map(),
  teams: new Map(),
  tickets: new Map(),
  cases: new Map()
};

export function profileKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

export function ensureConfig(guildId: string, eventName = "Hackathon"): EventConfig {
  const existing = store.configs.get(guildId);
  if (existing) return existing;

  const config: EventConfig = {
    guildId,
    eventName,
    onboardingMode: "guided",
    teamSizeMin: 2,
    teamSizeMax: 4,
    queueKinds: ["mentor", "tech", "judging"],
    roles: {},
    channels: {}
  };
  store.configs.set(guildId, config);
  return config;
}

export function saveProfile(profile: MemberProfile): MemberProfile {
  store.members.set(profileKey(profile.userId.split(":")[0] ?? "", profile.userId), profile);
  return profile;
}

export function upsertProfile(guildId: string, profile: Omit<MemberProfile, "updatedAt">): MemberProfile {
  const saved: MemberProfile = { ...profile, updatedAt: new Date().toISOString() };
  store.members.set(profileKey(guildId, profile.userId), saved);
  return saved;
}

export function getProfiles(guildId: string): MemberProfile[] {
  return [...store.members.entries()]
    .filter(([key]) => key.startsWith(`${guildId}:`))
    .map(([, profile]) => profile);
}

export function createStoredTicket(input: Parameters<typeof createQueueTicket>[0]): QueueTicket {
  const ticket = createQueueTicket(input);
  store.tickets.set(ticket.id, ticket);
  return ticket;
}

export function createStoredTeam(input: Parameters<typeof createTeam>[0]): TeamProfile {
  const team = createTeam(input);
  store.teams.set(team.id, team);
  return team;
}

export function createStoredCase(input: Parameters<typeof createModerationCase>[0]): ModerationCase {
  const moderationCase = createModerationCase(input);
  store.cases.set(moderationCase.id, moderationCase);
  return moderationCase;
}
