"use client";

import { useActionState, useState } from "react";
import { magicLinkAction, signInAction, signUpAction } from "@/app/(auth)/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { cn } from "@/lib/utils";

type Mode = "password" | "signup" | "magic";

const TABS: { id: Mode; label: string }[] = [
  { id: "password", label: "Jelszóval" },
  { id: "signup", label: "Regisztráció" },
  { id: "magic", label: "Magic link" },
];

export function LoginForms({ next, initialError }: { next: string; initialError?: string }) {
  const [mode, setMode] = useState<Mode>("password");
  const [signInState, signIn] = useActionState(signInAction, initialError ? { error: initialError } : null);
  const [signUpState, signUp] = useActionState(signUpAction, null);
  const [magicState, magic] = useActionState(magicLinkAction, null);

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
            {t.label}
          </button>
        ))}
      </div>

      {mode === "password" && (
        <form action={signIn} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <Field id="email" label="Email cím" type="email" autoComplete="email" />
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
          <Field id="email" label="Email cím" type="email" autoComplete="email" />
          <Field id="password" label="Jelszó (min. 8 karakter)" type="password" autoComplete="new-password" />
          <FormMessage state={signUpState} />
          <SubmitButton size="lg" className="w-full" pendingText="Fiók létrehozása…">
            Fiók létrehozása
          </SubmitButton>
        </form>
      )}

      {mode === "magic" && (
        <form action={magic} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <Field id="email" label="Email cím" type="email" autoComplete="email" />
          <p className="text-sm text-muted-foreground">
            Jelszó nélkül: küldünk egy egyszer használatos belépő linket. Ha még nincs fiókod, automatikusan létrejön.
          </p>
          <FormMessage state={magicState} />
          <SubmitButton size="lg" className="w-full" pendingText="Küldés…">
            Belépő link küldése
          </SubmitButton>
        </form>
      )}
    </div>
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
