"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAuth } from "@/lib/auth/server";
import { getSessionContext, safeNext } from "@/lib/auth";
import { dbErrorMessage, withUser } from "@/lib/db";
import { z } from "zod";
import { allowCodeEmail, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
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
  if (/email not (confirmed|verified)/i.test(message)) return "Előbb erősítsd meg az email címed az emailben kapott kóddal.";
  if (/invalid otp|invalid code|otp.*(invalid|incorrect)/i.test(message)) return "Hibás kód. Ellenőrizd, és próbáld újra.";
  if (/otp.*expired|code.*expired|expired/i.test(message)) return "A kód lejárt. Kérj újat.";
  if (/too many attempts/i.test(message)) return "Túl sok hibás próbálkozás. Kérj új kódot.";
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

/** Az auth űrlapok állapota: hibák/üzenetek + a kódos lépéshez szükséges email cím. */
export type AuthState =
  | (FormState & {
      /** Erre a címre ment ki megerősítő kód (regisztráció / megerősítetlen belépés). */
      verifyEmail?: string;
      /** Erre a címre ment ki belépő kód (jelszó nélküli belépés). */
      codeSentTo?: string;
      /** A megerősítés kész, de nincs session – jelszóval kell belépni. */
      verified?: string;
    })
  | null;

function hasToken(data: unknown): boolean {
  return !!data && typeof data === "object" && "token" in data && !!(data as { token?: unknown }).token;
}

const otpSchema = z.object({
  email: z.string().trim().email("Érvénytelen email cím."),
  otp: z
    .string()
    .trim()
    .regex(/^\d{4,10}$/, "A kód csak számjegyekből áll – másold be pontosan az emailből."),
});

export async function signInAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const { error } = await getAuth().signIn.email(parsed.data);
  if (error) {
    // Megerősítetlen email: a kódos lépésre váltunk. Nem küldünk automatikusan új kódot,
    // mert az érvényteleníthetné a már kiküldöttet – a felhasználó kérhet újat.
    if (/email not (confirmed|verified)/i.test(error.message ?? "")) {
      return {
        error: "Az email címed még nincs megerősítve. Írd be a kapott kódot, vagy kérj újat.",
        verifyEmail: parsed.data.email,
      };
    }
    return { error: authErrorHu(error.message) };
  }

  redirect(safeNext(formData.get("next")));
}

export async function signUpAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
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
  // (Better Auth: a token null, ha email megerősítés szükséges – ilyenkor kódot küld.)
  if (hasToken(data)) redirect(next);
  return { verifyEmail: parsed.data.email };
}

/** A regisztrációkor (vagy megerősítetlen belépéskor) emailben kapott kód ellenőrzése. */
export async function verifyEmailCodeAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const parsed = otpSchema.safeParse({ email, otp: formData.get("otp") });
  if (!parsed.success) return { error: firstError(parsed.error), verifyEmail: email };

  const { data, error } = await getAuth().emailOtp.verifyEmail(parsed.data);
  if (error) return { error: authErrorHu(error.message), verifyEmail: email };

  // Ha a Neon Auth megerősítés után automatikusan beléptet, mehetünk tovább.
  if (hasToken(data)) redirect(safeNext(formData.get("next")));
  return { verified: parsed.data.email, success: "Az email címed megerősítve. Most lépj be a jelszavaddal." };
}

/** Új kód kérése (megerősítéshez vagy jelszó nélküli belépéshez). */
export async function resendCodeAction(
  email: string,
  purpose: "email-verification" | "sign-in",
): Promise<{ ok: boolean; message: string }> {
  const parsed = magicLinkSchema.safeParse({ email });
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  if (!(await allowCodeEmail(parsed.data.email))) return { ok: false, message: RATE_LIMIT_MESSAGE };
  const { error } = await getAuth().emailOtp.sendVerificationOtp({ email: parsed.data.email, type: purpose });
  if (error) return { ok: false, message: authErrorHu(error.message) };
  return { ok: true, message: "Új kódot küldtünk. Nézd meg a postafiókod (a spam mappát is)." };
}

/** Jelszó nélküli belépés, 1. lépés: kód küldése a regisztrált email címre. */
export async function sendSignInCodeAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = magicLinkSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: firstError(parsed.error) };
  if (!(await allowCodeEmail(parsed.data.email))) return { error: RATE_LIMIT_MESSAGE };

  const { error } = await getAuth().emailOtp.sendVerificationOtp({ email: parsed.data.email, type: "sign-in" });
  if (error) return { error: authErrorHu(error.message) };
  return { codeSentTo: parsed.data.email };
}

/** Jelszó nélküli belépés, 2. lépés: a kód beváltása. */
export async function signInWithCodeAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const parsed = otpSchema.safeParse({ email, otp: formData.get("otp") });
  if (!parsed.success) return { error: firstError(parsed.error), codeSentTo: email };

  const { error } = await getAuth().signIn.emailOtp(parsed.data);
  if (error) return { error: authErrorHu(error.message), codeSentTo: email };

  redirect(safeNext(formData.get("next")));
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
