import type { Metadata } from "next";
import { PartyPopper } from "lucide-react";
import { CalendarToolbar } from "@/components/calendar/CalendarToolbar";
import { StatusLegend } from "@/components/calendar/StatusLegend";
import { TeamMatrix } from "@/components/calendar/TeamMatrix";
import { RecurringPatternModal } from "@/components/calendar/RecurringPatternModal";
import { LeaveRequestModal } from "@/components/calendar/LeaveRequestModal";
import { requireMember } from "@/lib/auth";
import { withUser } from "@/lib/db";
import type { PatternDays, ScheduleLike } from "@/lib/schedule-resolver";
import type { Role } from "@/lib/database.types";
import { getRange, isISODate, todayISO, VIEW_MODES, type ViewMode } from "@/lib/dates";

export const metadata: Metadata = { title: "Csapatnaptár" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; welcome?: string }>;
}) {
  const params = await searchParams;
  const ctx = await requireMember();
  const today = todayISO();
  const view: ViewMode = VIEW_MODES.includes(params.view as ViewMode) ? (params.view as ViewMode) : "week";
  const anchor = isISODate(params.date) ? params.date : today;
  const { start, end, days } = getRange(view, anchor);

  const { members: rawMembers, patterns, schedules } = await withUser(ctx.userId, async (tx) => {
    const [members, patterns, schedules] = await Promise.all([
      tx.query<{ id: string; full_name: string; role: Role }>(
        "select id, full_name, role from profiles where company_id = $1",
        [ctx.company.id],
      ),
      tx.query<PatternDays & { user_id: string }>(
        "select user_id, mon, tue, wed, thu, fri from recurring_patterns where company_id = $1",
        [ctx.company.id],
      ),
      tx.query<ScheduleLike>(
        `select user_id, date, status, approval_status, request_group_id, note
           from schedules where company_id = $1 and date between $2 and $3`,
        [ctx.company.id, start, end],
      ),
    ]);
    return { members, patterns, schedules };
  });

  const collator = new Intl.Collator("hu");
  const members = [...rawMembers].sort((a, b) =>
    a.id === ctx.userId ? -1 : b.id === ctx.userId ? 1 : collator.compare(a.full_name, b.full_name),
  );
  const myPattern = patterns.find((p) => p.user_id === ctx.userId) ?? null;
  const isAdmin = ctx.profile.role === "admin";

  return (
    <div className="space-y-6">
      {params.welcome && (
        <div className="flex items-center gap-2 rounded-xl border-2 border-ink bg-emerald-100 px-4 py-3 text-sm font-medium shadow-brutal-xs">
          <PartyPopper className="h-4 w-4" />
          Üdv a(z) {ctx.company.name} csapatában! Állítsd be a heti rutinodat, hogy a kollégák lássák, mikor vagy bent.
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold leading-none sm:text-5xl">Csapatnaptár</h1>
          <p className="mt-2 text-[15px]">Ki van bent, ki dolgozik otthonról, és ki van szabadságon.</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <RecurringPatternModal initial={myPattern} />
          <LeaveRequestModal isAdmin={isAdmin} today={today} />
        </div>
      </div>

      {!myPattern && (
        <p className="rounded-xl border-2 border-dashed border-ink bg-butter/50 px-4 py-3 text-sm">
          Még nincs heti rutinod. Állítsd be egyszer a Heti rutin gombbal, és a naptár minden hétre kitöltődik.
        </p>
      )}

      <CalendarToolbar view={view} anchor={anchor} start={start} end={end} isCurrent={today >= start && today <= end} />

      <TeamMatrix
        members={members}
        days={days}
        schedules={schedules}
        patterns={patterns}
        currentUserId={ctx.userId}
        isAdmin={isAdmin}
        today={today}
      />

      <StatusLegend />
    </div>
  );
}
