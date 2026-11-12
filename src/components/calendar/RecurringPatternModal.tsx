"use client";

import { useActionState, useEffect, useState } from "react";
import { Repeat } from "lucide-react";
import { saveRecurringPatternAction } from "@/app/(dashboard)/actions";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import type { PatternDays } from "@/lib/schedule-resolver";
import { STATUS_META } from "@/lib/status";
import { cn } from "@/lib/utils";

const DAYS: { key: keyof PatternDays; label: string }[] = [
  { key: "mon", label: "Hétfő" },
  { key: "tue", label: "Kedd" },
  { key: "wed", label: "Szerda" },
  { key: "thu", label: "Csütörtök" },
  { key: "fri", label: "Péntek" },
];

const OPTIONS = [
  { value: "office", label: "Iroda", className: STATUS_META.office.className, emoji: "🏢" },
  { value: "remote", label: "Home Office", className: STATUS_META.remote.className, emoji: "🏠" },
  { value: "", label: "Nincs", className: "bg-lilac-soft text-ink", emoji: "" },
] as const;

const EMPTY: PatternDays = { mon: null, tue: null, wed: null, thu: null, fri: null };

export function RecurringPatternForm({ initial, onSaved }: { initial: PatternDays | null; onSaved?: () => void }) {
  const [state, action] = useActionState(saveRecurringPatternAction, null);
  const [values, setValues] = useState<PatternDays>(initial ?? EMPTY);

  useEffect(() => {
    if (state?.success) onSaved?.();
  }, [state, onSaved]);

  function applyPreset(preset: PatternDays) {
    setValues(preset);
  }

  return (
    <form action={action} className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="self-center text-muted-foreground">Gyors beállítás:</span>
        <PresetButton onClick={() => applyPreset({ mon: "office", tue: "office", wed: "office", thu: "office", fri: "office" })}>
          Mindig iroda
        </PresetButton>
        <PresetButton onClick={() => applyPreset({ mon: "remote", tue: "remote", wed: "remote", thu: "remote", fri: "remote" })}>
          Teljes remote
        </PresetButton>
        <PresetButton onClick={() => applyPreset({ mon: "remote", tue: "office", wed: "remote", thu: "office", fri: "remote" })}>
          K + Cs iroda
        </PresetButton>
      </div>

      <fieldset className="space-y-2">
        <legend className="sr-only">Heti beosztás</legend>
        {DAYS.map(({ key, label }) => (
          <div key={key} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <span className="w-24 text-sm font-semibold">{label}</span>
            <div className="grid flex-1 grid-cols-3 gap-1" role="radiogroup" aria-label={label}>
              {OPTIONS.map((opt) => {
                const checked = (values[key] ?? "") === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={cn(
                      "flex cursor-pointer items-center justify-center gap-1 rounded-full border-2 px-2 py-2 text-xs font-semibold transition-[box-shadow,background-color] has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2",
                      checked ? cn(opt.className, "knit border-ink shadow-brutal-xs") : "border-ink/25 bg-white text-muted-foreground hover:border-ink",
                    )}
                  >
                    <input
                      type="radio"
                      name={key}
                      value={opt.value}
                      checked={checked}
                      onChange={() => setValues((v) => ({ ...v, [key]: opt.value || null }))}
                      className="sr-only"
                    />
                    {opt.emoji && <span aria-hidden>{opt.emoji}</span>}
                    {opt.label}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </fieldset>

      <p className="text-xs text-muted-foreground">
        A heti rutin az alapértelmezett beosztásod. Egy-egy napot a naptárban bármikor felülírhatsz, a szabadság és
        betegszabadság pedig mindig elsőbbséget élvez.
      </p>
      <FormMessage state={state} />
      <div className="flex justify-end">
        <SubmitButton pendingText="Mentés…">Mentés</SubmitButton>
      </div>
    </form>
  );
}

function PresetButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="press rounded-full border-2 border-ink bg-white px-3 py-1 font-semibold shadow-brutal-xs hover:bg-butter">
      {children}
    </button>
  );
}

export function RecurringPatternModal({
  initial,
  triggerProps,
}: {
  initial: PatternDays | null;
  triggerProps?: ButtonProps;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" {...triggerProps}>
          <Repeat /> Heti rutin
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ismétlődő heti rutin</DialogTitle>
          <DialogDescription>Pl. „minden kedden és csütörtökön bent vagyok az irodában”.</DialogDescription>
        </DialogHeader>
        {/* key: minden megnyitáskor friss állapot */}
        {open && <RecurringPatternForm key={String(open)} initial={initial} onSaved={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}
