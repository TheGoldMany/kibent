"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth";
import { friendlyError, siteUrl } from "@/lib/utils";
import {
  companyNameSchema,
  firstError,
  inviteCodeSchema,
  loginSchema,
  magicLinkSchema,
  signupSchema,
} from "@/lib/validations";
import type { FormState } from "@/components/ui/form-message";

function callbackUrl(next: string) {
  return `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`;
}

function authErrorHu(message: string): string {
  if (/invalid login credentials/i.test(message)) return "Hibás email cím vagy jelszó.";
  if (/email not confirmed/i.test(message)) return "Előbb erősítsd meg az email címed a kiküldött linkkel.";
  if (/already registered/i.test(message)) return "Ezzel az email címmel már regisztráltak. Jelentkezz be!";
  if (/rate limit|too many/i.test(message)) return "Túl sok próbálkozás. Várj egy kicsit, és próbáld újra.";
  return message;
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: authErrorHu(error.message) };

  redirect(safeNext(formData.get("next")));
}

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    fullName: formData.get("fullName"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const next = safeNext(formData.get("next"));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName }, emailRedirectTo: callbackUrl(next) },
  });
  if (error) return { error: authErrorHu(error.message) };

  // Ha az email megerősítés ki van kapcsolva, azonnal van session.
  if (data.session) redirect(next);
  return { success: "Elküldtük a megerősítő linket az email címedre. Kattints rá a folytatáshoz!" };
}

export async function magicLinkAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = magicLinkSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: callbackUrl(safeNext(formData.get("next"))), shouldCreateUser: true },
  });
  if (error) return { error: authErrorHu(error.message) };
  return { success: "Elküldtük a belépő linket! Nézd meg a postafiókod (a spam mappát is)." };
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function createCompanyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = companyNameSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_company", { company_name: parsed.data.name });
  if (error) return { error: friendlyError(error) };

  revalidatePath("/", "layout");
  redirect("/");
}

export async function joinCompanyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = inviteCodeSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("join_company", { code: parsed.data.code });
  if (error) return { error: friendlyError(error) };

  revalidatePath("/", "layout");
  redirect("/");
}
