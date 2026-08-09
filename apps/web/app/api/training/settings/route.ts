import { NextRequest, NextResponse } from "next/server";
import {
  getKnowledgeSettingsFromDb,
  type KnowledgeSettingsPatch,
  updateKnowledgeSettingsInDb,
} from "@piphacklup/db";
import { requireOrganizerGuildAccess } from "@/lib/dashboard-security";
import { recordAuditAfterCommit } from "@/lib/audit-log";
import { getDiscordGuildConfigurationOptions } from "@/lib/discord-installation";
import { webRateLimitPolicies } from "@/lib/rate-limit";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

const SNOWFLAKE_PATTERN = /^[1-9]\d{16,19}$/;

export async function GET(request: NextRequest) {
  const access = await requireOrganizerGuildAccess(request, {
    action: "training-settings-read",
    rateLimit: webRateLimitPolicies.dashboardRead,
  });
  if (access instanceof NextResponse) return access;

  return NextResponse.json({
    settings: await getKnowledgeSettingsFromDb(access.guild.id),
  });
}

export async function POST(request: NextRequest) {
  if (!hasTrustedMutationOrigin(request)) {
    return NextResponse.json(
      { error: "untrusted_request_origin" },
      { status: 403 },
    );
  }
  const access = await requireOrganizerGuildAccess(request, {
    action: "training-settings-write",
    rateLimit: webRateLimitPolicies.dashboardWrite,
  });
  if (access instanceof NextResponse) return access;

  const body = (await request.json().catch(() => null)) as unknown;
  if (!isRecord(body)) {
    return NextResponse.json({ error: "invalid_json_body" }, { status: 400 });
  }
  const patch: KnowledgeSettingsPatch = {};
  if (typeof body.minConfidence === "number") {
    patch.minConfidence = clamp(body.minConfidence, 1, 100);
  }
  if (typeof body.publicAnswers === "boolean") {
    patch.publicAnswers = body.publicAnswers;
  }
  for (const key of ["staffRoleId", "mentorRoleId", "helpChannelId"] as const) {
    if (!(key in body)) continue;
    const value = body[key];
    if (value === null || value === "") patch[key] = null;
    else if (typeof value === "string" && SNOWFLAKE_PATTERN.test(value)) {
      patch[key] = value;
    } else {
      return NextResponse.json(
        { error: "invalid_discord_option" },
        { status: 400 },
      );
    }
  }

  const hasDiscordSelection =
    Boolean(patch.staffRoleId) ||
    Boolean(patch.mentorRoleId) ||
    Boolean(patch.helpChannelId);
  if (hasDiscordSelection) {
    try {
      const options = await getDiscordGuildConfigurationOptions(
        access.guild.id,
      );
      const roleIds = new Set(options.roles.map((role) => role.id));
      const channelIds = new Set(options.channels.map((channel) => channel.id));
      if (
        (patch.staffRoleId && !roleIds.has(patch.staffRoleId)) ||
        (patch.mentorRoleId && !roleIds.has(patch.mentorRoleId)) ||
        (patch.helpChannelId && !channelIds.has(patch.helpChannelId))
      ) {
        return NextResponse.json(
          { error: "discord_option_no_longer_available" },
          { status: 400 },
        );
      }
    } catch {
      console.error("PipHackLup could not verify Discord settings.");
      return NextResponse.json(
        { error: "discord_options_unavailable" },
        { status: 503 },
      );
    }
  }

  const settings = await updateKnowledgeSettingsInDb(access.guild, patch);
  const warning = await recordAuditAfterCommit({
    guildId: access.guild.id,
    actorId: access.session.user.id,
    action: "knowledge.settings.update",
    targetType: "settings",
    targetId: access.guild.id,
    metadata: {
      minConfidence: settings.minConfidence,
      publicAnswers: settings.publicAnswers,
      staffRoleSelected: Boolean(settings.staffRoleId),
      mentorRoleSelected: Boolean(settings.mentorRoleId),
      helpChannelSelected: Boolean(settings.helpChannelId),
    },
  });

  return NextResponse.json({ settings, warning });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
