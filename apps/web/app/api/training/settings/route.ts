import { NextRequest, NextResponse } from "next/server";
import {
  getKnowledgeSettingsFromDb,
  type KnowledgeSettingsPatch,
  updateKnowledgeSettingsInDb,
} from "@piphacklup/db";
import type { KnowledgeAssistantSettings } from "@piphacklup/core";
import { requireOrganizerGuildAccess } from "@/lib/dashboard-security";
import { webRateLimitPolicies } from "@/lib/rate-limit";

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
  const access = await requireOrganizerGuildAccess(request, {
    action: "training-settings-write",
    rateLimit: webRateLimitPolicies.dashboardWrite,
  });
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
