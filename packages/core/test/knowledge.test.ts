import { describe, expect, it } from "vitest";
import {
  answerHackathonQuestion,
  createKnowledgeEntry,
  parseKnowledgeImportText,
  rankKnowledgeEntries,
} from "../src/index.js";

const now = "2026-06-07T10:00:00.000Z";

describe("knowledge assistant", () => {
  it("answers participant questions from staff-trained event details", () => {
    const entry = createKnowledgeEntry({
      guildId: "g1",
      title: "Judging schedule",
      answer: "Project demos start Sunday at 2 PM in the judging rooms.",
      tags: ["judging", "schedule", "demo"],
      createdBy: "staff1",
      now,
    });

    const result = answerHackathonQuestion("When are demos and judging?", [
      entry,
    ]);

    expect(result.answer).toContain("Sunday at 2 PM");
    expect(result.confidence).toBeGreaterThanOrEqual(45);
    expect(result.shouldEscalate).toBe(false);
    expect(result.matchedEntry?.id).toBe(entry.id);
  });

  it("escalates when no confident training entry exists", () => {
    const result = answerHackathonQuestion(
      "Can I get reimbursed for my train ticket?",
      [],
      {
        minConfidence: 50,
      },
    );

    expect(result.shouldEscalate).toBe(true);
    expect(result.escalationTarget).toBe("staff");
    expect(result.answer).toContain("pulling in the team");
  });

  it("escalates matched entries that staff marked as needing a mentor", () => {
    const entry = createKnowledgeEntry({
      guildId: "g1",
      title: "Hardware debugging",
      answer:
        "Open a mentor queue ticket with your board type and the error text.",
      tags: ["hardware", "arduino", "debug"],
      escalationTarget: "mentor",
      createdBy: "staff1",
      now,
    });

    const result = answerHackathonQuestion("My Arduino hardware is stuck", [
      entry,
    ]);

    expect(result.answer).toContain("mentor queue");
    expect(result.shouldEscalate).toBe(true);
    expect(result.escalationTarget).toBe("mentor");
  });

  it("ranks stronger tag and title matches first", () => {
    const schedule = createKnowledgeEntry({
      guildId: "g1",
      title: "Opening ceremony schedule",
      answer: "Opening ceremony starts at 9 AM.",
      tags: ["opening", "schedule"],
      createdBy: "staff1",
      now,
    });
    const food = createKnowledgeEntry({
      guildId: "g1",
      title: "Food",
      answer: "Lunch is in the atrium.",
      tags: ["lunch"],
      createdBy: "staff1",
      now,
    });

    expect(
      rankKnowledgeEntries("opening schedule time", [food, schedule])[0]?.entry
        .id,
    ).toBe(schedule.id);
  });

  it("parses staff bulk import lines", () => {
    const imported = parseKnowledgeImportText(
      [
        "Schedule | Opening ceremony is 9 AM in the auditorium. | schedule, opening | none",
        "Safety | DM staff for safety issues. | safety, conduct | staff",
        "Bring your laptop and charger.",
      ].join("\n"),
    );

    expect(imported).toEqual([
      {
        title: "Schedule",
        answer: "Opening ceremony is 9 AM in the auditorium.",
        tags: ["schedule", "opening"],
        escalationTarget: "none",
      },
      {
        title: "Safety",
        answer: "DM staff for safety issues.",
        tags: ["safety", "conduct"],
        escalationTarget: "staff",
      },
      {
        title: "Event detail 3",
        answer: "Bring your laptop and charger.",
        tags: [],
        escalationTarget: "none",
      },
    ]);
  });
});
