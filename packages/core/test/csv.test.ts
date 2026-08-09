import { describe, expect, it } from "vitest";
import { fromCsv, toCsv } from "../src/index.js";

describe("csv", () => {
  it("round-trips quoted fields", () => {
    const csv = toCsv([
      {
        name: "Penguin Labs",
        notes: "frontend, AI, and demos",
      },
    ]);

    expect(fromCsv(csv)).toEqual([
      {
        name: "Penguin Labs",
        notes: "frontend, AI, and demos",
      },
    ]);
  });

  it("neutralizes spreadsheet formulas in exported cells", () => {
    const csv = toCsv([
      {
        name: '=HYPERLINK("https://attacker.test")',
        notes: "+1+1",
      },
    ]);

    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+1+1");
  });
});
