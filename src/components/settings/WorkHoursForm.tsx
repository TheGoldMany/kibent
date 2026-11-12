"use client";

import { useActionState, useState } from "react";
import { CopyCheck, UtensilsCrossed } from "lucide-react";
import { saveWorkHoursAction } from "@/app/(dashboard)/settings/actions";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import type { WorkHours } from "@/lib/database.types";
import { formatTime, minutesToTime, timeToMinutes } from "@/lib/validations";
import { cn } from "@/lib/utils";

const DAYS = [
  { weekday: 1, label: "Hétfő" },
  { weekday: 2, label: "Kedd" },
  { weekday: 3, label: "Szerda" },
  { weekday: 4, label: "Csütörtök" },
  { weekday: 5, label: "Péntek" },
] as const;

type Row = { enabled: boolean; start: string; end: string; lunch: string };

/** „9:00” → „09:00” a <input type="time"> számára. */
function toInput(value: string | null | undefined): string {
  const m = value ? timeToMinutes(value) : null;
  if (m === null) return "";
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function WorkHoursForm({ initial, lunchMinutes }: { initial: WorkHours[]; lunchMinutes: number }) {
  const [state, action] = useActionState(saveWorkHoursAction, null);
  const [rows, setRows] = useState<Record<number, Row>>(() => {
    const byDay = new Map(initial.map((w) => [w.weekday as number, w]));
    const empty = initial.length === 0;
    return Object.fromEntries(
      DAYS.map(({ weekday }) => {
        const w = byDay.get(weekday);
        return [
          weekday,
          w
            ? { enabled: true, start: toInput(w.start_time), end: toInput(w.end_time), lunch: toInput(w.lunch_start) }
            : // Első beállításnál kényelmes alapértelmezés
              { enabled: empty, start: "09:00", end: "17:00", lunch: "12:00" },
        ];
      }),
    );
  });

  function update(weekday: number, patch: Partial<Row>) {
    setRows((r) => ({ ...r, [weekday]: { ...r[weekday]!, ...patch } }));
  }

  function copyMondayToAll() {
    const mon = rows[1]!;
    setRows(Object.fromEntries(DAYS.map(({ weekday }) => [weekday, { ...mon }])));
  }

  function lunchEnd(lunch: string): string | null {
    const m = timeToMinutes(lunch);
    return m === null ? null : minutesToTime(m + lunchMinutes);
  }

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-3">
        {DAYS.map(({ weekday, label }) => {
          const row = rows[weekday]!;
          const end = row.lunch ? lunchEnd(row.lunch) : null;
          return (
            <fieldset
              key={weekday}
              className={cn(
                "grid items-end gap-3 rounded-xl border-2 border-ink p-3 sm:grid-cols-[8.5rem_1fr_1fr_1.3fr]",
                row.enabled ? "bg-white" : "bg-lilac-soft",
              )}
            >
              <legend className="sr-only">{label}</legend>
              <label className="flex cursor-pointer items-center gap-2 self-center font-semibold">
                <input
                  type="checkbox"
                  name={`d${weekday}_enabled`}
                  checked={row.enabled}
                  onChange={(e) => update(weekday, { enabled: e.target.checked })}
                  className="h-5 w-5 accent-black"
                />
                {label}
              </label>
              {row.enabled ? (
                <>
                  <TimeField
                    label="Kezdés"
                    name={`d${weekday}_start`}
                    value={row.start}
                    onChange={(v) => update(weekday, { start: v })}
                  />
                  <TimeField label="Vége" name={`d${weekday}_end`} value={row.end} onChange={(v) => update(weekday, { end: v })} />
                  <div className="space-y-1">
                    <TimeField
                      label="Ebéd kezdete"
                      name={`d${weekday}_lunch`}
                      value={row.lunch}
                      onChange={(v) => update(weekday, { lunch: v })}
                      required={false}
                    />
                  </div>
                  {end && lunchMinutes > 0 && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground sm:col-span-3 sm:col-start-2">
                      <UtensilsCrossed aria-hidden className="h-3.5 w-3.5" />
                      Ebédszünet {formatTime(row.lunch)}–{end}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground sm:col-span-3">Ezen a napon nem dolgozol.</p>
              )}
            </fieldset>
          );
        })}
      </div>

      <p className="rounded-xl border-2 border-dashed border-ink bg-butter/40 px-4 py-3 text-sm">
        Az ebédszünet hossza a cégnél <span className="font-semibold">{lunchMinutes} perc</span>. Ezt az
        adminisztrátor állítja be, te azt választod meg, mikor kezded.
      </p>

      <FormMessage state={state} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={copyMondayToAll}
          className="inline-flex items-center gap-1.5 text-sm font-semibold underline decoration-2 underline-offset-4"
        >
          <CopyCheck aria-hidden className="h-4 w-4" /> Hétfő beállítása minden napra
        </button>
        <SubmitButton pendingText="Mentés…">Munkaidő mentése</SubmitButton>
      </div>
    </form>
  );
}

function TimeField({
  label,
  name,
  value,
  onChange,
  required = true,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block space-y-1 text-sm font-semibold">
      <span>{label}</span>
      <input
        type="time"
        name={name}
        value={value}
        required={required}
        step={300}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-11 w-full rounded-lg border-2 border-ink bg-white px-3 text-[15px] font-normal tabular-nums focus-visible:shadow-brutal-sm focus-visible:outline-none"
      />
    </label>
  );
}
