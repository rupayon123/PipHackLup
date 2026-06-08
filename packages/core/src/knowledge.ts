import { createId } from "./ids.js";
import {
  analyzePromptInjectionRisk,
  assertKnowledgeTrainingIsSafe,
} from "./security.js";
import type {
  HackathonKnowledgeEntry,
  KnowledgeAnswerResult,
  KnowledgeAssistantSettings,
  KnowledgeEscalationTarget,
  Snowflake,
} from "./types.js";

export interface CreateKnowledgeEntryInput {
  guildId: Snowflake;
  title: string;
  answer: string;
  tags?: string[];
  escalationTarget?: KnowledgeEscalationTarget;
  createdBy: Snowflake;
  now?: string;
}

export interface ParsedKnowledgeImport {
  title: string;
  answer: string;
  tags: string[];
  escalationTarget: KnowledgeEscalationTarget;
}

export const defaultKnowledgeSettings: KnowledgeAssistantSettings = {
  minConfidence: 45,
  publicAnswers: true,
};

const stopwords = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "can",
  "do",
  "does",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "to",
  "we",
  "what",
  "when",
  "where",
  "who",
  "why",
  "with",
]);

const mentorSignals = [
  "mentor",
  "debug",
  "stuck",
  "technical",
  "bug",
  "code",
  "api",
  "deploy",
  "hardware",
  "circuit",
  "arduino",
];

const staffSignals = [
  "staff",
  "organizer",
  "emergency",
  "harassment",
  "safety",
  "conduct",
  "rule",
  "rules",
  "dispute",
  "appeal",
  "late",
  "reimbursement",
  "travel",
  "locked",
  "lost",
  "medical",
  "food",
  "allergy",
  "team conflict",
  "judge",
];

export function createKnowledgeEntry(
  input: CreateKnowledgeEntryInput,
): HackathonKnowledgeEntry {
  const now = input.now ?? new Date().toISOString();
  assertKnowledgeTrainingIsSafe({
    title: input.title,
    answer: input.answer,
  });

  return {
    id: createId("know"),
    guildId: input.guildId,
    title: input.title.trim(),
    answer: input.answer.trim(),
    tags: normalizeKnowledgeTags(input.tags ?? []),
    escalationTarget: input.escalationTarget ?? "none",
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };
}

export function answerHackathonQuestion(
  question: string,
  entries: HackathonKnowledgeEntry[],
  settings: Partial<KnowledgeAssistantSettings> = {},
): KnowledgeAnswerResult {
  const mergedSettings = { ...defaultKnowledgeSettings, ...settings };
  const cleanQuestion = question.trim();
  const safetyFindings = analyzePromptInjectionRisk(cleanQuestion).filter(
    (finding) => finding.severity === "high",
  );

  if (safetyFindings.length > 0) {
    return {
      question: cleanQuestion,
      answer:
        "I cannot follow instruction-override requests or reveal private bot configuration. I am pulling in staff so they can handle this safely.",
      confidence: 0,
      shouldEscalate: true,
      escalationTarget: "staff",
      escalationReason: "Question matched prompt-injection safety filters.",
    };
  }

  const ranked = rankKnowledgeEntries(cleanQuestion, entries);
  const best = ranked[0];
  const confidence = best?.confidence ?? 0;
  const lowConfidence = confidence < mergedSettings.minConfidence;
  const signalTarget = detectEscalationTarget(cleanQuestion);
  const entryTarget = best?.entry.escalationTarget ?? "none";
  const escalationTarget =
    entryTarget !== "none"
      ? entryTarget
      : signalTarget !== "none"
        ? signalTarget
        : lowConfidence
          ? "staff"
          : "none";
  const shouldEscalate = lowConfidence || escalationTarget !== "none";

  if (!best || lowConfidence) {
    return {
      question: cleanQuestion,
      answer:
        "I do not know that from the staff-trained hackathon details yet. I am pulling in the team so they can answer and improve my training.",
      confidence,
      shouldEscalate: true,
      escalationTarget,
      escalationReason: "No confident matching training entry was found.",
    };
  }

  return {
    question: cleanQuestion,
    answer: best.entry.answer,
    confidence,
    matchedEntry: best.entry,
    shouldEscalate,
    escalationTarget,
    escalationReason:
      escalationTarget === "none"
        ? "Answered from staff-trained hackathon details."
        : `Matched training entry is marked for ${escalationTarget} follow-up.`,
  };
}

export function rankKnowledgeEntries(
  question: string,
  entries: HackathonKnowledgeEntry[],
): Array<{
  entry: HackathonKnowledgeEntry;
  confidence: number;
  score: number;
}> {
  const queryTokens = tokenize(question);
  if (queryTokens.length === 0) return [];

  return entries
    .map((entry) => {
      const tagTokens = new Set(entry.tags.flatMap((tag) => tokenize(tag)));
      const titleTokens = new Set(tokenize(entry.title));
      const answerTokens = new Set(tokenize(entry.answer));
      const normalizedTitle = normalizeText(entry.title);
      const normalizedQuestion = normalizeText(question);

      let score =
        normalizedTitle.includes(normalizedQuestion) ||
        normalizedQuestion.includes(normalizedTitle)
          ? 6
          : 0;
      for (const token of queryTokens) {
        if (tagTokens.has(token)) score += 6;
        if (titleTokens.has(token)) score += 4;
        if (answerTokens.has(token)) score += 1.5;
      }

      const confidence = Math.min(
        100,
        Math.round((score / Math.max(queryTokens.length * 6, 1)) * 100),
      );
      return { entry, confidence, score };
    })
    .filter((item) => item.score > 0)
    .toSorted(
      (left, right) =>
        right.confidence - left.confidence || right.score - left.score,
    );
}

export function parseKnowledgeImportText(
  text: string,
  fallbackEscalationTarget: KnowledgeEscalationTarget = "none",
): ParsedKnowledgeImport[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split("|").map((part) => part.trim());
      const rawTitle = parts[0] ?? "";
      const rawAnswer = parts[1] ?? "";
      const rawTags = parts[2] ?? "";
      const rawEscalation = parts[3] ?? "";
      if (rawAnswer) {
        return {
          title: rawTitle,
          answer: rawAnswer,
          tags: normalizeKnowledgeTags((rawTags ?? "").split(",")),
          escalationTarget: parseEscalationTarget(
            rawEscalation,
            fallbackEscalationTarget,
          ),
        };
      }

      return {
        title: `Event detail ${index + 1}`,
        answer: rawTitle,
        tags: [],
        escalationTarget: fallbackEscalationTarget,
      };
    })
    .filter((entry) => entry.title.length > 0 && entry.answer.length > 0);
}

export function normalizeKnowledgeTags(tags: string[]): string[] {
  return [
    ...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)),
  ].slice(0, 16);
}

function parseEscalationTarget(
  value: string | undefined,
  fallback: KnowledgeEscalationTarget,
): KnowledgeEscalationTarget {
  if (value === "mentor" || value === "staff" || value === "none") return value;
  return fallback;
}

function detectEscalationTarget(question: string): KnowledgeEscalationTarget {
  const normalized = normalizeText(question);
  if (staffSignals.some((signal) => normalized.includes(signal)))
    return "staff";
  if (mentorSignals.some((signal) => normalized.includes(signal)))
    return "mentor";
  return "none";
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 1 && !stopwords.has(token));
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .trim();
}
