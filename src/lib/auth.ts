import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Company, Profile } from "@/lib/database.types";

export type SessionContext = {
  userId: string;
  profile: Profile;
  company: Company | null;
};

/** Kérésenként egyszer lekérdezett session + profil + cég. */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) return null;

  let company: Company | null = null;
  if (profile.company_id) {
    const { data } = await supabase.from("companies").select("*").eq("id", profile.company_id).single();
    company = data;
  }
  return { userId: user.id, profile, company };
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
