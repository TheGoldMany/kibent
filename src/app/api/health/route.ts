import { NextResponse } from "next/server";
import { withSystem } from "@/lib/db";
import { hasV2Schema } from "@/lib/schema";
import { isEmailConfigured } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * Állapot- és késleltetésmérés: melyik Vercel régióban fut a függvény, és mennyi
 * egy adatbázis-oda-vissza út a Neonhoz. Titkot nem ad vissza.
 */
export async function GET() {
  const started = performance.now();
  try {
    const timings = await withSystem(async (db) => {
      const connectMs = performance.now() - started;
      const rtts: number[] = [];
      for (let i = 0; i < 3; i++) {
        const t = performance.now();
        await db.query("select 1");
        rtts.push(performance.now() - t);
      }
      return { connectMs, rtts };
    });
    const sorted = [...timings.rtts].sort((a, b) => a - b);
    return NextResponse.json(
      {
        ok: true,
        region: process.env.VERCEL_REGION ?? "local",
        dbRoundTripMs: Math.round(sorted[1]!),
        dbConnectMs: Math.round(timings.connectMs),
        // Le van-e futtatva a 0002-es migráció (munkaidő, ebédszünet, meghívók)
        schema: (await hasV2Schema()) ? "v2" : "v1",
        // Be van-e állítva az emailküldés (csak igen/nem, a kulcsot nem adja ki)
        email: isEmailConfigured(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ ok: false, region: process.env.VERCEL_REGION ?? "local" }, { status: 503 });
  }
}
