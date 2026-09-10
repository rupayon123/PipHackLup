import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import {
  pingDatabase,
  type PipHackLupDb,
  verifyDatabaseSchema,
} from "../src/client.js";

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

  it("checks the complete release schema without reading tenant rows", async () => {
    let executed: SQL | undefined;
    const db = {
      execute: vi.fn(async (query: SQL) => {
        executed = query;
        return { rows: [] };
      }),
    } as unknown as PipHackLupDb;

    await expect(verifyDatabaseSchema(db)).resolves.toBeUndefined();
    const query = new PgDialect().sqlToQuery(executed!).sql;
    expect(query).toContain("from guilds as g");
    expect(query).toContain("cross join discord_accounts as da");
    expect(query).toContain("g.resources");
    expect(query).toContain("da.token_refresh_lease_id");
    expect(query).toContain("where false");
  });
});
