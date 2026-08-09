import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import type { PipHackLupDb } from "../src/client.js";
import { consumeRateLimitInDb } from "../src/rate-limit.js";
import { rateLimitBuckets } from "../src/schema.js";

function createFakeDb(result: { count: number; resetAt: Date }) {
  let insertedTable: object | undefined;
  let insertedValues: Record<string, unknown> | undefined;
  let deletedTable: object | undefined;
  let deleteWhere: SQL | undefined;
  let conflictConfig:
    | { set: { count: SQL; resetAt: SQL; updatedAt: Date } }
    | undefined;
  const db = {
    delete: vi.fn((table: object) => {
      deletedTable = table;
      const chain = {
        where(where: SQL) {
          deleteWhere = where;
          return chain;
        },
      };
      return chain;
    }),
    insert: vi.fn((table: object) => {
      insertedTable = table;
      const chain = {
        values(values: Record<string, unknown>) {
          insertedValues = values;
          return chain;
        },
        onConflictDoUpdate(config: {
          set: { count: SQL; resetAt: SQL; updatedAt: Date };
        }) {
          conflictConfig = config;
          return chain;
        },
        returning() {
          return chain;
        },
      };
      return chain;
    }),
    batch: vi.fn(async () => [undefined, [result]]),
  };
  return {
    db: db as unknown as PipHackLupDb,
    getConflictConfig: () => conflictConfig,
    getDeletedTable: () => deletedTable,
    getDeleteWhere: () => deleteWhere,
    getInsertedTable: () => insertedTable,
    getInsertedValues: () => insertedValues,
  };
}

describe("shared rate limiting", () => {
  it("cleans expired rows and atomically upserts an allowed shared bucket", async () => {
    const now = new Date("2026-08-09T16:00:00.000Z");
    const resetAt = new Date("2026-08-09T16:01:00.000Z");
    const fake = createFakeDb({ count: 2, resetAt });

    await expect(
      consumeRateLimitInDb(
        { keyHash: "a".repeat(64), limit: 30, windowMs: 60_000, now },
        fake.db,
      ),
    ).resolves.toEqual({
      allowed: true,
      count: 2,
      limit: 30,
      remaining: 28,
      resetAt,
    });

    expect(fake.getInsertedTable()).toBe(rateLimitBuckets);
    expect(fake.getDeletedTable()).toBe(rateLimitBuckets);
    expect(new PgDialect().sqlToQuery(fake.getDeleteWhere()!).params).toContain(
      now.toISOString(),
    );
    expect(fake.getInsertedValues()).toMatchObject({
      keyHash: "a".repeat(64),
      count: 1,
      resetAt,
      updatedAt: now,
    });
    const countSql = fake.getConflictConfig()?.set.count;
    expect(countSql).toBeDefined();
    expect(new PgDialect().sqlToQuery(countSql!).sql).toContain("case when");
  });

  it("blocks a bucket once its shared count exceeds the policy", async () => {
    const resetAt = new Date("2026-08-09T16:05:00.000Z");
    const fake = createFakeDb({ count: 21, resetAt });

    await expect(
      consumeRateLimitInDb(
        {
          keyHash: "b".repeat(64),
          limit: 20,
          windowMs: 300_000,
          now: new Date("2026-08-09T16:00:00.000Z"),
        },
        fake.db,
      ),
    ).resolves.toMatchObject({
      allowed: false,
      count: 21,
      limit: 20,
      remaining: 0,
      resetAt,
    });
  });
});
