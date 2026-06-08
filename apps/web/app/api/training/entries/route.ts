import { NextRequest, NextResponse } from "next/server";
import {
  createKnowledgeEntryInDb,
  deleteKnowledgeEntryFromDb,
  listKnowledgeEntriesFromDb,
} from "@piphacklup/db";
import {
  assertKnowledgeTrainingIsSafe,
  KnowledgeSafetyError,
  normalizeKnowledgeTags,
  parseKnowledgeImportText,
  type KnowledgeEscalationTarget,
} from "@piphacklup/core";
import { requireOrganizerGuildAccess } from "@/lib/dashboard-security";
import { webRateLimitPolicies } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const access = await requireOrganizerGuildAccess(request, {
    action: "training-entries-read",
    rateLimit: webRateLimitPolicies.dashboardRead,
  });
  if (access instanceof NextResponse) return access;

  return NextResponse.json({
    entries: await listKnowledgeEntriesFromDb(access.guild.id),
  });
}

export async function POST(request: NextRequest) {
  const access = await requireOrganizerGuildAccess(request, {
    action: "training-entries-write",
    rateLimit: webRateLimitPolicies.dashboardWrite,
  });
  if (access instanceof NextResponse) return access;

  const body = (await request.json()) as {
    title?: string;
    answer?: string;
    tags?: string[] | string;
    escalationTarget?: KnowledgeEscalationTarget;
    importText?: string;
  };

  try {
    if (body.importText) {
      const parsed = parseKnowledgeImportText(
        body.importText,
        body.escalationTarget ?? "none",
      ).slice(0, 50);
      for (const entry of parsed) {
        assertKnowledgeTrainingIsSafe(entry);
      }
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
  } catch (error) {
    const response = knowledgeSafetyResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function DELETE(request: NextRequest) {
  const access = await requireOrganizerGuildAccess(request, {
    action: "training-entries-delete",
    rateLimit: webRateLimitPolicies.dashboardWrite,
  });
  if (access instanceof NextResponse) return access;

  const entryId = request.nextUrl.searchParams.get("entryId");
  if (!entryId) {
    return NextResponse.json({ error: "entry_id_required" }, { status: 400 });
  }

  const deleted = await deleteKnowledgeEntryFromDb(access.guild.id, entryId);
  return NextResponse.json({ deleted });
}

function knowledgeSafetyResponse(error: unknown): NextResponse | null {
  if (!(error instanceof KnowledgeSafetyError)) return null;

  return NextResponse.json(
    {
      error: "training_prompt_injection_blocked",
      findings: error.findings.map((finding) => ({
        code: finding.code,
        severity: finding.severity,
        message: finding.message,
      })),
    },
    { status: 400 },
  );
}
