import { and, asc, desc, eq, exists, inArray, sql } from "drizzle-orm";
import {
  createId,
  type AuditEvent,
  type EventConfig,
  type MemberProfile,
  type ModerationCase,
  type QueueTicket,
  type TeamProfile,
} from "@piphacklup/core";
import { getDb, type PipHackLupDb } from "./client.js";
import {
  auditEvents,
  discordInstallations,
  guilds,
  memberProfiles,
  moderationCases,
  queueTickets,
  teamMembers,
  teams,
} from "./schema.js";

export interface GuildIdentity {
  id: string;
  name: string;
  eventName?: string;
}

export interface DiscordInstallationState {
  guildId: string;
  guildName: string;
  installed: boolean;
  installedAt?: string;
  removedAt?: string;
  lastSeenAt?: string;
}

export interface GuildDashboardData {
  config: EventConfig | null;
  profiles: MemberProfile[];
  teams: TeamProfile[];
  tickets: QueueTicket[];
  moderationCases: ModerationCase[];
}

export interface QueueTicketTransitionExpectation {
  id: string;
  status: QueueTicket["status"];
  updatedAt: string;
}

export type CreateAuditEventInput = Omit<AuditEvent, "id" | "createdAt"> & {
  createdAt?: string;
};

export interface QueueTicketTransitionWithAuditResult {
  ticket: QueueTicket;
  auditEvent: AuditEvent;
}

export interface ModerationCaseWithAuditResult {
  moderationCase: ModerationCase;
  auditEvent: AuditEvent;
}

export async function ensureGuildInDb(
  guild: GuildIdentity,
  db: PipHackLupDb = getDb(),
): Promise<void> {
  const now = new Date();
  await db
    .insert(guilds)
    .values({
      id: guild.id,
      name: guild.name,
      eventName: guild.eventName ?? guild.name,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: guilds.id,
      set: {
        name: guild.name,
        ...(guild.eventName ? { eventName: guild.eventName } : {}),
        updatedAt: now,
      },
    });
}

export async function getGuildConfigFromDb(
  guildId: string,
  db: PipHackLupDb = getDb(),
): Promise<EventConfig | null> {
  const row = await db.query.guilds.findFirst({
    where: eq(guilds.id, guildId),
  });
  if (!row) return null;
  return {
    guildId: row.id,
    eventName: row.eventName,
    onboardingMode: row.onboardingMode,
    teamSizeMin: row.teamSizeMin,
    teamSizeMax: row.teamSizeMax,
    queueKinds: ["mentor", "tech", "judging", "staff"],
    roles: row.roles,
    channels: row.channels,
    resources: row.resources,
  };
}

export async function saveGuildConfigInDb(
  config: EventConfig,
  guildName: string,
  db: PipHackLupDb = getDb(),
): Promise<EventConfig> {
  const now = new Date();
  await db
    .insert(guilds)
    .values({
      id: config.guildId,
      name: guildName,
      eventName: config.eventName,
      onboardingMode: config.onboardingMode,
      teamSizeMin: config.teamSizeMin,
      teamSizeMax: config.teamSizeMax,
      roles: config.roles,
      channels: config.channels,
      resources: config.resources ?? {},
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: guilds.id,
      set: {
        name: guildName,
        eventName: config.eventName,
        onboardingMode: config.onboardingMode,
        teamSizeMin: config.teamSizeMin,
        teamSizeMax: config.teamSizeMax,
        roles: config.roles,
        channels: config.channels,
        resources: config.resources ?? {},
        updatedAt: now,
      },
    });
  return config;
}

export async function markDiscordInstallationInDb(
  guild: GuildIdentity,
  installed: boolean,
  db: PipHackLupDb = getDb(),
): Promise<void> {
  await ensureGuildInDb(guild, db);
  const now = new Date();
  await db
    .insert(discordInstallations)
    .values({
      guildId: guild.id,
      guildName: guild.name,
      installedAt: installed ? now : null,
      removedAt: installed ? null : now,
      lastSeenAt: installed ? now : null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: discordInstallations.guildId,
      set: {
        guildName: guild.name,
        ...(installed
          ? {
              installedAt: sql<Date>`case
                when ${discordInstallations.removedAt} is null
                  and ${discordInstallations.installedAt} is not null
                then ${discordInstallations.installedAt}
                else ${now}
              end`,
              removedAt: null,
              lastSeenAt: now,
            }
          : { removedAt: now }),
        updatedAt: now,
      },
    });
}

export async function getDiscordInstallationFromDb(
  guildId: string,
  db: PipHackLupDb = getDb(),
): Promise<DiscordInstallationState | null> {
  const row = await db.query.discordInstallations.findFirst({
    where: eq(discordInstallations.guildId, guildId),
  });
  if (!row) return null;
  return {
    guildId: row.guildId,
    guildName: row.guildName,
    installed: row.removedAt === null && row.installedAt !== null,
    ...(row.installedAt ? { installedAt: row.installedAt.toISOString() } : {}),
    ...(row.removedAt ? { removedAt: row.removedAt.toISOString() } : {}),
    ...(row.lastSeenAt ? { lastSeenAt: row.lastSeenAt.toISOString() } : {}),
  };
}

export async function upsertMemberProfileInDb(
  guild: GuildIdentity,
  profile: MemberProfile,
  db: PipHackLupDb = getDb(),
): Promise<MemberProfile> {
  await ensureGuildInDb(guild, db);
  await db
    .insert(memberProfiles)
    .values({
      guildId: guild.id,
      userId: profile.userId,
      displayName: profile.displayName,
      skills: profile.skills,
      interests: profile.interests,
      timezone: profile.timezone ?? null,
      beginnerFriendly: profile.beginnerFriendly,
      lookingForTeam: profile.lookingForTeam,
      preferredTeamSize: profile.preferredTeamSize ?? null,
      updatedAt: new Date(profile.updatedAt),
    })
    .onConflictDoUpdate({
      target: [memberProfiles.guildId, memberProfiles.userId],
      set: {
        displayName: profile.displayName,
        skills: profile.skills,
        interests: profile.interests,
        timezone: profile.timezone ?? null,
        beginnerFriendly: profile.beginnerFriendly,
        lookingForTeam: profile.lookingForTeam,
        preferredTeamSize: profile.preferredTeamSize ?? null,
        updatedAt: new Date(profile.updatedAt),
      },
    });
  return profile;
}

export async function listMemberProfilesFromDb(
  guildId: string,
  db: PipHackLupDb = getDb(),
): Promise<MemberProfile[]> {
  const rows = await db
    .select()
    .from(memberProfiles)
    .where(eq(memberProfiles.guildId, guildId))
    .orderBy(desc(memberProfiles.updatedAt));
  return rows.map((row) => ({
    userId: row.userId,
    displayName: row.displayName,
    skills: row.skills,
    interests: row.interests,
    ...(row.timezone ? { timezone: row.timezone } : {}),
    beginnerFriendly: row.beginnerFriendly,
    lookingForTeam: row.lookingForTeam,
    ...(row.preferredTeamSize
      ? { preferredTeamSize: row.preferredTeamSize }
      : {}),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function saveTeamInDb(
  guild: GuildIdentity,
  team: TeamProfile,
  db: PipHackLupDb = getDb(),
): Promise<TeamProfile> {
  await ensureGuildInDb(guild, db);
  const teamUpsert = db
    .insert(teams)
    .values({
      id: team.id,
      guildId: guild.id,
      name: team.name,
      status: team.status,
      ownerId: team.ownerId,
      desiredSkills: team.desiredSkills,
      projectIdea: team.projectIdea ?? null,
      maxSize: team.maxSize,
      createdAt: new Date(team.createdAt),
      updatedAt: new Date(team.updatedAt),
    })
    .onConflictDoUpdate({
      target: teams.id,
      setWhere: eq(teams.guildId, guild.id),
      set: {
        name: team.name,
        status: team.status,
        desiredSkills: team.desiredSkills,
        projectIdea: team.projectIdea ?? null,
        maxSize: team.maxSize,
        updatedAt: new Date(team.updatedAt),
      },
    })
    .returning({ id: teams.id, guildId: teams.guildId });
  const replaceMemberships = db.delete(teamMembers).where(
    and(
      eq(teamMembers.teamId, team.id),
      exists(
        sql`select 1 from ${teams}
            where ${teams.id} = ${team.id}
              and ${teams.guildId} = ${guild.id}`,
      ),
    ),
  );
  const memberIds = [...new Set([team.ownerId, ...team.memberIds])];
  const memberRows = sql.join(
    memberIds.map((userId) => sql`(${userId})`),
    sql`, `,
  );
  const membershipInsert = db
    .insert(teamMembers)
    .select(
      sql`
      select ${team.id}, member_input."user_id", ${new Date(team.updatedAt)}
      from (values ${memberRows}) as member_input("user_id")
      where exists (
        select 1 from ${teams}
        where "id" = ${team.id} and "guild_id" = ${guild.id}
      )
    `,
    )
    .onConflictDoNothing();

  // Neon HTTP's batch API executes this ordered group in one database transaction.
  const [savedTeams] = await db.batch([
    teamUpsert,
    replaceMemberships,
    membershipInsert,
  ]);
  if (savedTeams.length === 0) {
    throw new Error("Team id is already assigned to another guild.");
  }
  return { ...team, guildId: guild.id, memberIds };
}

export async function listTeamsFromDb(
  guildId: string,
  db: PipHackLupDb = getDb(),
): Promise<TeamProfile[]> {
  const teamRows = await db
    .select()
    .from(teams)
    .where(eq(teams.guildId, guildId))
    .orderBy(desc(teams.updatedAt));
  if (!teamRows.length) return [];
  const membershipRows = await db
    .select()
    .from(teamMembers)
    .where(
      inArray(
        teamMembers.teamId,
        teamRows.map((team) => team.id),
      ),
    )
    .orderBy(asc(teamMembers.joinedAt));
  const membersByTeam = new Map<string, string[]>();
  for (const membership of membershipRows) {
    const members = membersByTeam.get(membership.teamId) ?? [];
    members.push(membership.userId);
    membersByTeam.set(membership.teamId, members);
  }
  return teamRows.map((team) => ({
    id: team.id,
    guildId: team.guildId,
    name: team.name,
    status: team.status,
    ownerId: team.ownerId,
    memberIds: membersByTeam.get(team.id) ?? [team.ownerId],
    desiredSkills: team.desiredSkills,
    ...(team.projectIdea ? { projectIdea: team.projectIdea } : {}),
    maxSize: team.maxSize,
    createdAt: team.createdAt.toISOString(),
    updatedAt: team.updatedAt.toISOString(),
  }));
}

export async function saveQueueTicketInDb(
  guild: GuildIdentity,
  ticket: QueueTicket,
  db: PipHackLupDb = getDb(),
): Promise<QueueTicket> {
  await ensureGuildInDb(guild, db);
  const [savedTicket] = await db
    .insert(queueTickets)
    .values({
      id: ticket.id,
      guildId: guild.id,
      kind: ticket.kind,
      status: ticket.status,
      requesterId: ticket.requesterId,
      teamId: ticket.teamId ?? null,
      topic: ticket.topic,
      description: ticket.description,
      priority: ticket.priority,
      assignedTo: ticket.assignedTo ?? null,
      transcriptChannelId: ticket.transcriptChannelId ?? null,
      createdAt: new Date(ticket.createdAt),
      updatedAt: new Date(ticket.updatedAt),
      closedAt: ticket.closedAt ? new Date(ticket.closedAt) : null,
    })
    .onConflictDoUpdate({
      target: queueTickets.id,
      setWhere: eq(queueTickets.guildId, guild.id),
      set: {
        status: ticket.status,
        teamId: ticket.teamId ?? null,
        topic: ticket.topic,
        description: ticket.description,
        priority: ticket.priority,
        assignedTo: ticket.assignedTo ?? null,
        transcriptChannelId: ticket.transcriptChannelId ?? null,
        updatedAt: new Date(ticket.updatedAt),
        closedAt: ticket.closedAt ? new Date(ticket.closedAt) : null,
      },
    })
    .returning({ id: queueTickets.id, guildId: queueTickets.guildId });
  if (!savedTicket) {
    throw new Error("Queue ticket id is already assigned to another guild.");
  }
  return { ...ticket, guildId: guild.id };
}

/**
 * Apply a queue transition only if the caller's previously loaded state is still current.
 * The authoritative guild id, ticket id, status, and update timestamp are all compared in
 * the single UPDATE so concurrent bot replicas cannot both claim or close the same state.
 */
export async function transitionQueueTicketInDb(
  guildId: string,
  expected: QueueTicketTransitionExpectation,
  nextTicket: QueueTicket,
  db: PipHackLupDb = getDb(),
): Promise<QueueTicket | null> {
  const { expectedUpdatedAt, nextUpdatedAt } = validateQueueTransitionInput(
    guildId,
    expected,
    nextTicket,
  );
  const [row] = await db
    .update(queueTickets)
    .set(queueTicketUpdateValues(nextTicket, nextUpdatedAt))
    .where(
      and(
        eq(queueTickets.guildId, guildId),
        eq(queueTickets.id, expected.id),
        eq(queueTickets.status, expected.status),
        eq(queueTickets.updatedAt, expectedUpdatedAt),
      ),
    )
    .returning();
  return row ? mapQueueTicket(row) : null;
}

/**
 * Atomically apply a privileged queue transition and its matching audit event.
 * A stale compare-and-swap produces neither the transition nor an audit row.
 */
export async function transitionQueueTicketWithAuditInDb(
  guildId: string,
  expected: QueueTicketTransitionExpectation,
  nextTicket: QueueTicket,
  auditInput: CreateAuditEventInput,
  db: PipHackLupDb = getDb(),
): Promise<QueueTicketTransitionWithAuditResult | null> {
  const { expectedUpdatedAt, nextUpdatedAt } = validateQueueTransitionInput(
    guildId,
    expected,
    nextTicket,
  );
  assertAuditTarget(auditInput, guildId, "ticket", nextTicket.id);
  const auditEvent = makeAuditEvent(auditInput);
  const metadata = JSON.stringify(auditEvent.metadata);
  const closedAt = nextTicket.closedAt ? new Date(nextTicket.closedAt) : null;

  const result = await db.execute<{ ticketId: string }>(sql`
    with updated_ticket as (
      update ${queueTickets}
      set
        "status" = ${nextTicket.status},
        "team_id" = ${nextTicket.teamId ?? null},
        "topic" = ${nextTicket.topic},
        "description" = ${nextTicket.description},
        "priority" = ${nextTicket.priority},
        "assigned_to" = ${nextTicket.assignedTo ?? null},
        "transcript_channel_id" = ${nextTicket.transcriptChannelId ?? null},
        "updated_at" = ${nextUpdatedAt},
        "closed_at" = ${closedAt}
      where "guild_id" = ${guildId}
        and "id" = ${expected.id}
        and "status" = ${expected.status}
        and "updated_at" = ${expectedUpdatedAt}
      returning "id"
    ), inserted_audit as (
      insert into ${auditEvents} (
        "id", "guild_id", "actor_id", "action", "target_type", "target_id", "metadata", "created_at"
      )
      select
        ${auditEvent.id}, ${guildId}, ${auditEvent.actorId}, ${auditEvent.action},
        ${auditEvent.targetType}, ${auditEvent.targetId}, ${metadata}::jsonb,
        ${new Date(auditEvent.createdAt)}
      from updated_ticket
      returning "id"
    )
    select updated_ticket."id" as "ticketId"
    from updated_ticket
    inner join inserted_audit on true
  `);

  if (result.rows.length === 0) return null;
  return {
    ticket: { ...nextTicket, guildId },
    auditEvent,
  };
}

export async function getQueueTicketFromDb(
  guildId: string,
  ticketId: string,
  db: PipHackLupDb = getDb(),
): Promise<QueueTicket | null> {
  const [row] = await db
    .select()
    .from(queueTickets)
    .where(
      and(eq(queueTickets.guildId, guildId), eq(queueTickets.id, ticketId)),
    )
    .limit(1);
  return row ? mapQueueTicket(row) : null;
}

export async function listQueueTicketsFromDb(
  guildId: string,
  db: PipHackLupDb = getDb(),
): Promise<QueueTicket[]> {
  const rows = await db
    .select()
    .from(queueTickets)
    .where(eq(queueTickets.guildId, guildId))
    .orderBy(desc(queueTickets.priority), asc(queueTickets.createdAt));
  return rows.map(mapQueueTicket);
}

export async function saveModerationCaseInDb(
  guild: GuildIdentity,
  moderationCase: ModerationCase,
  db: PipHackLupDb = getDb(),
): Promise<ModerationCase> {
  await ensureGuildInDb(guild, db);
  const [savedCase] = await buildModerationCaseUpsert(
    db,
    guild.id,
    moderationCase,
  );
  if (!savedCase) {
    throw new Error("Moderation case id is already assigned to another guild.");
  }
  return { ...moderationCase, guildId: guild.id };
}

/** Persist a moderation mutation and its required privileged audit row atomically. */
export async function saveModerationCaseWithAuditInDb(
  guild: GuildIdentity,
  moderationCase: ModerationCase,
  auditInput: CreateAuditEventInput,
  db: PipHackLupDb = getDb(),
): Promise<ModerationCaseWithAuditResult> {
  assertAuditTarget(auditInput, guild.id, "case", moderationCase.id);
  await ensureGuildInDb(guild, db);
  const auditEvent = makeAuditEvent(auditInput);
  const metadata = JSON.stringify(auditEvent.metadata);
  const result = await db.execute<{ caseId: string }>(sql`
    with saved_case as (
      insert into ${moderationCases} (
        "id", "guild_id", "target_user_id", "action", "reason", "reporter_id",
        "moderator_id", "evidence_message_url", "status", "created_at", "updated_at"
      ) values (
        ${moderationCase.id}, ${guild.id}, ${moderationCase.targetUserId},
        ${moderationCase.action}, ${moderationCase.reason},
        ${moderationCase.reporterId ?? null}, ${moderationCase.moderatorId ?? null},
        ${moderationCase.evidenceMessageUrl ?? null}, ${moderationCase.status},
        ${new Date(moderationCase.createdAt)}, ${new Date(moderationCase.updatedAt)}
      )
      on conflict ("id") do update set
        "action" = excluded."action",
        "reason" = excluded."reason",
        "reporter_id" = excluded."reporter_id",
        "moderator_id" = excluded."moderator_id",
        "evidence_message_url" = excluded."evidence_message_url",
        "status" = excluded."status",
        "updated_at" = excluded."updated_at"
      where ${moderationCases}."guild_id" = ${guild.id}
      returning "id"
    ), inserted_audit as (
      insert into ${auditEvents} (
        "id", "guild_id", "actor_id", "action", "target_type", "target_id", "metadata", "created_at"
      )
      select
        ${auditEvent.id}, ${guild.id}, ${auditEvent.actorId}, ${auditEvent.action},
        ${auditEvent.targetType}, ${auditEvent.targetId}, ${metadata}::jsonb,
        ${new Date(auditEvent.createdAt)}
      from saved_case
      returning "id"
    )
    select saved_case."id" as "caseId"
    from saved_case
    inner join inserted_audit on true
  `);
  if (result.rows.length === 0) {
    throw new Error("Moderation case id is already assigned to another guild.");
  }
  return {
    moderationCase: { ...moderationCase, guildId: guild.id },
    auditEvent,
  };
}

export async function listModerationCasesFromDb(
  guildId: string,
  db: PipHackLupDb = getDb(),
): Promise<ModerationCase[]> {
  const rows = await db
    .select()
    .from(moderationCases)
    .where(eq(moderationCases.guildId, guildId))
    .orderBy(desc(moderationCases.createdAt));
  return rows.map((row) => ({
    id: row.id,
    guildId: row.guildId,
    targetUserId: row.targetUserId,
    action: row.action,
    reason: row.reason,
    ...(row.reporterId ? { reporterId: row.reporterId } : {}),
    ...(row.moderatorId ? { moderatorId: row.moderatorId } : {}),
    ...(row.evidenceMessageUrl
      ? { evidenceMessageUrl: row.evidenceMessageUrl }
      : {}),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function createAuditEventInDb(
  input: CreateAuditEventInput,
  db: PipHackLupDb = getDb(),
): Promise<AuditEvent> {
  const event = makeAuditEvent(input);
  await buildAuditEventInsert(db, event);
  return event;
}

function makeAuditEvent(input: CreateAuditEventInput): AuditEvent {
  return {
    ...input,
    id: createId("audit"),
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

function buildAuditEventInsert(db: PipHackLupDb, event: AuditEvent) {
  return db.insert(auditEvents).values({
    id: event.id,
    guildId: event.guildId,
    actorId: event.actorId,
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId,
    metadata: event.metadata,
    createdAt: new Date(event.createdAt),
  });
}

export async function getGuildDashboardDataFromDb(
  guildId: string,
  db: PipHackLupDb = getDb(),
): Promise<GuildDashboardData> {
  const [config, profiles, teamRows, tickets, cases] = await Promise.all([
    getGuildConfigFromDb(guildId, db),
    listMemberProfilesFromDb(guildId, db),
    listTeamsFromDb(guildId, db),
    listQueueTicketsFromDb(guildId, db),
    listModerationCasesFromDb(guildId, db),
  ]);
  return {
    config,
    profiles,
    teams: teamRows,
    tickets,
    moderationCases: cases,
  };
}

function mapQueueTicket(row: typeof queueTickets.$inferSelect): QueueTicket {
  const priority = Math.min(3, Math.max(0, row.priority)) as 0 | 1 | 2 | 3;
  return {
    id: row.id,
    guildId: row.guildId,
    kind: row.kind,
    status: row.status,
    requesterId: row.requesterId,
    ...(row.teamId ? { teamId: row.teamId } : {}),
    topic: row.topic,
    description: row.description,
    priority,
    ...(row.assignedTo ? { assignedTo: row.assignedTo } : {}),
    ...(row.transcriptChannelId
      ? { transcriptChannelId: row.transcriptChannelId }
      : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.closedAt ? { closedAt: row.closedAt.toISOString() } : {}),
  };
}

function queueTicketUpdateValues(ticket: QueueTicket, updatedAt: Date) {
  return {
    status: ticket.status,
    teamId: ticket.teamId ?? null,
    topic: ticket.topic,
    description: ticket.description,
    priority: ticket.priority,
    assignedTo: ticket.assignedTo ?? null,
    transcriptChannelId: ticket.transcriptChannelId ?? null,
    updatedAt,
    closedAt: ticket.closedAt ? new Date(ticket.closedAt) : null,
  };
}

function validateQueueTransitionInput(
  guildId: string,
  expected: QueueTicketTransitionExpectation,
  nextTicket: QueueTicket,
): { expectedUpdatedAt: Date; nextUpdatedAt: Date } {
  if (expected.id !== nextTicket.id) {
    throw new Error("Queue transition ticket ids must match.");
  }
  if (nextTicket.guildId !== guildId) {
    throw new Error("Queue transition guild ids must match.");
  }
  const expectedUpdatedAt = new Date(expected.updatedAt);
  const nextUpdatedAt = new Date(nextTicket.updatedAt);
  if (
    Number.isNaN(expectedUpdatedAt.getTime()) ||
    Number.isNaN(nextUpdatedAt.getTime())
  ) {
    throw new Error("Queue transition timestamps must be valid ISO dates.");
  }
  if (nextUpdatedAt <= expectedUpdatedAt) {
    throw new Error(
      "Queue transition updatedAt must be newer than the expected state.",
    );
  }
  return { expectedUpdatedAt, nextUpdatedAt };
}

function assertAuditTarget(
  input: CreateAuditEventInput,
  guildId: string,
  targetType: AuditEvent["targetType"],
  targetId: string,
): void {
  if (
    input.guildId !== guildId ||
    input.targetType !== targetType ||
    input.targetId !== targetId
  ) {
    throw new Error(
      "Atomic audit input must match the mutation guild, target type, and target id.",
    );
  }
}

function buildModerationCaseUpsert(
  db: PipHackLupDb,
  guildId: string,
  moderationCase: ModerationCase,
) {
  return db
    .insert(moderationCases)
    .values({
      id: moderationCase.id,
      guildId,
      targetUserId: moderationCase.targetUserId,
      action: moderationCase.action,
      reason: moderationCase.reason,
      reporterId: moderationCase.reporterId ?? null,
      moderatorId: moderationCase.moderatorId ?? null,
      evidenceMessageUrl: moderationCase.evidenceMessageUrl ?? null,
      status: moderationCase.status,
      createdAt: new Date(moderationCase.createdAt),
      updatedAt: new Date(moderationCase.updatedAt),
    })
    .onConflictDoUpdate({
      target: moderationCases.id,
      setWhere: eq(moderationCases.guildId, guildId),
      set: {
        action: moderationCase.action,
        reason: moderationCase.reason,
        reporterId: moderationCase.reporterId ?? null,
        moderatorId: moderationCase.moderatorId ?? null,
        evidenceMessageUrl: moderationCase.evidenceMessageUrl ?? null,
        status: moderationCase.status,
        updatedAt: new Date(moderationCase.updatedAt),
      },
    })
    .returning({ id: moderationCases.id, guildId: moderationCases.guildId });
}
