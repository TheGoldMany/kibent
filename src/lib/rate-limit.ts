import "server-only";
import { headers } from "next/headers";
import { withSystem } from "@/lib/db";

/**
 * Egyszerű, adatbázis-alapú korlátozás (szerver nélküli környezetben is közös).
 * Ha a 0003-as migráció még nincs lefuttatva, nem blokkol.
 */
export async function allow(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  try {
    const row = await withSystem((db) =>
      db.one<{ ok: boolean }>("select public.rate_limit_hit($1, $2, $3) as ok", [key, limit, windowSeconds]),
    );
    return row?.ok ?? true;
  } catch {
    return true;
  }
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0]!.trim() || h.get("x-real-ip") || "ismeretlen";
}

/** Emailes kód küldése: címenként 5 / 15 perc, IP-nként 20 / 15 perc. */
export async function allowCodeEmail(email: string): Promise<boolean> {
  const ip = await clientIp();
  const [byEmail, byIp] = await Promise.all([
    allow(`code:email:${email.toLowerCase()}`, 5, 15 * 60),
    allow(`code:ip:${ip}`, 20, 15 * 60),
  ]);
  return byEmail && byIp;
}

export const RATE_LIMIT_MESSAGE = "Túl sok kódkérés. Várj néhány percet, és próbáld újra.";
