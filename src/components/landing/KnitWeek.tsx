"use client";

import { useState } from "react";
import { Building2, UtensilsCrossed } from "lucide-react";
import { StatusIcon } from "@/components/calendar/StatusIcon";
import { STATUS_META, type DisplayStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

const DAYS = ["H", "K", "Sze", "Cs", "P"] as const;
const DAY_NAMES_ON = ["Hétfőn", "Kedden", "Szerdán", "Csütörtökön", "Pénteken"] as const;

type Row = { name: string; days: DisplayStatus[]; you?: boolean };

const INITIAL: Row[] = [
  { name: "Te", you: true, days: ["office", "remote", "office", "office", "remote"] },
  { name: "Bence", days: ["remote", "office", "office", "remote", "remote"] },
  { name: "Csilla", days: ["office", "office", "sick", "sick", "remote"] },
  { name: "Dávid", days: ["vacation", "vacation", "vacation", "office", "office"] },
  { name: "Emese", days: ["remote", "office", "remote", "office", "vacation_pending"] },
];

/**
 * A landing oldal hős-eleme: a hét egy kötött csíkmintás kasmírpulóverként.
 * A saját („Te”) sor kattintással váltható – pont úgy, mint az alkalmazásban.
 */
export function KnitWeek({ className }: { className?: string }) {
  const [rows, setRows] = useState(INITIAL);

  // Csapatnap-tipp: melyik napon lesztek a legtöbben bent?
  const counts = DAYS.map((_, i) => rows.filter((r) => r.days[i] === "office").length);
  const max = Math.max(...counts);
  const bestIndex = counts.indexOf(max);

  function toggle(dayIndex: number) {
    setRows((prev) =>
      prev.map((r) =>
        r.you
          ? { ...r, days: r.days.map((d, i) => (i === dayIndex ? (d === "office" ? "remote" : "office") : d)) }
          : r,
      ),
    );
  }

  return (
    <figure className={cn("rounded-2xl border-2 border-ink bg-white shadow-brutal-lg", className)}>
      <figcaption className="flex items-baseline justify-between gap-3 rounded-t-[14px] border-b-2 border-ink bg-bubblegum px-4 py-3">
        <span className="font-display text-xl font-semibold italic lg:text-2xl">A csapatod hete</span>
        <span className="text-sm">Példa Kft.</span>
      </figcaption>

      <div className="overflow-x-auto p-3 sm:p-5">
        <table className="w-full border-separate border-spacing-1.5 text-sm lg:border-spacing-2 lg:text-base" aria-label="Példa heti beosztás">
          <thead>
            <tr>
              <th scope="col" className="w-20 text-left font-normal text-muted-foreground">
                <span className="sr-only">Kolléga</span>
              </th>
              {DAYS.map((d, i) => {
                const inOffice = rows.filter((r) => r.days[i] === "office").length;
                return (
                  <th key={d} scope="col" className="pb-1 text-center font-normal">
                    <span className={cn("mx-auto block w-fit rounded-full px-2 font-semibold", i === bestIndex && max > 0 && "border-2 border-ink bg-butter")}>{d}</span>
                    <span className="flex items-center justify-center gap-1 whitespace-nowrap text-xs tabular-nums text-blue-800" aria-label={`${inOffice} fő az irodában`}>
                      <Building2 aria-hidden strokeWidth={2.25} className="h-3 w-3" />
                      {inOffice}/{rows.length}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={row.name}>
                <th scope="row" className="pr-1 text-left font-semibold">
                  {row.you ? (
                    <span className="rounded-full border-2 border-ink bg-butter px-2 py-0.5">{row.name}</span>
                  ) : (
                    row.name
                  )}
                </th>
                {row.days.map((status, d) => {
                  const meta = STATUS_META[status];
                  const canToggle = row.you && (status === "office" || status === "remote");
                  const cell = (
                    <span
                      className={cn(
                        "knit flex h-11 min-w-[3.25rem] items-center justify-center rounded-lg border-2 animate-knit-in lg:h-14 lg:min-w-[4.5rem]",
                        meta.className,
                      )}
                      style={{ animationDelay: `${(r * 5 + d) * 40}ms` }}
                      aria-hidden
                    >
                      <StatusIcon status={status} className="h-5 w-5 lg:h-6 lg:w-6" />
                    </span>
                  );
                  return (
                    <td key={d} className="p-0">
                      {canToggle ? (
                        <button
                          type="button"
                          onClick={() => toggle(d)}
                          className="press block w-full rounded-lg"
                          aria-label={`${DAYS[d]}: ${meta.label}. Kattints a váltáshoz.`}
                        >
                          {cell}
                        </button>
                      ) : (
                        <span className="block" title={`${row.name}, ${DAYS[d]}: ${meta.label}`}>
                          {cell}
                          <span className="sr-only">
                            {row.name}, {DAYS[d]}: {meta.label}
                          </span>
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-2 border-t-2 border-ink px-4 py-4 sm:px-5">
        {max > 0 && (
          <p className="flex items-start gap-2 text-[15px] lg:text-base" aria-live="polite">
            <UtensilsCrossed aria-hidden strokeWidth={2.25} className="mt-0.5 h-5 w-5 shrink-0" />
            <span>
              <span className="font-semibold">Csapatnap-tipp:</span> {DAY_NAMES_ON[bestIndex]} lesztek bent a legtöbben ({max}{" "}
              fő). Jó alkalom egy közös ebédre.
            </span>
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Próbáld ki: kattints a saját soraid celláira, és figyeld, hogyan változik a létszám és a tipp.
        </p>
      </div>
    </figure>
  );
}
