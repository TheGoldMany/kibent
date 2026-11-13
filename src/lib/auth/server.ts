import "server-only";
import { headers } from "next/headers";
import { betterAuth } from "better-auth";
import { nextCookies, toNextJsHandler } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins";
import { PostgresDialect } from "kysely";
import { createPool } from "@/lib/db";
import { otpEmail, sendEmail } from "@/lib/email";
import { ensureAuthSchema } from "@/lib/auth/bootstrap";
import { siteUrl } from "@/lib/utils";

/**
 * Saját Better Auth (az alkalmazáson belül, a Neon adatbázis `better_auth` sémájában).
 * Email + jelszó, megerősítés 6 jegyű kóddal, kódos belépés; a leveleket közvetlenül
 * a Resend küldi a Kibent-dizájnnal.
 */

/** Minden cím, ahonnan az app elérhető (egyedi domain, www, Vercel URL-ek). */
function trustedOrigins(): string[] {
  const origins = new Set<string>();
  const add = (value?: string | null) => {
    if (!value) return;
    const url = value.startsWith("http") ? value : `https://${value}`;
    try {
      const u = new URL(url);
      origins.add(u.origin);
      // apex <-> www páros
      const host = u.hostname.startsWith("www.") ? u.hostname.slice(4) : `www.${u.hostname}`;
      if (!/vercel\.app$|localhost|127\.0\.0\.1/.test(u.hostname)) origins.add(`${u.protocol}//${host}`);
    } catch {
      /* érvénytelen érték: kihagyjuk */
    }
  };
  add(siteUrl());
  add(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  add(process.env.VERCEL_BRANCH_URL);
  add(process.env.VERCEL_URL);
  for (const extra of (process.env.AUTH_TRUSTED_ORIGINS ?? "").split(",")) add(extra.trim());
  return [...origins];
}

function createAuth() {
  const secret = process.env.BETTER_AUTH_SECRET ?? process.env.NEON_AUTH_COOKIE_SECRET;
  if (!secret) throw new Error("Hiányzó környezeti változó: BETTER_AUTH_SECRET. Lásd: .env.example");

  return betterAuth({
    appName: "Kibent",
    baseURL: siteUrl(),
    basePath: "/api/auth",
    secret,
    // A Neon pooler nem enged kapcsolódáskori search_path-ot, ezért a séma-minősítést
    // maga a Better Auth végzi minden lekérdezésben.
    database: {
      dialect: new PostgresDialect({ pool: createPool({ max: 3 }) }),
      type: "postgres",
      schemaName: "better_auth",
    },
    trustedOrigins: trustedOrigins(),
    advanced: { database: { generateId: "uuid" } },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
    },
    session: {
      // A munkamenet adatai 5 percig sütiben gyorsítótárazva: nincs adatbázis-kör minden oldalon.
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 100 },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 10 * 60,
        overrideDefaultEmailVerification: true,
        sendVerificationOnSignUp: true,
        // Kódos belépés csak meglévő fiókkal (új fiók: Regisztráció)
        disableSignUp: true,
        async sendVerificationOTP({ email, otp, type }) {
          const content = otpEmail({ code: otp, type, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() });
          const result = await sendEmail({ to: email, ...content });
          if (!result.sent) {
            console.error(`[auth] a kódos email nem ment ki (${result.reason})`);
            if (process.env.NODE_ENV !== "production") console.info(`[auth] fejlesztői kód ${email}: ${otp}`);
          }
        },
      }),
      nextCookies(), // mindig az utolsó plugin
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;
let instance: Auth | null = null;
function auth(): Auth {
  instance ??= createAuth();
  return instance;
}

// --- Illesztőréteg: ugyanaz a felület, mint a korábbi Neon Auth SDK-é -----------
type Result<T> = { data: T | null; error: { message: string; code?: string } | null };

async function call<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    await ensureAuthSchema();
    return { data: await fn(), error: null };
  } catch (e) {
    const err = e as { body?: { message?: string; code?: string }; message?: string; status?: string };
    return { data: null, error: { message: err.body?.message ?? err.message ?? "Ismeretlen hiba", code: err.body?.code } };
  }
}

export type SessionUser = { id: string; email: string; name: string; emailVerified: boolean };

const api = {
  async getSession(): Promise<Result<{ user: SessionUser }>> {
    const h = await headers();
    return call(async () => {
      const s = await auth().api.getSession({ headers: h });
      return s ? { user: s.user as SessionUser } : null;
    }) as Promise<Result<{ user: SessionUser }>>;
  },
  signIn: {
    async email(body: { email: string; password: string }) {
      const h = await headers();
      return call(() => auth().api.signInEmail({ body, headers: h }));
    },
    async emailOtp(body: { email: string; otp: string }) {
      const h = await headers();
      return call(() => auth().api.signInEmailOTP({ body, headers: h }));
    },
  },
  signUp: {
    async email(body: { email: string; password: string; name: string; callbackURL?: string }) {
      const h = await headers();
      return call(() => auth().api.signUpEmail({ body, headers: h }));
    },
  },
  async signOut() {
    const h = await headers();
    return call(() => auth().api.signOut({ headers: h }));
  },
  emailOtp: {
    async sendVerificationOtp(body: { email: string; type: "sign-in" | "email-verification" | "forget-password" }) {
      return call(() => auth().api.sendVerificationOTP({ body }));
    },
    async verifyEmail(body: { email: string; otp: string }) {
      const h = await headers();
      return call(() => auth().api.verifyEmailOTP({ body, headers: h }));
    },
  },
  async updateUser(body: { name?: string; image?: string }) {
    const h = await headers();
    return call(() => auth().api.updateUser({ body, headers: h }));
  },
};

export function getAuth() {
  return api;
}

/** A /api/auth/* route handler (Better Auth végpontok). */
export function authHandler() {
  const handler = toNextJsHandler(auth());
  return {
    async GET(request: Request) {
      await ensureAuthSchema();
      return handler.GET(request);
    },
    async POST(request: Request) {
      await ensureAuthSchema();
      return handler.POST(request);
    },
  };
}
