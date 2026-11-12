"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { AlertCircle, Building2, Users, UtensilsCrossed, X } from "lucide-react";
import { setDayStatusAction } from "@/app/(dashboard)/actions";
import { DayCell } from "@/components/calendar/DayCell";
import {
  bestOfficeDay,
  buildMatrix,
  countOffice,
  nextToggleStatus,
  type PatternDays,
  type ScheduleLike,
} from "@/lib/schedule-resolver";
import { dayPhraseHu, formatHu, isWeekendISO } from "@/lib/dates";
import type { Role, WorkHours, WorkStatus } from "@/lib/database.types";
import { formatTime, minutesToTime, timeToMinutes } from "@/lib/validations";
import { cn, initials } from "@/lib/utils";

export type MatrixMember = { id: string; full_name: string; role: Role };

export type DayHours = { work: string; lunch: string | null; lunchNow: boolean };

type OptimisticChange = { date: string; status: WorkStatus | null };

export function TeamMatrix({
  members,
  days,
  schedules,
  patterns,
  currentUserId,
  isAdmin,
  today,
  workHours = [],
  lunchMinutes = 30,
  nowMinutes,
}: {
  members: MatrixMember[];
  days: string[];
  schedules: ScheduleLike[];
  patterns: (PatternDays & { user_id: string })[];
  currentUserId: string;
  isAdmin: boolean;
  today: string;
  workHours?: WorkHours[];
  lunchMinutes?: number;
  /** Budapesti idő szerint hány perc telt el ma (az „Ebédel” jelzéshez). */
  nowMinutes?: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Optimista frissítés: a saját sor explicit bejegyzéseit azonnal módosítjuk.
  const [optimisticSchedules, applyOptimistic] = useOptimistic(
    schedules,
    (state: ScheduleLike[], change: OptimisticChange) => {
      const rest = state.filter((s) => !(s.user_id === currentUserId && s.date === change.date));
      if (change.status === null) return rest;
      return [
        ...rest,
        {
          user_id: currentUserId,
          date: change.date,
          status: change.status,
          approval_status: "approved" as const,
          request_group_id: null,
          note: null,
        },
      ];
    },
  );

  const matrix = useMemo(
    () =>
      buildMatrix(
        members.map((m) => m.id),
        days,
        optimisticSchedules,
        patterns,
      ),
    [members, days, optimisticSchedules, patterns],
  );

  const compact = days.length > 14;

  // Munkaidők: felhasználó -> hétköznap (1–5) -> idősáv
  const hoursIndex = useMemo(() => {
    const idx = new Map<string, Map<number, WorkHours>>();
    for (const w of workHours) {
      const byDay = idx.get(w.user_id) ?? new Map<number, WorkHours>();
      byDay.set(w.weekday, w);
      idx.set(w.user_id, byDay);
    }
    return idx;
  }, [workHours]);

  function hoursFor(userId: string, day: string): DayHours | null {
    const w = hoursIndex.get(userId)?.get(new Date(`${day}T12:00:00`).getDay());
    if (!w) return null;
    const lunchStart = w.lunch_start ? timeToMinutes(w.lunch_start) : null;
    return {
      work: `${formatTime(w.start_time)}–${formatTime(w.end_time)}`,
      lunch:
        lunchStart !== null && lunchMinutes > 0
          ? `${minutesToTime(lunchStart)}–${minutesToTime(lunchStart + lunchMinutes)}`
          : null,
      lunchNow:
        day === today &&
        nowMinutes !== undefined &&
        lunchStart !== null &&
        nowMinutes >= lunchStart &&
        nowMinutes < lunchStart + lunchMinutes,
    };
  }
  const best = bestOfficeDay(matrix, days, today);
  const bestPhrase = best ? dayPhraseHu(best.day, days.length > 7) : null;
  const total = members.length;

  function change(date: string, status: WorkStatus | null) {
    setError(null);
    startTransition(async () => {
      applyOptimistic({ date, status });
      const result = await setDayStatusAction(date, status);
      if (!result.ok) setError(result.error);
    });
  }

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-ink bg-white p-10 text-center">
        <Users className="h-8 w-8" />
        <p>Még nincs senki a csapatban.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border-2 border-ink bg-bubblegum px-3.5 py-2.5 text-sm font-medium shadow-brutal-xs">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Bezárás">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {best && bestPhrase && (
        <p
          aria-live="polite"
          className="flex items-start gap-2.5 rounded-xl border-2 border-ink bg-butter px-4 py-3 text-[15px] shadow-brutal-xs"
        >
          <UtensilsCrossed aria-hidden strokeWidth={2.25} className="mt-0.5 h-5 w-5 shrink-0" />
          <span>
            <span className="font-semibold">Csapatnap-tipp:</span>{" "}
            {bestPhrase.charAt(0).toUpperCase() + bestPhrase.slice(1)} lesztek bent a legtöbben ({best.count} fő). Jó
            alkalom egy közös ebédre.
          </span>
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border-2 border-ink bg-white shadow-brutal">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-20 min-w-[7rem] border-b-2 border-r-2 border-ink bg-lilac-soft px-2 py-3 text-left font-display text-lg font-semibold italic sm:min-w-[14rem] sm:px-4"
              >
                Kolléga
              </th>
              {days.map((day) => {
                const weekend = isWeekendISO(day);
                const isToday = day === today;
                const office = countOffice(matrix, day);
                return (
                  <th
                    key={day}
                    scope="col"
                    className={cn(
                      "border-b-2 border-r border-b-ink bg-lilac-soft px-1 py-3 text-center font-normal",
                      compact ? "min-w-[2.75rem]" : "min-w-[5rem] sm:min-w-[7rem]",
                      weekend && "bg-[#ebe4f7] text-muted-foreground",
                      isToday && "bg-butter",
                    )}
                  >
                    <div className="text-sm font-medium">
                      {formatHu(day, compact ? "EEEEEE" : "EEE")}
                    </div>
                    <div
                      className={cn(
                        "mx-auto grid h-9 w-9 place-items-center rounded-full font-display text-xl font-bold",
                        isToday && "border-2 border-ink bg-white",
                      )}
                    >
                      {formatHu(day, "d")}
                    </div>
                    {!weekend && (
                      <div
                        className={cn(
                          "mt-1 flex items-center justify-center gap-1 whitespace-nowrap text-xs",
                          office > 0 ? "font-semibold text-blue-800" : "text-muted-foreground",
                        )}
                        title={`${office} fő az irodában a ${total} főből`}
                      >
                        <Building2 aria-hidden strokeWidth={2.25} className="h-3 w-3 shrink-0" />
                        {compact ? office : `${office}/${total} fő`}
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const isOwn = member.id === currentUserId;
              const row = matrix.get(member.id)!;
              const todayStatus = row.get(today)?.status;
              const atLunch =
                (todayStatus === "office" || todayStatus === "remote") && !!hoursFor(member.id, today)?.lunchNow;
              return (
                <tr key={member.id} className={cn(isOwn && "bg-butter/25")}>
                  <th
                    scope="row"
                    className={cn(
                      "sticky left-0 z-10 border-b border-r-2 border-r-ink bg-white px-2 py-1.5 text-left font-normal sm:px-4",
                      isOwn && "bg-[#FFF6D1]",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "hidden h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-ink text-[11px] font-bold sm:grid",
                          isOwn ? "bg-butter" : "bg-lilac",
                        )}
                        aria-hidden
                      >
                        {initials(member.full_name)}
                      </span>
                      <span className="min-w-0">
                        <span className="block max-w-[6.5rem] truncate font-semibold sm:max-w-[11rem] sm:text-[15px]">{member.full_name}</span>
                        {(isOwn || member.role === "admin" || atLunch) && (
                          <span className="mt-0.5 flex flex-wrap gap-1 text-[11px] font-medium">
                            {isOwn && <span className="rounded-full border border-ink bg-butter px-1.5">Te</span>}
                            {member.role === "admin" && <span className="rounded-full border border-ink bg-lilac px-1.5">Admin</span>}
                            {atLunch && (
                              <span className="inline-flex items-center gap-0.5 rounded-full border border-ink bg-bubblegum px-1.5">
                                <UtensilsCrossed aria-hidden className="h-3 w-3" /> Ebédel
                              </span>
                            )}
                          </span>
                        )}
                      </span>
                    </div>
                  </th>
                  {days.map((day) => {
                    const resolved = row.get(day)!;
                    const next = nextToggleStatus(resolved);
                    return (
                      <DayCell
                        key={day}
                        day={resolved}
                        personName={member.full_name}
                        isOwn={isOwn}
                        isWeekend={isWeekendISO(day)}
                        isToday={day === today}
                        compact={compact}
                        showNote={isOwn || isAdmin}
                        onToggle={isOwn && next ? () => change(day, next) : undefined}
                        onReset={isOwn ? () => change(day, null) : undefined}
                        hours={hoursFor(member.id, day)}
                      />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted-foreground">
        A saját sorodban egy kattintással válthatsz Iroda és Home Office között. A halványabb cellák a heti rutinodból
        jönnek.
      </p>
    </div>
  );
}
