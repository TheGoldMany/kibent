import "server-only";
import { Pool, types, type PoolClient, type QueryResultRow } from "pg";

// DATE / TIMESTAMP(TZ) maradjon szöveg: a naptárlogika 'yyyy-MM-dd' stringekkel dolgozik,
// így elkerüljük a JS Date időzóna-csúszását.
types.setTypeParser(1082, (v) => v); // date
types.setTypeParser(1114, (v) => v); // timestamp
types.setTypeParser(1184, (v) => v); // timestamptz

/**
 * Neon Postgres kapcsolat (pooled connection string, pl. ...-pooler.neon.tech).
 * Node.js futtatókörnyezetben a `pg` driver tranzakciókat és SET LOCAL-t is támogat,
 * ami az RLS-hez szükséges.
 */
const globalForPool = globalThis as unknown as { kibentPool?: Pool };

/**
 * A connection string sslmode/channel_binding paraméterei felülírnák a lenti
 * explicit `ssl` beállítást (és a pg elavulási figyelmeztetést ír ki), ezért kivesszük őket.
 */
function withoutSslParams(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    for (const key of ["sslmode", "channel_binding", "sslrootcert", "uselibpqcompat"]) url.searchParams.delete(key);
    return url.toString();
  } catch {
    return connectionString;
  }
}

function getPool(): Pool {
  if (!globalForPool.kibentPool) {
    const raw = process.env.DATABASE_URL;
    if (!raw) throw new Error("Hiányzó környezeti változó: DATABASE_URL. Lásd: .env.example");
    const isLocal = /localhost|127\.0\.0\.1/.test(raw);
    globalForPool.kibentPool = new Pool({
      connectionString: isLocal ? raw : withoutSslParams(raw),
      max: 5,
      idleTimeoutMillis: 10_000,
      // Neon TLS-t követel meg: teljes tanúsítvány-ellenőrzés (verify-full). Helyi teszthez nem kell.
      ssl: isLocal ? undefined : { rejectUnauthorized: true },
    });
  }
  return globalForPool.kibentPool;
}

export type Tx = {
  query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<T[]>;
  one<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<T | null>;
};

function wrap(client: PoolClient): Tx {
  return {
    async query<T extends QueryResultRow>(text: string, params?: unknown[]) {
      const res = await client.query<T>(text, params);
      return res.rows;
    },
    async one<T extends QueryResultRow>(text: string, params?: unknown[]) {
      const res = await client.query<T>(text, params);
      return res.rows[0] ?? null;
    },
  };
}

/**
 * Felhasználói kontextusban futó tranzakció: korlátozott `kibent_app` szerepkör
 * + `app.user_id`, így MINDEN lekérdezésre érvényesek az RLS szabályok.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  // A felhasználó-azonosító literálként kerül az SQL-be (egyetlen oda-vissza út a három
  // beállító utasításra), ezért szigorúan UUID-nak kell lennie.
  if (!UUID_RE.test(userId)) throw new Error("Érvénytelen felhasználó-azonosító.");
  const client = await getPool().connect();
  try {
    // Egy hálózati kör: tranzakció + korlátozott szerepkör + app.user_id
    await client.query(
      `begin; set local role kibent_app; select set_config('app.user_id', '${userId.toLowerCase()}', true)`,
    );
    const result = await fn(wrap(client));
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Tulajdonosi (RLS-t megkerülő) lekérdezés. KIZÁRÓLAG az iCal feed használja,
 * ahol nincs süti, és a hozzáférést az ical_token azonosítja.
 */
export async function withSystem<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(wrap(client));
  } finally {
    client.release();
  }
}

/** Postgres hibából felhasználóbarát magyar üzenet. */
export function dbErrorMessage(error: unknown): string {
  const e = error as { code?: string; message?: string };
  if (e?.code === "42501") {
    // Saját triggereink/RPC-ink magyar üzenetet adnak, az RLS/jogosultság angolt.
    if (e.message && /row-level security|permission denied/i.test(e.message)) {
      return "Nincs jogosultságod ehhez a művelethez.";
    }
    return e.message ?? "Nincs jogosultságod ehhez a művelethez.";
  }
  if (e?.code && ["P0001", "P0002", "22023", "23505", "23514"].includes(e.code) && e.message) {
    if (e.code === "23505" && /duplicate key/i.test(e.message)) return "Ez a bejegyzés már létezik.";
    return e.message;
  }
  console.error("[db]", error);
  return "Váratlan adatbázis-hiba történt. Próbáld újra később.";
}
