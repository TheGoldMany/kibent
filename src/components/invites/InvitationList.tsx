"use client";

import { useState, useTransition } from "react";
import { MailPlus, RotateCw, Trash2 } from "lucide-react";
import { resendInvitationAction, revokeInvitationAction } from "@/app/(dashboard)/settings/actions";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import type { CompanyInvitation } from "@/lib/database.types";

const dateFmt = new Intl.DateTimeFormat("hu-HU", { month: "short", day: "numeric", timeZone: "Europe/Budapest" });

export function InvitationList({ invitations, baseUrl }: { invitations: CompanyInvitation[]; baseUrl: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  if (invitations.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-xl border-2 border-dashed border-ink bg-white px-4 py-3 text-sm">
        <MailPlus aria-hidden className="h-4 w-4" /> Nincs függő meghívó.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {message && (
        <p role="status" className="rounded-lg border-2 border-ink bg-emerald-100 px-3 py-2 text-sm font-medium">
          {message}
        </p>
      )}
      <ul className="divide-y-2 divide-ink overflow-hidden rounded-xl border-2 border-ink bg-white">
        {invitations.map((inv) => {
          const expired = new Date(inv.expires_at) < new Date();
          return (
            <li key={inv.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  <span className="truncate">{inv.email}</span>
                  {expired && (
                    <span className="rounded-full border-2 border-ink bg-bubblegum px-2 text-[11px] font-bold">Lejárt</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  Meghívva: {dateFmt.format(new Date(inv.created_at))}{" "}
                  {expired ? "– küldd újra, ha még aktuális." : `Érvényes: ${dateFmt.format(new Date(inv.expires_at))}`}
                </p>
              </div>
              <CopyButton value={`${baseUrl}/invite/${inv.token}`} label="Link" size="sm" />
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await resendInvitationAction(inv.id);
                    setMessage(res.message);
                  })
                }
              >
                <RotateCw /> Újraküldés
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                aria-label={`Meghívó visszavonása: ${inv.email}`}
                onClick={() => {
                  if (!confirm(`Visszavonod a(z) ${inv.email} címre küldött meghívót?`)) return;
                  startTransition(async () => {
                    const res = await revokeInvitationAction(inv.id);
                    setMessage(res.ok ? `Visszavonva: ${inv.email}` : res.error);
                  });
                }}
              >
                <Trash2 />
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
