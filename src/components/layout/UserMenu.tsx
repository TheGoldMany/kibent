"use client";

import Link from "next/link";
import { LogOut, Settings, ShieldCheck } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/app/(auth)/actions";
import { initials } from "@/lib/utils";

export function UserMenu({
  fullName,
  email,
  isAdmin,
  companyName,
}: {
  fullName: string;
  email: string;
  isAdmin: boolean;
  companyName: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="press grid h-10 w-10 place-items-center rounded-full border-2 border-ink bg-lilac text-sm font-bold shadow-brutal-xs outline-none"
        aria-label="Felhasználói menü"
      >
        {initials(fullName)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="space-y-0.5">
          <p className="truncate">{fullName}</p>
          <p className="truncate text-xs font-normal text-muted-foreground">{email}</p>
          <p className="truncate pt-2 font-display text-base italic">{companyName}</p>
          <p className="flex items-center gap-1 text-xs font-normal">
            {isAdmin && <ShieldCheck className="h-3.5 w-3.5" />}
            {isAdmin ? "Adminisztrátor" : "Tag"}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings /> Beállítások
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void signOutAction()}>
          <LogOut /> Kijelentkezés
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
