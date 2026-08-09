import {
  parseKnowledgeImportText,
  type KnowledgeEscalationTarget,
  type ParsedKnowledgeImport,
} from "@piphacklup/core";

export const maximumTrainingImportEntries = 50;

export type TrainingImportParseResult =
  | { ok: true; entries: ParsedKnowledgeImport[] }
  | {
      ok: false;
      error: "training_import_empty" | "training_import_too_many_entries";
    };

export function parseTrainingImport(
  text: string,
  fallbackEscalationTarget: KnowledgeEscalationTarget,
): TrainingImportParseResult {
  const entries = parseKnowledgeImportText(text, fallbackEscalationTarget);
  if (!entries.length) return { ok: false, error: "training_import_empty" };
  if (entries.length > maximumTrainingImportEntries) {
    return { ok: false, error: "training_import_too_many_entries" };
  }
  return { ok: true, entries };
}
