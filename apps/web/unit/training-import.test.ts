import { describe, expect, it } from "vitest";
import {
  maximumTrainingImportEntries,
  parseTrainingImport,
} from "../lib/training-import";

describe("training import limits", () => {
  it("rejects more than 50 parsed entries instead of silently truncating", () => {
    const importText = Array.from(
      { length: maximumTrainingImportEntries + 1 },
      (_, index) => `Question ${index + 1} | Answer ${index + 1}`,
    ).join("\n");

    expect(parseTrainingImport(importText, "none")).toEqual({
      ok: false,
      error: "training_import_too_many_entries",
    });
  });

  it("accepts exactly 50 parsed entries without dropping any", () => {
    const importText = Array.from(
      { length: maximumTrainingImportEntries },
      (_, index) => `Question ${index + 1} | Answer ${index + 1}`,
    ).join("\n");

    const result = parseTrainingImport(importText, "staff");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entries).toHaveLength(maximumTrainingImportEntries);
      expect(result.entries.at(-1)?.answer).toBe("Answer 50");
    }
  });
});
