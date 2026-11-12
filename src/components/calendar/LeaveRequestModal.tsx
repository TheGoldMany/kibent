"use client";

import { useActionState, useEffect, useState } from "react";
import { Lock, Palmtree, Thermometer } from "lucide-react";
import { createLeaveRequestAction } from "@/app/(dashboard)/requests/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { formatRangeHu, isISODate, workdaysBetween } from "@/lib/dates";
import { cn } from "@/lib/utils";

type LeaveType = "vacation" | "sick";

function LeaveRequestForm({
  isAdmin,
  today,
  initialType,
  onDone,
}: {
  isAdmin: boolean;
  today: string;
  initialType: LeaveType;
  onDone: () => void;
}) {
  const [state, action] = useActionState(createLeaveRequestAction, null);
  const [type, setType] = useState<LeaveType>(initialType);
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);

  const validRange = isISODate(start) && isISODate(end) && end >= start;
  const workdays = validRange ? workdaysBetween(start, end) : [];

  useEffect(() => {
    if (state?.success) {
      const t = setTimeout(onDone, 1200);
      return () => clearTimeout(t);
    }
  }, [state, onDone]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="type" value={type} />
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Típus">
        <TypeButton active={type === "vacation"} onClick={() => setType("vacation")} className="data-[active=true]:bg-amber-100">
          <Palmtree className="h-4 w-4" /> Szabadság
        </TypeButton>
        <TypeButton active={type === "sick"} onClick={() => setType("sick")} className="data-[active=true]:bg-rose-100">
          <Thermometer className="h-4 w-4" /> Betegszabadság
        </TypeButton>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="startDate">Első nap</Label>
          <Input
            id="startDate"
            name="startDate"
            type="date"
            required
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              if (e.target.value > end) setEnd(e.target.value);
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endDate">Utolsó nap</Label>
          <Input id="endDate" name="endDate" type="date" required min={start} value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>

      <p className={cn("rounded-xl border-2 border-ink bg-lilac-soft px-3.5 py-2.5 text-sm font-medium", workdays.length === 0 && "bg-bubblegum")}>
        {validRange
          ? workdays.length > 0
            ? `${formatRangeHu(start, end)}: ${workdays.length} munkanap. A hétvégéket automatikusan kihagyjuk.`
            : "A kiválasztott időszakban nincs munkanap."
          : "Válassz érvényes időszakot."}
      </p>

      <div className="space-y-2">
        <Label htmlFor="note">Megjegyzés (opcionális)</Label>
        <Textarea
          id="note"
          name="note"
          maxLength={500}
          rows={2}
          placeholder={type === "vacation" ? "pl. Családi nyaralás" : "pl. Influenza"}
        />
        <p className="text-xs text-muted-foreground">A megjegyzést csak te és az adminisztrátorok látják a naptárban.</p>
      </div>

      {type === "sick" && (
        <div className="space-y-2">
          <Label>Orvosi igazolás (opcionális, később is feltölthető)</Label>
          <FileDropzone />
          <p className="flex items-center gap-1.5 text-xs">
            <Lock className="h-3 w-3" /> Az igazolást kizárólag te és a céged adminisztrátorai láthatják.
          </p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {type === "sick"
          ? "A betegszabadság nem igényel jóváhagyást. A kollégák csak annyit látnak, hogy betegszabadságon vagy."
          : isAdmin
            ? "Adminisztrátorként a szabadságod azonnal jóváhagyottként kerül rögzítésre."
            : "A szabadságkérelmet az adminisztrátor hagyja jóvá. Addig „Függőben” jelzéssel látszik a naptárban."}
      </p>

      <FormMessage state={state} />
      <div className="flex justify-end">
        <SubmitButton disabled={workdays.length === 0 || !!state?.success} pendingText="Mentés…">
          {type === "sick" ? "Betegszabadság rögzítése" : isAdmin ? "Szabadság rögzítése" : "Kérelem elküldése"}
        </SubmitButton>
      </div>
    </form>
  );
}

function TypeButton({
  active,
  onClick,
  className,
  children,
}: {
  active: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      data-active={active}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-2 rounded-xl border-2 border-ink px-3 py-3 text-sm font-semibold transition-[transform,box-shadow]",
        active ? "shadow-brutal-sm" : "bg-white hover:bg-lilac-soft",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function LeaveRequestModal({ isAdmin, today }: { isAdmin: boolean; today: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Palmtree />
          <span className="sm:hidden">Távollét</span>
          <span className="hidden sm:inline">Szabadság / Betegség</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Távollét rögzítése</DialogTitle>
          <DialogDescription>Szabadság igénylése vagy betegszabadság bejelentése.</DialogDescription>
        </DialogHeader>
        {open && <LeaveRequestForm isAdmin={isAdmin} today={today} initialType="vacation" onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}
