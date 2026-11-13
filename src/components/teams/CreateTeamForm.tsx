"use client";

import { useActionState } from "react";
import { createCompanyAction } from "@/app/(auth)/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";

/** Új csapat létrehozása (üres felület és a csapatváltó „Új csapat” ablaka). */
export function CreateTeamForm({ autoFocus }: { autoFocus?: boolean }) {
  const [state, action] = useActionState(createCompanyAction, null);
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="team-name">Csapat neve</Label>
        <Input
          id="team-name"
          name="name"
          placeholder="pl. Marketing, Példa Kft."
          required
          minLength={2}
          maxLength={120}
          autoFocus={autoFocus}
        />
      </div>
      <FormMessage state={state} />
      <SubmitButton size="lg" className="w-full" pendingText="Létrehozás…">
        Csapat létrehozása
      </SubmitButton>
    </form>
  );
}
