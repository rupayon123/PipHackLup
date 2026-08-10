import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema.js";

export type PipHackLupDb = NeonHttpDatabase<typeof schema>;

let db: PipHackLupDb | null = null;

export function getDb(): PipHackLupDb {
  if (!db) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error(
        "DATABASE_URL is required to initialize the PipHackLup database client.",
      );
    }
    db = drizzle(neon(databaseUrl), { schema });
  }

  return db;
}

/** Verify that the configured database can execute a query, even when no guild exists yet. */
export async function pingDatabase(db: PipHackLupDb = getDb()): Promise<void> {
  await db.execute(sql`select 1 as "ok"`);
}

/**
 * Prove that every table and critical column required by the current release
 * exists. `where false` makes PostgreSQL parse and plan the complete shape
 * without reading tenant rows, so a missing migration fails readiness.
 */
export async function verifyDatabaseSchema(
  db: PipHackLupDb = getDb(),
): Promise<void> {
  await db.execute(sql`
    select
      g.resources,
      da.token_refresh_lease_id,
      ds.revoked_at,
      rb.reset_at,
      di.removed_at,
      mp.looking_for_team,
      t.status,
      tm.joined_at,
      qt.status,
      mc.status,
      ke.escalation_target,
      ks.mentor_role_id,
      ae.metadata
    from guilds as g
    cross join discord_accounts as da
    cross join discord_sessions as ds
    cross join rate_limit_buckets as rb
    cross join discord_installations as di
    cross join member_profiles as mp
    cross join teams as t
    cross join team_members as tm
    cross join queue_tickets as qt
    cross join moderation_cases as mc
    cross join knowledge_entries as ke
    cross join knowledge_settings as ks
    cross join audit_events as ae
    where false
  `);
}
