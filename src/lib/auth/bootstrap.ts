import "server-only";
import { withSystem } from "@/lib/db";
import { AUTH_SCHEMA_SQL, AUTH_SCHEMA_VERSION } from "@/lib/auth/schema-sql";
import { LEAVE_SCHEMA_SQL, LEAVE_SCHEMA_VERSION } from "@/lib/auth/leave-sql";
import { TEAMS_SCHEMA_SQL, TEAMS_SCHEMA_VERSION } from "@/lib/auth/teams-sql";

/**
 * Automatikus, idempotens sémalépések (sorrendben). Mindegyiket egy verziójelző
 * (megjegyzés az objektumon) azonosít; ha már megvan, kihagyjuk.
 */
const STEPS = [
  {
    version: AUTH_SCHEMA_VERSION,
    check: "select obj_description(to_regnamespace('better_auth'), 'pg_namespace') as v",
    sql: AUTH_SCHEMA_SQL,
  },
  {
    version: TEAMS_SCHEMA_VERSION,
    check: "select obj_description(to_regclass('public.memberships'), 'pg_class') as v",
    sql: TEAMS_SCHEMA_SQL,
  },
  {
    version: LEAVE_SCHEMA_VERSION,
    check: "select obj_description(to_regprocedure('public.leave_team()'), 'pg_proc') as v",
    sql: LEAVE_SCHEMA_SQL,
  },
];

let ready: Promise<void> | null = null;

/** Példányonként egyszer fut, tanácsadó zárral (párhuzamos indulásnál sem ütközik). */
export function ensureAuthSchema(): Promise<void> {
  ready ??= (async () => {
    await withSystem(async (db) => {
      for (const step of STEPS) {
        const row = await db.one<{ v: string | null }>(step.check);
        if (row?.v === step.version) continue;
        await db.query("begin");
        try {
          await db.query("select pg_advisory_xact_lock(hashtextextended('kibent-schema', 0))");
          const again = await db.one<{ v: string | null }>(step.check);
          if (again?.v !== step.version) await db.query(step.sql);
          await db.query("commit");
        } catch (error) {
          await db.query("rollback").catch(() => undefined);
          throw error;
        }
      }
    });
  })().catch((error) => {
    ready = null; // a következő kérés újrapróbálja
    throw error;
  });
  return ready;
}
