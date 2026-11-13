import "server-only";
import { withSystem } from "@/lib/db";
import { AUTH_SCHEMA_SQL, AUTH_SCHEMA_VERSION } from "@/lib/auth/schema-sql";

let ready: Promise<void> | null = null;

/**
 * A Better Auth séma (0004) automatikus létrehozása az első auth-hívás előtt.
 * Idempotens; példányonként egyszer fut, tanácsadó zárral, hogy párhuzamos
 * indulásnál se ütközzön.
 */
export function ensureAuthSchema(): Promise<void> {
  ready ??= (async () => {
    await withSystem(async (db) => {
      const row = await db.one<{ v: string | null }>(
        "select obj_description(to_regnamespace('better_auth'), 'pg_namespace') as v",
      );
      if (row?.v === AUTH_SCHEMA_VERSION) return;
      await db.query("begin");
      try {
        await db.query("select pg_advisory_xact_lock(hashtextextended('kibent-auth-schema', 0))");
        await db.query(AUTH_SCHEMA_SQL);
        await db.query("commit");
      } catch (error) {
        await db.query("rollback").catch(() => undefined);
        throw error;
      }
    });
  })().catch((error) => {
    ready = null; // a következő kérés újrapróbálja
    throw error;
  });
  return ready;
}
