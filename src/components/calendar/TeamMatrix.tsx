"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { AlertCircle, Users, X } from "lucide-react";
import { setDayStatusAction } from "@/app/(dashboard)/actions";
import { DayCell } from "@/components/calendar/DayCell";
import { buildMatrix, countOffice, nextToggleStatus, type PatternDays, type ScheduleLike } from "@/lib/schedule-resolver";
import { formatHu, isWeekendISO } from "@/lib/dates";
import type { Role, WorkStatus } from "@/lib/database.types";
import { cn, initials } from "@/lib/utils";

export type MatrixMember = { id: string; full_name: string; role: Role };

type OptimisticChange = { date: string; status: WorkStatus | null };

export function TeamMatrix({
  members,
  days,
  schedules,
  patterns,
  currentUserId,
  isAdmin,
  today,
}: {
  members: MatrixMember[];
  days: string[];
  schedules: ScheduleLike[];
  patterns: (PatternDays & { user_id: string })[];
  currentUserId: string;
  isAdmin: boolean;
  today: string;
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
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center text-muted-foreground">
        <Users className="h-8 w-8" />
        <p>Még nincs senki a csapatban.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Bezárás">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-20 min-w-[9.5rem] border-b border-r bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground sm:min-w-[12rem]"
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
                      "border-b border-r px-1 py-2 text-center font-normal",
                      compact ? "min-w-[2.75rem]" : "min-w-[4.5rem] sm:min-w-[6rem]",
                      weekend && "bg-muted/50 text-muted-foreground",
                      isToday && "bg-primary/10",
                    )}
                  >
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {formatHu(day, compact ? "EEEEE" : "EEE")}
                    </div>
                    <div
                      className={cn(
                        "mx-auto grid h-7 w-7 place-items-center rounded-full text-sm font-semibold",
                        isToday && "bg-primary text-primary-foreground",
                      )}
                    >
                      {formatHu(day, "d")}
                    </div>
                    {!weekend && (
                      <div
                        className={cn(
                          "mt-1 whitespace-nowrap text-[11px]",
                          office > 0 ? "font-medium text-blue-700" : "text-muted-foreground",
                        )}
                        title={`${office} fő az irodában a ${total} főből`}
                      >
                        {compact ? office : `🏢 ${office}/${total} fő`}
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
              return (
                <tr key={member.id} className={cn(isOwn && "bg-primary/[0.03]")}>
                  <th
                    scope="row"
                    className={cn(
                      "sticky left-0 z-10 border-b border-r bg-card px-3 py-1 text-left font-normal",
                      isOwn && "bg-indigo-50",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
                          isOwn ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                        )}
                        aria-hidden
                      >
                        {initials(member.full_name)}
                      </span>
                      <span className="min-w-0">
                        <span className="block max-w-[7rem] truncate font-medium sm:max-w-[9rem]">{member.full_name}</span>
                        {(isOwn || member.role === "admin") && (
                          <span className="block text-[11px] text-muted-foreground">
                            {isOwn ? "Te" : ""}
                            {isOwn && member.role === "admin" ? " · " : ""}
                            {member.role === "admin" ? "Admin" : ""}
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
                      />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Tipp: a saját sorodban egy kattintással válthatsz Iroda és Home Office között. A halványabb cellák a heti rutinodból
        jönnek.
      </p>
    </div>
  );
}
