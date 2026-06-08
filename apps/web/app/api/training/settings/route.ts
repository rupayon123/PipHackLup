import { NextRequest, NextResponse } from "next/server";
import {
  getKnowledgeSettingsFromDb,
  isDatabaseConfigured,
  type KnowledgeSettingsPatch,
  updateKnowledgeSettingsInDb,
} from "@piphacklup/db";
import type { KnowledgeAssistantSettings } from "@piphacklup/core";
import { findManagedGuild, readDiscordSession } from "@/lib/discord-auth";

export async function GET(request: NextRequest) {
  const access = await requireTrainingAccess(request);
  if (access instanceof NextResponse) return access;

  return NextResponse.json({
    settings: await getKnowledgeSettingsFromDb(access.guild.id),
  });
}

export async function POST(request: NextRequest) {
  const access = await requireTrainingAccess(request);
  if (access instanceof NextResponse) return access;

  const body = (await request.json()) as Partial<KnowledgeAssistantSettings>;
  const patch: KnowledgeSettingsPatch = {};
  if (typeof body.minConfidence === "number") {
    patch.minConfidence = clamp(body.minConfidence, 1, 100);
  }
  if (typeof body.publicAnswers === "boolean") {
    patch.publicAnswers = body.publicAnswers;
  }
  if (typeof body.staffRoleId === "string") {
    patch.staffRoleId = body.staffRoleId || null;
  }
  if (typeof body.mentorRoleId === "string") {
    patch.mentorRoleId = body.mentorRoleId || null;
  }
  if (typeof body.helpChannelId === "string") {
    patch.helpChannelId = body.helpChannelId || null;
  }

  const settings = await updateKnowledgeSettingsInDb(access.guild, patch);

  return NextResponse.json({ settings });
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
