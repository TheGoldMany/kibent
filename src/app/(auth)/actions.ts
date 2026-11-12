"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAuth } from "@/lib/auth/server";
import { getSessionContext, safeNext } from "@/lib/auth";
import { dbErrorMessage, withUser } from "@/lib/db";
import { siteUrl } from "@/lib/utils";
import {
  companyNameSchema,
  firstError,
  inviteCodeSchema,
  loginSchema,
  magicLinkSchema,
  signupSchema,
} from "@/lib/validations";
import type { FormState } from "@/components/ui/form-message";

function authErrorHu(message: string | undefined): string {
  if (!message) return "A bejelentkezés nem sikerült. Próbáld újra.";
  // Supabase és Better Auth (Neon Auth) szövegezések
  if (/invalid login credentials|invalid email or password|invalid password/i.test(message)) {
    return "Hibás email cím vagy jelszó.";
  }
  if (/email not (confirmed|verified)/i.test(message)) return "Előbb erősítsd meg az email címed a kiküldött linkkel.";
  if (/password (is )?too short/i.test(message)) return "A jelszó legalább 8 karakter legyen.";
  if (/password (is )?too long/i.test(message)) return "A jelszó túl hosszú.";
  if (/invalid email/i.test(message)) return "Érvénytelen email cím.";
  if (/user not found/i.test(message)) return "Ehhez az email címhez még nincs fiók. Előbb regisztrálj a Regisztráció fülön.";
  if (/already (registered|exists)/i.test(message)) return "Ezzel az email címmel már regisztráltak. Jelentkezz be!";
  if (/rate limit|too many/i.test(message)) return "Túl sok próbálkozás. Várj egy kicsit, és próbáld újra.";
  if (/invalid origin|untrusted origin/i.test(message)) {
    // Beállítási hiba: az oldal címe nincs a Neon Auth megbízható domainjei között.
    console.error("[auth] Invalid origin – vedd fel a NEXT_PUBLIC_SITE_URL-t a Neon Auth Trusted domains listájára.");
    return "A belépés erről a címről még nincs engedélyezve. Az üzemeltetőnek fel kell vennie a domaint a Neon Auth beállításaiban.";
  }
  return message;
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const { error } = await getAuth().signIn.email(parsed.data);
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
  const { data, error } = await getAuth().signUp.email({
    email: parsed.data.email,
    password: parsed.data.password,
    name: parsed.data.fullName,
    callbackURL: `${siteUrl()}${next}`,
  });
  if (error) return { error: authErrorHu(error.message) };

  // Ha az email megerősítés ki van kapcsolva, a regisztráció után azonnal van session.
  // (Better Auth: a token null, ha email megerősítés szükséges.)
  if (data && "token" in data && data.token) redirect(next);
  return { success: "Elküldtük a megerősítő linket az email címedre. Kattints rá a folytatáshoz!" };
}

export async function magicLinkAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = magicLinkSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const next = safeNext(formData.get("next"));
  const { error } = await getAuth().signIn.magicLink({
    email: parsed.data.email,
    callbackURL: `${siteUrl()}${next}`,
    errorCallbackURL: `${siteUrl()}/login?error=link&next=${encodeURIComponent(next)}`,
  });
  if (error) return { error: authErrorHu(error.message) };
  return { success: "Elküldtük a belépő linket! Nézd meg a postafiókod (a spam mappát is)." };
}

export async function signOutAction() {
  await getAuth().signOut();
  redirect("/login");
}

export async function createCompanyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = companyNameSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: firstError(parsed.error) };

  // getSessionContext biztosítja a profilt (trigger nélküli Neon környezetben is).
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  const userId = ctx.userId;
  try {
    await withUser(userId, (tx) => tx.query("select public.create_company($1)", [parsed.data.name]));
  } catch (error) {
    return { error: dbErrorMessage(error) };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function joinCompanyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = inviteCodeSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) return { error: firstError(parsed.error) };

  // getSessionContext biztosítja a profilt (trigger nélküli Neon környezetben is).
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  const userId = ctx.userId;
  try {
    await withUser(userId, (tx) => tx.query("select public.join_company($1)", [parsed.data.code]));
  } catch (error) {
    return { error: dbErrorMessage(error) };
  }

  revalidatePath("/", "layout");
  redirect("/");
}
