import { NextRequest, NextResponse } from "next/server";
import { toCsv, type CsvRow } from "@piphacklup/core";
import { getGuildDashboardDataFromDb } from "@piphacklup/db";
import { requireOrganizerGuildAccess } from "@/lib/dashboard-security";
import { webRateLimitPolicies } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const access = await requireOrganizerGuildAccess(request, {
    action: "guild-export-read",
    rateLimit: webRateLimitPolicies.publicExport,
  });
  if (access instanceof NextResponse) return access;

  try {
    const data = await getGuildDashboardDataFromDb(access.guild.id);
    const rows: CsvRow[] = [
      ...data.profiles.map((profile) => ({
        type: "member",
        id: profile.userId,
        name: profile.displayName,
        status: profile.lookingForTeam ? "looking_for_team" : "not_looking",
        detail: profile.skills.join("; "),
      })),
      ...data.teams.map((team) => ({
        type: "team",
        id: team.id,
        name: team.name,
        status: team.status,
        detail: `${team.memberIds.length}/${team.maxSize} members`,
      })),
      ...data.tickets.map((ticket) => ({
        type: "ticket",
        id: ticket.id,
        name: ticket.topic,
        status: ticket.status,
        detail: ticket.kind,
      })),
      ...data.moderationCases.map((moderationCase) => ({
        type: "moderation_case",
        id: moderationCase.id,
        name: moderationCase.action,
        status: moderationCase.status,
        detail: moderationCase.reason,
      })),
    ];
    const filename = `${safeFilename(access.guild.name)}-piphacklup-export.csv`;
    return new NextResponse(
      toCsv(rows, ["type", "id", "name", "status", "detail"]),
      {
        headers: {
          "cache-control": "private, no-store",
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${filename}"`,
          "x-content-type-options": "nosniff",
        },
      },
    );
  } catch {
    console.error("PipHackLup could not export server data.");
    return NextResponse.json(
      { error: "guild_export_unavailable" },
      { status: 503 },
    );
  }
}

function safeFilename(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return normalized || "discord-server";
}
