"use client";

import { useActionState } from "react";
import { acceptInvitationAction } from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";

export function AcceptInviteForm({ token }: { token: string }) {
  const [state, action] = useActionState(acceptInvitationAction, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <FormMessage state={state} />
      <SubmitButton size="lg" className="w-full" pendingText="Csatlakozás…">
        Elfogadom, csatlakozom
      </SubmitButton>
    </form>
  );
}
