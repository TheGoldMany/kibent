"use client";

import { useState, useTransition } from "react";
import { Check, ChevronsUpDown, Plus, ShieldCheck } from "lucide-react";
import { switchTeamAction } from "@/app/(auth)/actions";
import { CreateTeamForm } from "@/components/teams/CreateTeamForm";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Team = { id: string; name: string; role: "admin" | "member" };

/** Csapatváltó a fejlécben: a saját csapatok listája + új csapat létrehozása. */
export function TeamSwitcher({ teams, activeId }: { teams: Team[]; activeId: string | null }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const switchTo = (teamId: string) => {
    const data = new FormData();
    data.set("teamId", teamId);
    startTransition(() => switchTeamAction(data));
  };
  const active = teams.find((t) => t.id === activeId) ?? null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={pending}
          className="press inline-flex h-10 max-w-[9.5rem] items-center gap-2 rounded-full border-2 border-ink bg-white px-3 text-sm font-semibold shadow-brutal-xs outline-none sm:max-w-[16rem] sm:px-4"
          aria-label="Csapat váltása"
        >
          <span className="truncate font-display text-base italic">{pending ? "Váltás…" : (active?.name ?? "Csapataim")}</span>
          <ChevronsUpDown aria-hidden className="h-4 w-4 shrink-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel>Csapataid</DropdownMenuLabel>
          {teams.map((t) => (
            <DropdownMenuItem key={t.id} onSelect={() => t.id !== activeId && switchTo(t.id)}>
              <Check aria-hidden className={t.id === activeId ? "opacity-100" : "opacity-0"} />
              <span className="flex-1 truncate">{t.name}</span>
              {t.role === "admin" && <ShieldCheck aria-label="Adminisztrátor" className="text-muted-foreground" />}
            </DropdownMenuItem>
          ))}
          {teams.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
            <Plus aria-hidden /> Új csapat létrehozása
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Új csapat</DialogTitle>
            <DialogDescription>Te leszel az adminisztrátor, és utána meghívhatod a többieket email címmel.</DialogDescription>
          </DialogHeader>
          {createOpen && <CreateTeamForm autoFocus />}
        </DialogContent>
      </Dialog>
    </>
  );
}
