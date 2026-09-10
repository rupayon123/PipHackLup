import { NextRequest, NextResponse } from "next/server";
import type { EventConfig } from "@piphacklup/core";
import { getGuildConfigFromDb, saveGuildConfigInDb } from "@piphacklup/db";
import { requireOrganizerGuildAccess } from "@/lib/dashboard-security";
import { recordAuditAfterCommit } from "@/lib/audit-log";
import { getDiscordGuildConfigurationOptions } from "@/lib/discord-installation";
import { webRateLimitPolicies } from "@/lib/rate-limit";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

const SNOWFLAKE_PATTERN = /^[1-9]\d{16,19}$/;
const ROLE_KEYS = [
  "newcomer",
  "participant",
  "mentor",
  "judge",
  "organizer",
  "moderator",
] as const;
const CHANNEL_KEYS = [
  "welcome",
  "rules",
  "announcements",
  "helpDesk",
  "teamCatalog",
  "moderationLog",
  "auditLog",
] as const;

interface RouteContext {
  params: Promise<{ guildId: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  if (!hasTrustedMutationOrigin(request)) {
    return NextResponse.json(
      { error: "untrusted_request_origin" },
      { status: 403 },
    );
  }

  const { guildId } = await context.params;
  const access = await requireOrganizerGuildAccess(request, {
    action: "discord-guild-config-write",
    rateLimit: webRateLimitPolicies.dashboardWrite,
    guildId,
  });
  if (access instanceof NextResponse) return access;

  const body = (await request.json().catch(() => null)) as unknown;
  const parsed = parseConfigBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  let current: EventConfig | null;
  try {
    current = await getGuildConfigFromDb(access.guild.id);
  } catch {
    console.error("PipHackLup could not load the saved server configuration.");
    return NextResponse.json(
      { error: "server_config_unavailable" },
      { status: 503 },
    );
  }

  const roles = mergeSelections(current?.roles ?? {}, parsed.roles, ROLE_KEYS);
  const channels = mergeSelections(
    current?.channels ?? {},
    parsed.channels,
    CHANNEL_KEYS,
  );
  const selectedRoleIds = Object.values(roles);
  const selectedChannelIds = Object.values(channels);

  if (selectedRoleIds.length || selectedChannelIds.length) {
    try {
      const options = await getDiscordGuildConfigurationOptions(
        access.guild.id,
      );
      const roleIds = new Set(options.roles.map((role) => role.id));
      const channelIds = new Set(options.channels.map((channel) => channel.id));
      if (
        selectedRoleIds.some((id) => !roleIds.has(id)) ||
        selectedChannelIds.some((id) => !channelIds.has(id))
      ) {
        return NextResponse.json(
          { error: "discord_option_no_longer_available" },
          { status: 400 },
        );
      }
    } catch {
      console.error("PipHackLup could not verify Discord server settings.");
      return NextResponse.json(
        { error: "discord_options_unavailable" },
        { status: 503 },
      );
    }
  }

  const config: EventConfig = {
    guildId: access.guild.id,
    eventName: parsed.eventName,
    onboardingMode: parsed.onboardingMode,
    teamSizeMin: parsed.teamSizeMin,
    teamSizeMax: parsed.teamSizeMax,
    queueKinds: current?.queueKinds ?? ["mentor", "tech", "judging", "staff"],
    roles,
    channels,
    resources: current?.resources ?? {},
  };

  try {
    await saveGuildConfigInDb(config, access.guild.name);
  } catch {
    console.error("PipHackLup could not save the server configuration.");
    return NextResponse.json(
      { error: "server_config_save_failed" },
      { status: 503 },
    );
  }

  const warning = await recordAuditAfterCommit({
    guildId: access.guild.id,
    actorId: access.session.user.id,
    action: "guild.config.update",
    targetType: "guild",
    targetId: access.guild.id,
    metadata: {
      onboardingMode: config.onboardingMode,
      teamSizeMin: config.teamSizeMin,
      teamSizeMax: config.teamSizeMax,
      roleCount: Object.keys(config.roles).length,
      channelCount: Object.keys(config.channels).length,
    },
  });

  return NextResponse.json(
    { config, warning },
    { headers: { "cache-control": "private, no-store" } },
  );
}

type SelectionPatch = Record<string, string | null>;

type ParsedConfigBody =
  | {
      ok: true;
      eventName: string;
      onboardingMode: EventConfig["onboardingMode"];
      teamSizeMin: number;
      teamSizeMax: number;
      roles: SelectionPatch;
      channels: SelectionPatch;
    }
  | { ok: false; error: string };

function parseConfigBody(value: unknown): ParsedConfigBody {
  if (!isRecord(value)) return { ok: false, error: "invalid_json_body" };
  const allowedTopLevel = new Set([
    "eventName",
    "onboardingMode",
    "teamSizeMin",
    "teamSizeMax",
    "roles",
    "channels",
  ]);
  if (Object.keys(value).some((key) => !allowedTopLevel.has(key))) {
    return { ok: false, error: "invalid_server_config" };
  }

  const eventName =
    typeof value.eventName === "string" ? value.eventName.trim() : "";
  if (!eventName || eventName.length > 80) {
    return { ok: false, error: "invalid_event_name" };
  }
  const onboardingMode = value.onboardingMode;
  if (onboardingMode !== "guided" && onboardingMode !== "gated") {
    return { ok: false, error: "invalid_onboarding_mode" };
  }
  const teamSizeMin = value.teamSizeMin;
  const teamSizeMax = value.teamSizeMax;
  if (
    !Number.isInteger(teamSizeMin) ||
    !Number.isInteger(teamSizeMax) ||
    (teamSizeMin as number) < 1 ||
    (teamSizeMax as number) > 20 ||
    (teamSizeMin as number) > (teamSizeMax as number)
  ) {
    return { ok: false, error: "invalid_team_size" };
  }

  const roles = parseSelectionPatch(value.roles, ROLE_KEYS);
  const channels = parseSelectionPatch(value.channels, CHANNEL_KEYS);
  if (!roles || !channels) {
    return { ok: false, error: "invalid_discord_option" };
  }

  return {
    ok: true,
    eventName,
    onboardingMode,
    teamSizeMin: teamSizeMin as number,
    teamSizeMax: teamSizeMax as number,
    roles,
    channels,
  };
}

function parseSelectionPatch(
  value: unknown,
  allowedKeys: readonly string[],
): SelectionPatch | null {
  if (!isRecord(value)) return null;
  const allowed = new Set(allowedKeys);
  if (Object.keys(value).some((key) => !allowed.has(key))) return null;

  const patch: SelectionPatch = {};
  for (const key of allowedKeys) {
    if (!(key in value)) continue;
    const selected = value[key];
    if (selected === null || selected === "") patch[key] = null;
    else if (typeof selected === "string" && SNOWFLAKE_PATTERN.test(selected)) {
      patch[key] = selected;
    } else {
      return null;
    }
  }
  return patch;
}

function mergeSelections<T extends string>(
  current: Partial<Record<T, string>>,
  patch: SelectionPatch,
  keys: readonly T[],
): Partial<Record<T, string>> {
  const merged: Partial<Record<T, string>> = {};
  for (const key of keys) {
    const next = Object.hasOwn(patch, key) ? patch[key] : current[key];
    if (next) merged[key] = next;
  }
  return merged;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
