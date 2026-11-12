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

/** A bejelentkezett Neon Auth felhasználó azonosítója (vagy null). */
export const getSessionUserId = cache(async (): Promise<string | null> => {
  const { data } = await getAuth().getSession();
  return data?.user?.id ?? null;
});

/** Kérésenként egyszer lekérdezett session + profil + cég. */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const userId = await getSessionUserId();
  if (!userId) return null;

  return withUser(userId, async (tx) => {
    const profile = await tx.one<Profile>(
      `select id, company_id, email, full_name, avatar_url, role, ical_token, created_at::text
         from profiles where id = $1`,
      [userId],
    );
    if (!profile) return null;
    const company = profile.company_id
      ? await tx.one<Company>(`select id, name, invite_code, created_at::text from companies where id = $1`, [
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
