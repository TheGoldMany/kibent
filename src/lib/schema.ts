import "server-only";
import { withSystem } from "@/lib/db";

/**
 * Le van-e futtatva a 0002-es migráció (munkaidő, ebédszünet, meghívók)?
 * Amíg nincs, ezek a funkciók kikapcsolt állapotban jelennek meg, minden más működik.
 * Igaz eredményt végleg, hamisat 30 mp-ig gyorsítótárazunk.
 */
let cache: { ok: boolean; at: number } | null = null;

export async function hasV2Schema(): Promise<boolean> {
  if (cache?.ok) return true;
  if (cache && Date.now() - cache.at < 30_000) return false;
  try {
    const row = await withSystem((db) =>
      db.one<{ ok: boolean }>(
        `select to_regclass('public.work_hours') is not null
            and to_regclass('public.company_invitations') is not null
            and exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'companies'
                           and column_name = 'lunch_minutes') as ok`,
      ),
    );
    cache = { ok: !!row?.ok, at: Date.now() };
  } catch {
    cache = { ok: false, at: Date.now() };
  }
  return cache.ok;
}

export const SCHEMA_PENDING_MESSAGE =
  "Ez a funkció az adatbázis frissítése után lesz elérhető (0002-es migráció).";
