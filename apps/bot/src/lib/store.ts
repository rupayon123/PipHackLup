import {
  createModerationCase,
  createKnowledgeEntry,
  createQueueTicket,
  createTeam,
  type EventConfig,
  type HackathonKnowledgeEntry,
  type KnowledgeAssistantSettings,
  type MemberProfile,
  type ModerationCase,
  type QueueTicket,
  type TeamProfile,
  defaultKnowledgeSettings,
} from "@piphacklup/core";

export interface DemoStore {
  configs: Map<string, EventConfig>;
  members: Map<string, MemberProfile>;
  teams: Map<string, TeamProfile>;
  tickets: Map<string, QueueTicket>;
  cases: Map<string, ModerationCase>;
  knowledge: Map<string, HackathonKnowledgeEntry>;
  knowledgeSettings: Map<string, KnowledgeAssistantSettings>;
}

export const store: DemoStore = {
  configs: new Map(),
  members: new Map(),
  teams: new Map(),
  tickets: new Map(),
  cases: new Map(),
  knowledge: new Map(),
  knowledgeSettings: new Map(),
};

export function profileKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

export function ensureConfig(
  guildId: string,
  eventName = "Hackathon",
): EventConfig {
  const existing = store.configs.get(guildId);
  if (existing) return existing;

  const config: EventConfig = {
    guildId,
    eventName,
    onboardingMode: "guided",
    teamSizeMin: 2,
    teamSizeMax: 4,
    queueKinds: ["mentor", "tech", "judging", "staff"],
    roles: {},
    channels: {},
  };
  store.configs.set(guildId, config);
  return config;
}

export function saveProfile(profile: MemberProfile): MemberProfile {
  store.members.set(
    profileKey(profile.userId.split(":")[0] ?? "", profile.userId),
    profile,
  );
  return profile;
}

export function upsertProfile(
  guildId: string,
  profile: Omit<MemberProfile, "updatedAt">,
): MemberProfile {
  const saved: MemberProfile = {
    ...profile,
    updatedAt: new Date().toISOString(),
  };
  store.members.set(profileKey(guildId, profile.userId), saved);
  return saved;
}

export function getProfiles(guildId: string): MemberProfile[] {
  return [...store.members.entries()]
    .filter(([key]) => key.startsWith(`${guildId}:`))
    .map(([, profile]) => profile);
}

export function createStoredTicket(
  input: Parameters<typeof createQueueTicket>[0],
): QueueTicket {
  const ticket = createQueueTicket(input);
  store.tickets.set(ticket.id, ticket);
  return ticket;
}

export function createStoredTeam(
  input: Parameters<typeof createTeam>[0],
): TeamProfile {
  const team = createTeam(input);
  store.teams.set(team.id, team);
  return team;
}

export function createStoredCase(
  input: Parameters<typeof createModerationCase>[0],
): ModerationCase {
  const moderationCase = createModerationCase(input);
  store.cases.set(moderationCase.id, moderationCase);
  return moderationCase;
}

export function ensureKnowledgeSettings(
  guildId: string,
): KnowledgeAssistantSettings {
  const existing = store.knowledgeSettings.get(guildId);
  if (existing) return existing;

  const settings = { ...defaultKnowledgeSettings };
  store.knowledgeSettings.set(guildId, settings);
  return settings;
}

export function updateKnowledgeSettings(
  guildId: string,
  patch: Partial<KnowledgeAssistantSettings>,
): KnowledgeAssistantSettings {
  const settings = { ...ensureKnowledgeSettings(guildId), ...patch };
  store.knowledgeSettings.set(guildId, settings);
  return settings;
}

export function createStoredKnowledgeEntry(
  input: Parameters<typeof createKnowledgeEntry>[0],
): HackathonKnowledgeEntry {
  const entry = createKnowledgeEntry(input);
  store.knowledge.set(entry.id, entry);
  return entry;
}

export function getKnowledgeEntries(
  guildId: string,
): HackathonKnowledgeEntry[] {
  return [...store.knowledge.values()].filter(
    (entry) => entry.guildId === guildId,
  );
}

export function deleteKnowledgeEntry(
  guildId: string,
  entryId: string,
): boolean {
  const entry = store.knowledge.get(entryId);
  if (!entry || entry.guildId !== guildId) return false;
  return store.knowledge.delete(entryId);
}
