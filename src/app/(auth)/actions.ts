"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAuth } from "@/lib/auth/server";
import { getSessionContext, safeNext } from "@/lib/auth";
import { acceptInvitation, setActiveTeamCookie } from "@/lib/teams";
import { inviteTokenFromPath } from "@/lib/invitations";
import { dbErrorMessage, withUser } from "@/lib/db";
import { z } from "zod";
import { allowCodeEmail, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { siteUrl } from "@/lib/utils";
import {
  companyNameSchema,
  firstError,
  loginSchema,
  magicLinkSchema,
  signupSchema,
  uuidSchema,
} from "@/lib/validations";
import type { FormState } from "@/components/ui/form-message";

function authErrorHu(message: string | undefined): string {
  if (!message) return "A bejelentkezés nem sikerült. Próbáld újra.";
  // Better Auth szövegezések
  if (/invalid login credentials|invalid email or password|invalid password/i.test(message)) {
    return "Hibás email cím vagy jelszó.";
  }
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
    // Beállítási hiba: az oldal címe nincs az engedélyezett címek között.
    console.error("[auth] Invalid origin – állítsd be a NEXT_PUBLIC_SITE_URL-t vagy az AUTH_TRUSTED_ORIGINS-t.");
    return "A belépés erről a címről még nincs engedélyezve. Próbáld a fő címről, vagy szólj az üzemeltetőnek.";
  }
  return message;
}

/**
 * Belépés/regisztráció utáni cél. Ha meghívó linkről jött, rögtön csatlakozik a csapathoz
 * (a frissen létrejött munkamenettel), és a csapat naptárába érkezik.
 */
async function afterAuth(next: string, data: unknown): Promise<string> {
  const token = inviteTokenFromPath(next);
  const user = (data as { user?: { id?: string; email?: string; name?: string } } | null)?.user;
  if (!token || !user?.id) return next;
  const userId = user.id;
  try {
    // Az új munkamenet sütije ebben a kérésben még nem látszik, ezért a visszakapott felhasználóval dolgozunk.
    await withUser(userId, (tx) => tx.query("select public.ensure_profile($1, $2)", [user.email ?? "", user.name ?? ""]));
  } catch (e) {
    console.error("[invite] ensure_profile", e);
    return next;
  }
  const result = await acceptInvitation(userId, token);
  return "error" in result ? next : "/";
}

/** Az auth űrlapok állapota: hibák/üzenetek + a kódos lépéshez szükséges email cím. */
export type AuthState =
  | (FormState & {
      /** Erre a címre ment ki a jelszó-visszaállító kód. */
      codeSentTo?: string;
      /** Hiba esetén a beírt értékek (a React 19 action után üríti az űrlapot). Jelszót soha. */
      values?: { email?: string; fullName?: string };
    })
  | null;

const otpSchema = z.object({
  email: z.string().trim().email("Érvénytelen email cím."),
  otp: z
    .string()
    .trim()
    .regex(/^\d{4,10}$/, "A kód csak számjegyekből áll – másold be pontosan az emailből."),
});

export async function signInAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const values = { email: String(formData.get("email") ?? "") };
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: firstError(parsed.error), values };

  const { data, error } = await getAuth().signIn.email(parsed.data);
  if (error) {
    return { error: authErrorHu(error.message), values };
  }

  redirect(await afterAuth(safeNext(formData.get("next")), data));
}

export async function signUpAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const values = { email: String(formData.get("email") ?? ""), fullName: String(formData.get("fullName") ?? "") };
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    fullName: formData.get("fullName"),
  });
  if (!parsed.success) return { error: firstError(parsed.error), values };

  const next = safeNext(formData.get("next"));
  const { data, error } = await getAuth().signUp.email({
    email: parsed.data.email,
    password: parsed.data.password,
    name: parsed.data.fullName,
    callbackURL: `${siteUrl()}${next}`,
  });
  if (error) return { error: authErrorHu(error.message), values };

  // Nincs email-megerősítés: a regisztráció után azonnal be van lépve.
  redirect(await afterAuth(next, data));
}

const EMAIL_FAILED = "Most nem tudunk emailt küldeni. Próbáld újra pár perc múlva.";

async function sendResetCode(email: string): Promise<string | null> {
  if (!(await allowCodeEmail(email))) return RATE_LIMIT_MESSAGE;
  const { error } = await getAuth().emailOtp.requestPasswordReset({ email });
  if (!error) return null;
  return /email_not_sent/.test(error.message) ? EMAIL_FAILED : authErrorHu(error.message);
}

/** Új kód kérése a jelszó-visszaállításhoz. */
export async function resendCodeAction(email: string): Promise<{ ok: boolean; message: string }> {
  const parsed = magicLinkSchema.safeParse({ email });
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  const failed = await sendResetCode(parsed.data.email);
  if (failed) return { ok: false, message: failed };
  return { ok: true, message: "Új kódot küldtünk. Nézd meg a postafiókod (a spam mappát is)." };
}

/** Elfelejtett jelszó, 1. lépés: kód küldése a regisztrált email címre. */
export async function requestPasswordResetAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const values = { email: String(formData.get("email") ?? "") };
  const parsed = magicLinkSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: firstError(parsed.error), values };
  const failed = await sendResetCode(parsed.data.email);
  if (failed) return { error: failed, values };
  return { codeSentTo: parsed.data.email };
}

/** Elfelejtett jelszó, 2. lépés: kód + új jelszó, utána rögtön belép. */
export async function resetPasswordAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const parsed = otpSchema.safeParse({ email, otp: formData.get("otp") });
  if (!parsed.success) return { error: firstError(parsed.error), codeSentTo: email };
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "A jelszó legalább 8 karakter legyen.", codeSentTo: email };
  if (password.length > 128) return { error: "A jelszó túl hosszú.", codeSentTo: email };

  const reset = await getAuth().emailOtp.resetPassword({ ...parsed.data, password });
  if (reset.error) return { error: authErrorHu(reset.error.message), codeSentTo: email };

  const { data, error } = await getAuth().signIn.email({ email: parsed.data.email, password });
  if (error) return { error: authErrorHu(error.message), codeSentTo: email };
  redirect(await afterAuth(safeNext(formData.get("next")), data));
}

export async function signOutAction() {
  await getAuth().signOut();
  redirect("/login");
}

/** Új csapat: a létrehozó admin lesz, és rögtön erre a csapatra vált. */
export async function createCompanyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = companyNameSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const ctx = await getSessionContext(); // biztosítja a profilt is
  if (!ctx) redirect("/login");
  let companyId: string;
  try {
    const row = await withUser(ctx.userId, (tx) =>
      tx.one<{ id: string }>("select public.create_company($1) as id", [parsed.data.name]),
    );
    if (!row) throw new Error("Nem sikerült létrehozni a csapatot.");
    companyId = row.id;
  } catch (error) {
    return { error: dbErrorMessage(error) };
  }

  await setActiveTeamCookie(companyId);
  revalidatePath("/", "layout");
  redirect("/");
}

/** Csapatváltás: a süti csak akkor számít, ha a felhasználó tényleg tagja (getSessionContext ellenőrzi). */
export async function switchTeamAction(formData: FormData) {
  const parsed = uuidSchema.safeParse(formData.get("teamId"));
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (parsed.success && ctx.teams.some((t) => t.id === parsed.data)) await setActiveTeamCookie(parsed.data);
  revalidatePath("/", "layout");
  redirect("/");
}

/** Meghívó elfogadása a bejelentkezett fiókkal (a meghívó link a bizonyíték). */
export async function acceptInvitationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = uuidSchema.safeParse(formData.get("token"));
  if (!parsed.success) return { error: "Ez a meghívó link érvénytelen." };
  const ctx = await getSessionContext();
  if (!ctx) redirect(`/login?next=${encodeURIComponent(`/invite/${parsed.data}`)}`);
  const result = await acceptInvitation(ctx.userId, parsed.data);
  if ("error" in result) return { error: result.error };
  redirect("/");
}
