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
  /** Függő szabadságkérelmek száma (csak adminnak, egyébként 0). */
  pendingCount: number;
};

type SessionUser = { id: string; email: string; name: string; emailVerified: boolean };

/** A bejelentkezett Neon Auth felhasználó (vagy null). */
const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const { data } = await getAuth().getSession();
  const user = data?.user;
  if (!user?.id) return null;
  return {
    id: user.id,
    email: user.email ?? "",
    name: user.name ?? "",
    emailVerified: Boolean((user as { emailVerified?: boolean }).emailVerified),
  };
});

/** A bejelentkezett Neon Auth felhasználó azonosítója (vagy null). */
export const getSessionUserId = cache(async (): Promise<string | null> => (await getSessionUser())?.id ?? null);

/**
 * Egyetlen lekérdezés: profil + cég + (adminnak) a függő szabadságkérelmek száma.
 * Kevesebb adatbázis-kör = gyorsabb oldalbetöltés.
 */
const SESSION_SQL = `
  select row_to_json(p) as profile,
         case when c.id is null then null
              else json_build_object('id', c.id, 'name', c.name, 'invite_code', c.invite_code,
                                     'lunch_minutes', c.lunch_minutes, 'created_at', c.created_at)
         end as company,
         case when p.role = 'admin' and p.company_id is not null then (
           select count(distinct coalesce(s.request_group_id::text, s.user_id::text))::int
             from schedules s
            where s.company_id = p.company_id and s.approval_status = 'pending'
         ) else 0 end as pending_count
    from (select id, company_id, email, full_name, avatar_url, role, ical_token, created_at
            from profiles where id = $1) p
    left join companies c on c.id = p.company_id`;

type SessionRow = { profile: Profile; company: Company | null; pending_count: number };

/** Kérésenként egyszer lekérdezett session + profil + cég. */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const userId = user.id;

  return withUser(userId, async (tx) => {
    let row = await tx.one<SessionRow>(SESSION_SQL, [userId]);
    if (!row) {
      // Első belépés olyan környezetben, ahol a neon_auth trigger nem fut.
      await tx.query("select public.ensure_profile($1, $2)", [user.email, user.name]);
      row = await tx.one<SessionRow>(SESSION_SQL, [userId]);
    }
    if (!row) return null;
    // Még nincs cég, de a (megerősített) email címre nyitott meghívó szól: automatikus csatlakozás.
    if (!row.company && user.emailVerified) {
      const joined = await tx.one<{ company_id: string | null }>("select public.accept_pending_invitation() as company_id");
      if (joined?.company_id) row = (await tx.one<SessionRow>(SESSION_SQL, [userId])) ?? row;
    }
    return { userId, profile: row.profile, company: row.company, pendingCount: row.pending_count };
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
