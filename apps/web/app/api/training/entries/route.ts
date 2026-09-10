import { NextRequest, NextResponse } from "next/server";
import {
  createKnowledgeEntriesInDb,
  createKnowledgeEntryInDb,
  deleteKnowledgeEntryFromDb,
  listKnowledgeEntriesFromDb,
} from "@piphacklup/db";
import {
  assertKnowledgeTrainingIsSafe,
  KnowledgeSafetyError,
  normalizeKnowledgeTags,
  type KnowledgeEscalationTarget,
} from "@piphacklup/core";
import { requireOrganizerGuildAccess } from "@/lib/dashboard-security";
import { recordAuditAfterCommit } from "@/lib/audit-log";
import { webRateLimitPolicies } from "@/lib/rate-limit";
import { hasTrustedMutationOrigin } from "@/lib/request-security";
import { parseTrainingImport } from "@/lib/training-import";

const ENTRY_ID_PATTERN = /^know_[a-z0-9]{8,64}$/;
const escalationTargets = new Set<KnowledgeEscalationTarget>([
  "none",
  "mentor",
  "staff",
]);

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
  if (!hasTrustedMutationOrigin(request)) {
    return NextResponse.json(
      { error: "untrusted_request_origin" },
      { status: 403 },
    );
  }
  const access = await requireOrganizerGuildAccess(request, {
    action: "training-entries-write",
    rateLimit: webRateLimitPolicies.dashboardWrite,
  });
  if (access instanceof NextResponse) return access;

  const body = (await request.json().catch(() => null)) as {
    title?: string;
    answer?: string;
    tags?: string[] | string;
    escalationTarget?: KnowledgeEscalationTarget;
    importText?: string;
  } | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_json_body" }, { status: 400 });
  }
  if (
    body.escalationTarget !== undefined &&
    !escalationTargets.has(body.escalationTarget)
  ) {
    return NextResponse.json(
      { error: "invalid_escalation_target" },
      { status: 400 },
    );
  }

  try {
    if (body.importText) {
      if (
        typeof body.importText !== "string" ||
        body.importText.length > 50_000
      ) {
        return NextResponse.json(
          { error: "training_import_too_large" },
          { status: 400 },
        );
      }
      const parsedImport = parseTrainingImport(
        body.importText,
        body.escalationTarget ?? "none",
      );
      if (!parsedImport.ok) {
        return NextResponse.json(
          { error: parsedImport.error },
          { status: 400 },
        );
      }
      const parsed = parsedImport.entries;
      for (const entry of parsed) {
        assertKnowledgeTrainingIsSafe(entry);
      }
      const entries = await createKnowledgeEntriesInDb(
        parsed.map((entry) => ({
          guildId: access.guild.id,
          title: entry.title,
          answer: entry.answer,
          tags: entry.tags,
          escalationTarget: entry.escalationTarget,
          createdBy: access.session.user.id,
        })),
        access.guild,
      );
      const warning = await recordAuditAfterCommit({
        guildId: access.guild.id,
        actorId: access.session.user.id,
        action: "knowledge.import",
        targetType: "knowledge",
        targetId: access.guild.id,
        metadata: { count: entries.length },
      });
      return NextResponse.json({ entries, warning }, { status: 201 });
    }

    if (
      typeof body.title !== "string" ||
      typeof body.answer !== "string" ||
      !body.title.trim() ||
      !body.answer.trim() ||
      body.title.length > 200 ||
      body.answer.length > 4_000
    ) {
      return NextResponse.json(
        { error: "title_and_answer_required" },
        { status: 400 },
      );
    }

    const tags = Array.isArray(body.tags)
      ? body.tags
      : typeof body.tags === "string"
        ? body.tags.split(",")
        : [];
    if (
      !tags.every((tag) => typeof tag === "string" && tag.length <= 80) ||
      tags.length > 30
    ) {
      return NextResponse.json(
        { error: "invalid_training_tags" },
        { status: 400 },
      );
    }
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

    const warning = await recordAuditAfterCommit({
      guildId: access.guild.id,
      actorId: access.session.user.id,
      action: "knowledge.create",
      targetType: "knowledge",
      targetId: entry.id,
      metadata: { title: entry.title },
    });

    return NextResponse.json({ entry, warning }, { status: 201 });
  } catch (error) {
    const response = knowledgeSafetyResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function DELETE(request: NextRequest) {
  if (!hasTrustedMutationOrigin(request)) {
    return NextResponse.json(
      { error: "untrusted_request_origin" },
      { status: 403 },
    );
  }
  const access = await requireOrganizerGuildAccess(request, {
    action: "training-entries-delete",
    rateLimit: webRateLimitPolicies.dashboardWrite,
  });
  if (access instanceof NextResponse) return access;

  const entryId = request.nextUrl.searchParams.get("entryId");
  if (!entryId || !ENTRY_ID_PATTERN.test(entryId)) {
    return NextResponse.json({ error: "entry_id_required" }, { status: 400 });
  }

  const deleted = await deleteKnowledgeEntryFromDb(access.guild.id, entryId);
  let warning = null;
  if (deleted) {
    warning = await recordAuditAfterCommit({
      guildId: access.guild.id,
      actorId: access.session.user.id,
      action: "knowledge.delete",
      targetType: "knowledge",
      targetId: entryId,
      metadata: {},
    });
  }
  return NextResponse.json({ deleted, warning });
}

function knowledgeSafetyResponse(error: unknown): NextResponse | null {
  if (!(error instanceof KnowledgeSafetyError)) return null;

  return NextResponse.json(
    {
      error: "training_content_rejected",
      findings: error.findings.map((finding) => ({
        code: finding.code,
        severity: finding.severity,
        message: finding.message,
      })),
    },
    { status: 400 },
  );
}
