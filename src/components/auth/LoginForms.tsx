"use client";

import { useActionState, useState, useTransition } from "react";
import { MailCheck } from "lucide-react";
import {
  resendCodeAction,
  sendSignInCodeAction,
  signInAction,
  signInWithCodeAction,
  signUpAction,
  verifyEmailCodeAction,
  type AuthState,
} from "@/app/(auth)/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { cn } from "@/lib/utils";

export type LoginMode = "password" | "signup" | "code";
type Mode = LoginMode;

const TABS: { id: Mode; label: string; short?: string }[] = [
  { id: "password", label: "Jelszóval" },
  { id: "signup", label: "Regisztráció" },
  { id: "code", label: "Emailes kód", short: "Kóddal" },
];

export function LoginForms({
  next,
  initialError,
  defaultEmail,
  defaultMode = "password",
}: {
  next: string;
  initialError?: string;
  /** Meghívónál előre kitöltött email cím. */
  defaultEmail?: string;
  defaultMode?: Mode;
}) {
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [signInState, signIn] = useActionState(signInAction, initialError ? { error: initialError } : null);
  const [signUpState, signUp] = useActionState(signUpAction, null);
  const [sendCodeState, sendCode] = useActionState(sendSignInCodeAction, null);
  /** Kódos megerősítés folyamatban erre a címre (regisztráció vagy megerősítetlen belépés után). */
  const [verifyFor, setVerifyFor] = useState<string | null>(null);
  const [verifiedNotice, setVerifiedNotice] = useState<AuthState>(null);
  const [lastSeen, setLastSeen] = useState<{ signIn: AuthState; signUp: AuthState }>({ signIn: null, signUp: null });

  // Ha egy action megerősítést kér, átváltunk a kódos lépésre (renderelés közbeni állapotigazítás).
  if (signUpState !== lastSeen.signUp || signInState !== lastSeen.signIn) {
    setLastSeen({ signIn: signInState, signUp: signUpState });
    const email = (signUpState !== lastSeen.signUp ? signUpState : signInState)?.verifyEmail;
    if (email) setVerifyFor(email);
  }

  if (verifyFor) {
    return (
      <VerifyEmailStep
        email={verifyFor}
        next={next}
        notice={signInState?.verifyEmail === verifyFor ? signInState : null}
        onBack={() => setVerifyFor(null)}
        onVerified={(state) => {
          setVerifyFor(null);
          setVerifiedNotice(state);
          setMode("password");
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Belépési mód" className="grid grid-cols-3 gap-1 rounded-full border-2 border-ink bg-lilac-soft p-1 text-[13px]">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={mode === t.id}
            onClick={() => setMode(t.id)}
            className={cn(
              "rounded-full px-2 py-2 font-semibold font-wide transition-colors",
              mode === t.id ? "border-2 border-ink bg-butter shadow-brutal-xs" : "border-2 border-transparent hover:bg-white",
            )}
          >
            {t.short ? (
              <>
                <span className="sm:hidden">{t.short}</span>
                <span className="hidden sm:inline">{t.label}</span>
              </>
            ) : (
              t.label
            )}
          </button>
        ))}
      </div>

      {mode === "password" && (
        <form action={signIn} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <FormMessage state={verifiedNotice} />
          <Field
            id="email"
            label="Email cím"
            type="email"
            autoComplete="email"
            defaultValue={verifiedNotice?.verified ?? defaultEmail}
          />
          <Field id="password" label="Jelszó" type="password" autoComplete="current-password" />
          <FormMessage state={signInState} />
          <SubmitButton size="lg" className="w-full" pendingText="Belépés…">
            Belépés
          </SubmitButton>
        </form>
      )}

      {mode === "signup" && (
        <form action={signUp} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <Field id="fullName" label="Teljes név" autoComplete="name" placeholder="pl. Kovács Anna" />
          <Field id="email" label="Email cím" type="email" autoComplete="email" defaultValue={defaultEmail} />
          <Field id="password" label="Jelszó (min. 8 karakter)" type="password" autoComplete="new-password" minLength={8} />
          <FormMessage state={signUpState} />
          <SubmitButton size="lg" className="w-full" pendingText="Fiók létrehozása…">
            Fiók létrehozása
          </SubmitButton>
        </form>
      )}

      {mode === "code" &&
        (sendCodeState?.codeSentTo ? (
          <SignInCodeStep email={sendCodeState.codeSentTo} next={next} onBack={() => setMode("password")} />
        ) : (
          <form action={sendCode} className="space-y-4">
            <Field id="email" label="Email cím" type="email" autoComplete="email" defaultValue={defaultEmail} />
            <p className="text-sm text-muted-foreground">
              Jelszó nélkül: küldünk egy egyszer használatos kódot a már regisztrált email címedre. Ha még nincs
              fiókod, előbb válaszd a Regisztrációt.
            </p>
            <FormMessage state={sendCodeState} />
            <SubmitButton size="lg" className="w-full" pendingText="Küldés…">
              Kód küldése
            </SubmitButton>
          </form>
        ))}
    </div>
  );
}

/** Regisztráció utáni (vagy megerősítetlen belépéskori) kódos email-megerősítés. */
function VerifyEmailStep({
  email,
  next,
  notice,
  onBack,
  onVerified,
}: {
  email: string;
  next: string;
  notice: AuthState;
  onBack: () => void;
  onVerified: (state: AuthState) => void;
}) {
  const [state, action] = useActionState(async (prev: AuthState, formData: FormData) => {
    const result = await verifyEmailCodeAction(prev, formData);
    if (result?.verified) onVerified(result);
    return result;
  }, notice);

  return (
    <CodeForm
      title="Erősítsd meg az email címed"
      email={email}
      purpose="email-verification"
      action={action}
      state={state}
      submitLabel="Megerősítés"
      next={next}
      onBack={onBack}
    />
  );
}

/** Jelszó nélküli belépés 2. lépése: a kapott kód beváltása. */
function SignInCodeStep({ email, next, onBack }: { email: string; next: string; onBack: () => void }) {
  const [state, action] = useActionState(signInWithCodeAction, null);
  return (
    <CodeForm
      title="Írd be a belépő kódot"
      email={email}
      purpose="sign-in"
      action={action}
      state={state}
      submitLabel="Belépés"
      next={next}
      onBack={onBack}
    />
  );
}

function CodeForm({
  title,
  email,
  purpose,
  action,
  state,
  submitLabel,
  next,
  onBack,
}: {
  title: string;
  email: string;
  purpose: "email-verification" | "sign-in";
  action: (formData: FormData) => void;
  state: AuthState;
  submitLabel: string;
  next: string;
  onBack: () => void;
}) {
  const [resendPending, startResend] = useTransition();
  const [resendMessage, setResendMessage] = useState<AuthState>(null);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="next" value={next} />
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 -rotate-6 place-items-center rounded-full border-2 border-ink bg-emerald-100 shadow-brutal-xs">
          <MailCheck aria-hidden strokeWidth={2.25} className="h-5 w-5" />
        </span>
        <div>
          <h3 className="font-display text-2xl font-bold leading-tight">{title}</h3>
          <p className="mt-1 text-[15px]">
            Elküldtük a kódot erre a címre: <span className="font-semibold">{email}</span>. Nézd meg a spam mappát is.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="otp">Kód</Label>
        <Input
          id="otp"
          name="otp"
          required
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={10}
          placeholder="123456"
          className="h-14 text-center font-wide text-2xl font-semibold tracking-[0.4em] placeholder:tracking-[0.4em]"
        />
      </div>

      <FormMessage state={state} />
      <FormMessage state={resendMessage} />

      <SubmitButton size="lg" className="w-full" pendingText="Ellenőrzés…">
        {submitLabel}
      </SubmitButton>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <button
          type="button"
          disabled={resendPending}
          onClick={() =>
            startResend(async () => {
              const res = await resendCodeAction(email, purpose);
              setResendMessage(res.ok ? { success: res.message } : { error: res.message });
            })
          }
          className="font-semibold underline decoration-2 underline-offset-4 disabled:opacity-50"
        >
          {resendPending ? "Küldés…" : "Új kód küldése"}
        </button>
        <button type="button" onClick={onBack} className="underline decoration-2 underline-offset-4">
          Vissza
        </button>
      </div>
    </form>
  );
}

function Field({ id, label, ...props }: { id: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} required {...props} />
    </div>
  );
}
