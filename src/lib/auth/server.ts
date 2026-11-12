import "server-only";
import { createNeonAuth } from "@neondatabase/auth/next/server";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Hiányzó környezeti változó: ${name}. Lásd: .env.example`);
  return v;
}

type NeonAuth = ReturnType<typeof createNeonAuth>;
let instance: NeonAuth | null = null;

/** Lustán létrehozott Neon Auth példány (így a build env változók nélkül is lefut). */
export function getAuth(): NeonAuth {
  instance ??= createNeonAuth({
    baseUrl: required("NEON_AUTH_BASE_URL"),
    cookies: { secret: required("NEON_AUTH_COOKIE_SECRET") },
  });
  return instance;
}
