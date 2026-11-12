"use client";

import { useActionState, useState, useTransition } from "react";
import { MoreHorizontal, RefreshCw, ShieldCheck, UserMinus, UserCog } from "lucide-react";
import {
  regenerateIcalTokenAction,
  removeMemberAction,
  setMemberRoleAction,
  updateCompanyNameAction,
  updateLunchMinutesAction,
  updateProfileAction,
} from "@/app/(dashboard)/settings/actions";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import type { Role } from "@/lib/database.types";
import { LUNCH_MINUTE_OPTIONS } from "@/lib/validations";
import { initials } from "@/lib/utils";

export function ProfileForm({ fullName, email }: { fullName: string; email: string }) {
  const [state, action] = useActionState(updateProfileAction, null);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="fullName">Teljes név</Label>
          <Input id="fullName" name="fullName" defaultValue={fullName} required minLength={2} maxLength={120} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email cím</Label>
          <Input id="email" value={email} disabled readOnly />
        </div>
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingText="Mentés…">Mentés</SubmitButton>
    </form>
  );
}

function useConfirmAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run(message: string | null, fn: () => Promise<{ ok: boolean; error?: string }>) {
    if (message && !confirm(message)) return;
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Hiba történt.");
    });
  }
  return { pending, error, run };
}

export function IcalLinks({ personalUrl, teamUrl }: { personalUrl: string; teamUrl: string }) {
  const { pending, error, run } = useConfirmAction();
  return (
    <div className="space-y-4">
      <LinkRow label="Saját beosztásom" url={personalUrl} />
      <LinkRow label="Saját beosztásom + a kollégák irodai napjai" url={teamUrl} />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() =>
            run(
              "Új naptár linket generálsz. A régi link azonnal érvénytelen lesz, a naptáraidban újra fel kell venned. Folytatod?",
              regenerateIcalTokenAction,
            )
          }
        >
          <RefreshCw className={pending ? "animate-spin" : undefined} /> Új link generálása
        </Button>
        <span className="text-xs text-muted-foreground">Ha a link illetéktelen kezekbe került.</span>
      </div>
      {error && <p className="text-sm text-rose-700">{error}</p>}
    </div>
  );
}

function LinkRow({ label, url }: { label: string; url: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input value={url} readOnly className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <CopyButton value={url} label="Naptár link másolása" className="shrink-0" />
      </div>
    </div>
  );
}

export function CompanyForm({
  name,
  lunchMinutes,
  lunchEnabled = true,
}: {
  name: string;
  lunchMinutes: number;
  lunchEnabled?: boolean;
}) {
  const [state, action] = useActionState(updateCompanyNameAction, null);
  const [lunchState, lunchAction] = useActionState(updateLunchMinutesAction, null);
  return (
    <div className="space-y-6">
      <form action={action} className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="companyName">Cég neve</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id="companyName" name="name" defaultValue={name} required minLength={2} maxLength={120} />
            <SubmitButton className="shrink-0" pendingText="Mentés…">
              Mentés
            </SubmitButton>
          </div>
        </div>
        <FormMessage state={state} />
      </form>

      {lunchEnabled && (
      <form action={lunchAction} className="space-y-3">
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Ebédszünet hossza</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {LUNCH_MINUTE_OPTIONS.map((m) => (
              <label
                key={m}
                className="cursor-pointer rounded-full border-2 border-ink bg-white px-3.5 py-1.5 text-sm font-semibold has-[:checked]:bg-butter has-[:checked]:shadow-brutal-xs has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2"
              >
                <input type="radio" name="minutes" value={m} defaultChecked={m === lunchMinutes} className="sr-only" />
                {m === 0 ? "Nincs" : `${m} perc`}
              </label>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Mindenkire ugyanaz a hossz vonatkozik; azt, hogy mikor ebédelnek, a kollégák maguk állítják be.
          </p>
        </fieldset>
        <FormMessage state={lunchState} />
        <SubmitButton size="sm" pendingText="Mentés…">
          Ebédszünet mentése
        </SubmitButton>
      </form>
      )}
    </div>
  );
}

export function MemberList({
  members,
  currentUserId,
}: {
  members: { id: string; full_name: string; email: string; role: Role }[];
  currentUserId: string;
}) {
  const { pending, error, run } = useConfirmAction();
  return (
    <div className="space-y-2">
      {error && <p className="rounded-xl border-2 border-ink bg-bubblegum px-3.5 py-2.5 text-sm font-medium">{error}</p>}
      <ul className="divide-y-2 divide-ink overflow-hidden rounded-xl border-2 border-ink bg-white">
        {members.map((m) => {
          const isSelf = m.id === currentUserId;
          return (
            <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-ink bg-lilac text-xs font-bold">
                {initials(m.full_name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.full_name} {isSelf && <span className="text-muted-foreground">(te)</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">{m.email}</p>
              </div>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                {m.role === "admin" && <ShieldCheck className="h-3.5 w-3.5" />}
                {m.role === "admin" ? "Admin" : "Tag"}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={pending} aria-label={`${m.full_name} kezelése`}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() =>
                      run(
                        m.role === "admin"
                          ? `${m.full_name} elveszíti az adminisztrátori jogait. Folytatod?`
                          : `${m.full_name} adminisztrátor lesz (jóváhagyhat kérelmeket, láthatja az orvosi igazolásokat). Folytatod?`,
                        () => setMemberRoleAction(m.id, m.role === "admin" ? "member" : "admin"),
                      )
                    }
                  >
                    <UserCog /> {m.role === "admin" ? "Admin jog elvétele" : "Adminná tétel"}
                  </DropdownMenuItem>
                  {!isSelf && (
                    <DropdownMenuItem
                      className="text-rose-700 focus:text-rose-800"
                      onSelect={() =>
                        run(
                          `${m.full_name} eltávolítása a cégből: a beosztása és heti rutinja törlődik. Folytatod?`,
                          () => removeMemberAction(m.id),
                        )
                      }
                    >
                      <UserMinus /> Eltávolítás a cégből
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
