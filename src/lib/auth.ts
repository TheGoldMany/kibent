import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/server";
import { withUser, type Tx } from "@/lib/db";
import type { Company, Profile, Role } from "@/lib/database.types";

export const ACTIVE_TEAM_COOKIE = "kibent_team";

export type TeamSummary = { id: string; name: string; role: Role };

export type SessionContext = {
  userId: string;
  /** A profil; a `role` és a `company_id` az AKTÍV csapatra vonatkozik. */
  profile: Profile;
  /** Az aktív csapat (null, ha még nincs csapata). */
  company: Company | null;
  /** A felhasználó összes csapata (a csapatváltóhoz). */
  teams: TeamSummary[];
  /** Függő szabadságkérelmek száma az aktív csapatban (csak adminnak, egyébként 0). */
  pendingCount: number;
};

type SessionUser = { id: string; email: string; name: string };

/** A bejelentkezett felhasználó (vagy null). */
const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const { data } = await getAuth().getSession();
  const user = data?.user;
  if (!user?.id) return null;
  return { id: user.id, email: user.email ?? "", name: user.name ?? "" };
});

/** A bejelentkezett felhasználó azonosítója (vagy null). */
export const getSessionUserId = cache(async (): Promise<string | null> => (await getSessionUser())?.id ?? null);

const PROFILE_SQL = `select id, company_id, email, full_name, avatar_url, role, ical_token, created_at
                       from profiles where id = $1`;

/** Kérésenként egyszer: profil, csapatok, aktív csapat (sütiből, ha tagja). */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const userId = user.id;
  const wanted = (await cookies()).get(ACTIVE_TEAM_COOKIE)?.value ?? null;

  const base = await withUser(userId, async (tx) => {
    let profile = await tx.one<Profile>(PROFILE_SQL, [userId]);
    if (!profile) {
      await tx.query("select public.ensure_profile($1, $2)", [user.email, user.name]);
      profile = await tx.one<Profile>(PROFILE_SQL, [userId]);
    }
    if (!profile) return null;
    const teams = await tx.query<TeamSummary & Company>(
      `select c.id, c.name, c.invite_code, coalesce((to_jsonb(c) ->> 'lunch_minutes')::int, 30) as lunch_minutes,
              c.created_at, m.role
         from memberships m join companies c on c.id = m.company_id
        where m.user_id = $1
        order by m.created_at, c.name`,
      [userId],
    );
    return { profile, teams };
  });
  if (!base) return null;

  const active = base.teams.find((t) => t.id === wanted) ?? base.teams[0] ?? null;
  let pendingCount = 0;
  if (active?.role === "admin") {
    pendingCount = await withUser(
      userId,
      async (tx) =>
        (
          await tx.one<{ n: number }>(
            `select count(distinct coalesce(request_group_id::text, user_id::text))::int as n
               from schedules where company_id = $1 and approval_status = 'pending'`,
            [active.id],
          )
        )?.n ?? 0,
      active.id,
    );
  }

  const company: Company | null = active
    ? { id: active.id, name: active.name, invite_code: active.invite_code, lunch_minutes: active.lunch_minutes, created_at: active.created_at }
    : null;
  return {
    userId,
    profile: { ...base.profile, company_id: active?.id ?? null, role: active?.role ?? "member" },
    company,
    teams: base.teams.map((t) => ({ id: t.id, name: t.name, role: t.role })),
    pendingCount,
  };
});

export type MemberContext = SessionContext & { company: Company };

/** Bejelentkezett felhasználó – különben a belépőoldalra irányít. */
export async function requireSession(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/** Bejelentkezett, és van aktív csapata – különben a kezdőlapra (üres felület). */
export async function requireMember(): Promise<MemberContext> {
  const ctx = await requireSession();
  if (!ctx.company) redirect("/");
  return ctx as MemberContext;
}

export async function requireAdmin(): Promise<MemberContext> {
  const ctx = await requireMember();
  if (ctx.profile.role !== "admin") redirect("/");
  return ctx;
}

/** Tranzakció a felhasználó és az AKTÍV csapat kontextusában (RLS). */
export function withMember<T>(ctx: { userId: string; company: { id: string } | null }, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withUser(ctx.userId, fn, ctx.company?.id ?? null);
}

/** Nyílt átirányítás elleni védelem: csak relatív, saját útvonal. */
export function safeNext(next: unknown, fallback = "/"): string {
  if (typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
