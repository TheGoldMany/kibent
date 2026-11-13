"use client";

import { useActionState } from "react";
import { Check, CircleAlert, Link2, UserCheck } from "lucide-react";
import { sendInvitationsAction, type InviteResult } from "@/app/(dashboard)/settings/actions";
import { CopyButton } from "@/components/ui/copy-button";
import { FormMessage } from "@/components/ui/form-message";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";

const STATUS: Record<InviteResult["status"], { label: string; icon: typeof Check }> = {
  sent: { label: "Elküldve", icon: Check },
  link: { label: "Link kész", icon: Link2 },
  member: { label: "Már tag", icon: UserCheck },
  failed: { label: "Nem sikerült elküldeni", icon: CircleAlert },
};

/** Email címek megadása → személyes meghívók. Az eredmény címenként látszik. */
export function InviteForm() {
  const [state, action] = useActionState(sendInvitationsAction, null);

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="emails">Email címek</Label>
          <Textarea
            id="emails"
            name="emails"
            required
            rows={3}
            placeholder={"anna@pelda.hu\nbela@pelda.hu"}
            autoComplete="off"
          />
          <p className="text-sm text-muted-foreground">
            Több címet vesszővel vagy új sorral válassz el. Mindenki saját meghívó linket kap emailben.
          </p>
        </div>
        <FormMessage state={state?.error ? { error: state.error } : state?.success ? { success: state.success } : null} />
        <div className="flex justify-end">
          <SubmitButton pendingText="Küldés…">Meghívók küldése</SubmitButton>
        </div>
      </form>

      {state?.results && state.results.length > 0 && (
        <ul className="divide-y-2 divide-ink overflow-hidden rounded-xl border-2 border-ink bg-white">
          {state.results.map((r) => {
            const meta = STATUS[r.status];
            const Icon = meta.icon;
            return (
              <li key={r.email} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                <Icon aria-hidden className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate font-semibold">{r.email}</span>
                <span className="text-muted-foreground">{meta.label}</span>
                {r.url && r.status !== "sent" && <CopyButton value={r.url} label="Link másolása" size="sm" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
