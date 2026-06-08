import { NextRequest, NextResponse } from "next/server";
import {
  createKnowledgeEntryInDb,
  deleteKnowledgeEntryFromDb,
  isDatabaseConfigured,
  listKnowledgeEntriesFromDb,
} from "@piphacklup/db";
import {
  normalizeKnowledgeTags,
  parseKnowledgeImportText,
  type KnowledgeEscalationTarget,
} from "@piphacklup/core";
import { findManagedGuild, readDiscordSession } from "@/lib/discord-auth";

export async function GET(request: NextRequest) {
  const access = await requireTrainingAccess(request);
  if (access instanceof NextResponse) return access;

  return NextResponse.json({
    entries: await listKnowledgeEntriesFromDb(access.guild.id),
  });
}

export async function POST(request: NextRequest) {
  const access = await requireTrainingAccess(request);
  if (access instanceof NextResponse) return access;

  const body = (await request.json()) as {
    title?: string;
    answer?: string;
    tags?: string[] | string;
    escalationTarget?: KnowledgeEscalationTarget;
    importText?: string;
  };

  if (body.importText) {
    const parsed = parseKnowledgeImportText(
      body.importText,
      body.escalationTarget ?? "none",
    ).slice(0, 50);
    const entries = await Promise.all(
      parsed.map((entry) =>
        createKnowledgeEntryInDb(
          {
            guildId: access.guild.id,
            title: entry.title,
            answer: entry.answer,
            tags: entry.tags,
            escalationTarget: entry.escalationTarget,
            createdBy: access.session.user.id,
          },
          access.guild,
        ),
      ),
    );
    return NextResponse.json({ entries }, { status: 201 });
  }

  if (!body.title?.trim() || !body.answer?.trim()) {
    return NextResponse.json(
      { error: "title_and_answer_required" },
      { status: 400 },
    );
  }

  const tags = Array.isArray(body.tags)
    ? body.tags
    : (body.tags ?? "").split(",");
  const entry = await createKnowledgeEntryInDb(
    {
      guildId: access.guild.id,
      title: body.title,
      answer: body.answer,
      tags: normalizeKnowledgeTags(tags),
      escalationTarget: body.escalationTarget ?? "none",
      createdBy: access.session.user.id,
    },
    access.guild,
  );

  return NextResponse.json({ entry }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const access = await requireTrainingAccess(request);
  if (access instanceof NextResponse) return access;

  const entryId = request.nextUrl.searchParams.get("entryId");
  if (!entryId) {
    return NextResponse.json({ error: "entry_id_required" }, { status: 400 });
  }

  const deleted = await deleteKnowledgeEntryFromDb(access.guild.id, entryId);
  return NextResponse.json({ deleted });
}

async function requireTrainingAccess(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "database_not_configured" },
      { status: 503 },
    );
  }

  const guildId = request.nextUrl.searchParams.get("guildId");
  const session = await readDiscordSession();
  if (!session) {
    return NextResponse.json(
      { error: "discord_login_required" },
      { status: 401 },
    );
  }
  if (!guildId) {
    return NextResponse.json({ error: "guild_id_required" }, { status: 400 });
  }

  const guild = findManagedGuild(session, guildId);
  if (!guild) {
    return NextResponse.json(
      { error: "missing_manage_server" },
      { status: 403 },
    );
  }

  return { session, guild };
}
