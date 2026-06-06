import { describe, expect, it } from "vitest";
import { fromCsv, toCsv } from "../src/index.js";

describe("csv", () => {
  it("round-trips quoted fields", () => {
    const csv = toCsv([
      {
        name: "Penguin Labs",
        notes: "frontend, AI, and demos"
      }
    ]);

    expect(fromCsv(csv)).toEqual([
      {
        name: "Penguin Labs",
        notes: "frontend, AI, and demos"
      }
    ]);
  });
});
