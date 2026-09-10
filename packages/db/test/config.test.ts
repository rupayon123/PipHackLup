import { afterEach, describe, expect, it } from "vitest";
import { isDatabaseConfigured } from "../src/knowledge.js";

const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
});

describe("database configuration", () => {
  it("rejects missing and documented placeholder URLs", () => {
    delete process.env.DATABASE_URL;
    expect(isDatabaseConfigured()).toBe(false);

    process.env.DATABASE_URL = "postgres://user:password@host:5432/piphacklup";
    expect(isDatabaseConfigured()).toBe(false);
  });

  it("accepts a non-placeholder Postgres URL", () => {
    process.env.DATABASE_URL = "postgres://local.test/piphacklup";
    expect(isDatabaseConfigured()).toBe(true);
  });
});
