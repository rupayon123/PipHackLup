import {
  createModerationCase,
  createQueueTicket,
  createTeam,
  type MemberProfile,
  type QueueTicket,
  type TeamProfile
} from "@piphacklup/core";

const now = "2026-06-06T15:00:00.000Z";
const guildId = "demo-guild";

export const demoMembers: MemberProfile[] = [
  {
    userId: "1001",
    displayName: "Ava",
    skills: ["frontend", "design"],
    interests: ["climate", "education"],
    timezone: "ET",
    beginnerFriendly: true,
    lookingForTeam: true,
    updatedAt: now
  },
  {
    userId: "1002",
    displayName: "Noah",
    skills: ["backend", "python"],
    interests: ["ai", "health"],
    timezone: "PT",
    beginnerFriendly: true,
    lookingForTeam: true,
    updatedAt: now
  },
  {
    userId: "1003",
    displayName: "Mina",
    skills: ["pitch", "product"],
    interests: ["accessibility"],
    timezone: "ET",
    beginnerFriendly: false,
    lookingForTeam: false,
    updatedAt: now
  }
];

export const demoTeams: TeamProfile[] = [
  createTeam({
    guildId,
    owner: demoMembers[2]!,
    name: "Iceberg Labs",
    desiredSkills: ["frontend", "ai"],
    projectIdea: "AI helper for first-time hackers",
    now
  })
];

export const demoTickets: QueueTicket[] = [
  createQueueTicket({
    guildId,
    kind: "mentor",
    requesterId: "1001",
    topic: "Scope check",
    description: "Need help cutting the project down for demo time.",
    priority: 2,
    now
  }),
  createQueueTicket({
    guildId,
    kind: "tech",
    requesterId: "1002",
    topic: "Vercel deploy",
    description: "Build passes locally but fails in CI.",
    priority: 3,
    now: "2026-06-06T15:03:00.000Z"
  }),
  createQueueTicket({
    guildId,
    kind: "judging",
    requesterId: "1003",
    topic: "Demo room",
    description: "Ready for practice judging.",
    priority: 1,
    now: "2026-06-06T15:07:00.000Z"
  })
];

export const demoCases = [
  createModerationCase({
    guildId,
    targetUserId: "2001",
    action: "report",
    reason: "Suspicious invite link in general chat",
    reporterId: "1002",
    evidenceMessageUrl: "https://discord.com/channels/demo/1/2",
    now
  })
];

export const setupSteps = [
  { label: "Create Discord application", status: "done", detail: "Bot app owned by your Discord account." },
  { label: "Enable Guild Members intent", status: "todo", detail: "Required for joins, roles, and onboarding." },
  { label: "Invite bot to test server", status: "todo", detail: "Use bot + applications.commands scopes." },
  { label: "Run /setup", status: "todo", detail: "Creates event defaults and previews AutoMod rules." },
  { label: "Deploy dashboard", status: "todo", detail: "Vercel Hobby can host the organizer surface." }
] as const;
