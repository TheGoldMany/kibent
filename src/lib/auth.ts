import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/server";
import { withUser } from "@/lib/db";
import type { Company, Profile } from "@/lib/database.types";

export type SessionContext = {
  userId: string;
  profile: Profile;
  company: Company | null;
};

type SessionUser = { id: string; email: string; name: string };

/** A bejelentkezett Neon Auth felhasználó (vagy null). */
const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const { data } = await getAuth().getSession();
  const user = data?.user;
  if (!user?.id) return null;
  return { id: user.id, email: user.email ?? "", name: user.name ?? "" };
});

/** A bejelentkezett Neon Auth felhasználó azonosítója (vagy null). */
export const getSessionUserId = cache(async (): Promise<string | null> => (await getSessionUser())?.id ?? null);

const PROFILE_SQL = `select id, company_id, email, full_name, avatar_url, role, ical_token, created_at
                       from profiles where id = $1`;

/** Kérésenként egyszer lekérdezett session + profil + cég. */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const userId = user.id;

  return withUser(userId, async (tx) => {
    let profile = await tx.one<Profile>(PROFILE_SQL, [userId]);
    if (!profile) {
      // Első belépés olyan környezetben, ahol a neon_auth trigger nem fut.
      await tx.query("select public.ensure_profile($1, $2)", [user.email, user.name]);
      profile = await tx.one<Profile>(PROFILE_SQL, [userId]);
    }
    if (!profile) return null;
    const company = profile.company_id
      ? await tx.one<Company>(`select id, name, invite_code, created_at from companies where id = $1`, [
          profile.company_id,
        ])
      : null;
    return { userId, profile, company };
  });
});

export type MemberContext = SessionContext & { company: Company };

/** Bejelentkezett, céghez tartozó felhasználó – különben átirányít. */
export async function requireMember(): Promise<MemberContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!ctx.company) redirect("/onboarding");
  return ctx as MemberContext;
}

export async function requireAdmin(): Promise<MemberContext> {
  const ctx = await requireMember();
  if (ctx.profile.role !== "admin") redirect("/");
  return ctx;
}

/** Nyílt átirányítás elleni védelem: csak relatív, saját útvonal. */
export function safeNext(next: unknown, fallback = "/"): string {
  if (typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
