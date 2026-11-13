"use client";

import { useActionState, useState, useTransition } from "react";
import { MailCheck } from "lucide-react";
import {
  requestPasswordResetAction,
  resendCodeAction,
  resetPasswordAction,
  signInAction,
  signUpAction,
  type AuthState,
} from "@/app/(auth)/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { cn } from "@/lib/utils";

export type LoginMode = "password" | "signup" | "code";
type Mode = LoginMode;

const TABS: { id: Mode; label: string }[] = [
  { id: "password", label: "Belépés" },
  { id: "signup", label: "Regisztráció" },
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
  const [sendCodeState, sendCode] = useActionState(requestPasswordResetAction, null);
  return (
    <div className="space-y-6">
      {mode !== "code" && (
        <div role="tablist" aria-label="Belépés vagy regisztráció" className="grid grid-cols-2 gap-1 rounded-full border-2 border-ink bg-lilac-soft p-1 text-sm">
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
              {t.label}
            </button>
          ))}
        </div>
      )}

      {mode === "password" && (
        <form action={signIn} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <Field
            id="email"
            label="Email cím"
            type="email"
            autoComplete="email"
            defaultValue={signInState?.values?.email ?? defaultEmail}
          />
          <Field id="password" label="Jelszó" type="password" autoComplete="current-password" />
          <FormMessage state={signInState} />
          <SubmitButton size="lg" className="w-full" pendingText="Belépés…">
            Belépés
          </SubmitButton>
          <p className="text-center text-sm">
            <button type="button" onClick={() => setMode("code")} className="font-semibold underline decoration-2 underline-offset-4">
              Elfelejtetted a jelszavad?
            </button>
          </p>
        </form>
      )}

      {mode === "signup" && (
        <form action={signUp} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <Field
            id="fullName"
            label="Teljes név"
            autoComplete="name"
            placeholder="pl. Kovács Anna"
            defaultValue={signUpState?.values?.fullName}
          />
          <Field
            id="email"
            label="Email cím"
            type="email"
            autoComplete="email"
            defaultValue={signUpState?.values?.email ?? defaultEmail}
          />
          <Field id="password" label="Jelszó (min. 8 karakter)" type="password" autoComplete="new-password" minLength={8} />
          <FormMessage state={signUpState} />
          <SubmitButton size="lg" className="w-full" pendingText="Fiók létrehozása…">
            Fiók létrehozása
          </SubmitButton>
          <p className="text-center text-sm text-muted-foreground">Ingyenes. Nem kell megerősítő email, azonnal belépsz.</p>
        </form>
      )}

      {mode === "code" &&
        (sendCodeState?.codeSentTo ? (
          <SignInCodeStep email={sendCodeState.codeSentTo} next={next} onBack={() => setMode("password")} />
        ) : (
          <form action={sendCode} className="space-y-4">
            <div>
              <h3 className="font-display text-2xl font-bold leading-tight">Új jelszó kérése</h3>
              <p className="mt-1 text-[15px]">Küldünk egy kódot az email címedre, azzal új jelszót állíthatsz be.</p>
            </div>
            <Field
              id="email"
              label="Email cím"
              type="email"
              autoComplete="email"
              defaultValue={sendCodeState?.values?.email ?? defaultEmail}
            />
            <FormMessage state={sendCodeState} />
            <SubmitButton size="lg" className="w-full" pendingText="Küldés…">
              Kód küldése
            </SubmitButton>
            <p className="text-center text-sm">
              <button type="button" onClick={() => setMode("password")} className="underline decoration-2 underline-offset-4">
                Vissza a belépéshez
              </button>
            </p>
          </form>
        ))}
    </div>
  );
}

/** Elfelejtett jelszó 2. lépése: kód + új jelszó. */
function SignInCodeStep({ email, next, onBack }: { email: string; next: string; onBack: () => void }) {
  const [state, action] = useActionState(resetPasswordAction, null);
  return (
    <CodeForm
      title="Írd be a kódot és az új jelszavad"
      email={email}
      action={action}
      state={state}
      submitLabel="Jelszó mentése és belépés"
      next={next}
      onBack={onBack}
    />
  );
}

function CodeForm({
  title,
  email,
  action,
  state,
  submitLabel,
  next,
  onBack,
}: {
  title: string;
  email: string;
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
      <div className="space-y-2">
        <Label htmlFor="new-password">Új jelszó (min. 8 karakter)</Label>
        <Input id="new-password" name="password" type="password" required minLength={8} autoComplete="new-password" />
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
              const res = await resendCodeAction(email);
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
