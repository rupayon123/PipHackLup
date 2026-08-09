import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { pingDatabase, type PipHackLupDb } from "../src/client.js";

describe("database connectivity", () => {
  it("executes a zero-guild health query", async () => {
    let executed: SQL | undefined;
    const db = {
      execute: vi.fn(async (query: SQL) => {
        executed = query;
        return { rows: [{ ok: 1 }] };
      }),
    } as unknown as PipHackLupDb;

    await expect(pingDatabase(db)).resolves.toBeUndefined();
    expect(executed).toBeDefined();
    expect(new PgDialect().sqlToQuery(executed!).sql).toContain(
      'select 1 as "ok"',
    );
  });
});
