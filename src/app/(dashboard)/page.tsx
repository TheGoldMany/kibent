import type { Metadata } from "next";
import { PartyPopper } from "lucide-react";
import { CalendarToolbar } from "@/components/calendar/CalendarToolbar";
import { StatusLegend } from "@/components/calendar/StatusLegend";
import { TeamMatrix } from "@/components/calendar/TeamMatrix";
import { RecurringPatternModal } from "@/components/calendar/RecurringPatternModal";
import { LeaveRequestModal } from "@/components/calendar/LeaveRequestModal";
import { EmptyWorkspace } from "@/components/teams/EmptyWorkspace";
import { givenName } from "@/lib/utils";
import { requireSession, withMember, type MemberContext } from "@/lib/auth";
import { hasV2Schema } from "@/lib/schema";
import type { PatternDays, ScheduleLike } from "@/lib/schedule-resolver";
import type { Role, WorkHours } from "@/lib/database.types";
import { getRange, isISODate, nowMinutesBudapest, todayISO, VIEW_MODES, type ViewMode } from "@/lib/dates";

export const metadata: Metadata = { title: "Csapatnaptár" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; welcome?: string; new?: string }>;
}) {
  const params = await searchParams;
  const session = await requireSession();
  // Még nincs csapat: üres felület, ahol létrehozhat egyet.
  if (!session.company) return <EmptyWorkspace firstName={givenName(session.profile.full_name)} email={session.profile.email} />;
  const ctx = session as MemberContext;
  const today = todayISO();
  const view: ViewMode = VIEW_MODES.includes(params.view as ViewMode) ? (params.view as ViewMode) : "week";
  const anchor = isISODate(params.date) ? params.date : today;
  const { start, end, days } = getRange(view, anchor);

  const v2 = await hasV2Schema();
  // Egyetlen adatbázis-kör: tagok, heti rutinok és az időszak bejegyzései JSON-ként.
  const data = await withMember(ctx, (tx) =>
    tx.one<{
      members: { id: string; full_name: string; role: Role }[];
      patterns: (PatternDays & { user_id: string })[];
      schedules: ScheduleLike[];
      work_hours: WorkHours[];
    }>(
      `select
         coalesce((select json_agg(json_build_object('id', p.id, 'full_name', p.full_name, 'role', m.role))
                     from memberships m join profiles p on p.id = m.user_id where m.company_id = $1), '[]') as members,
         coalesce((select json_agg(json_build_object('user_id', user_id, 'mon', mon, 'tue', tue,
                                                     'wed', wed, 'thu', thu, 'fri', fri))
                     from recurring_patterns where company_id = $1), '[]') as patterns,
         coalesce((select json_agg(json_build_object('user_id', user_id, 'date', date, 'status', status,
                                                     'approval_status', approval_status,
                                                     'request_group_id', request_group_id,
                                                     -- megjegyzés csak a sajátnál és adminnak (adatvédelem)
                                                     'note', case when user_id = $4 or $5 then note end))
                     from schedules where company_id = $1 and date between $2 and $3), '[]') as schedules,
         ${
           v2
             ? `coalesce((select json_agg(json_build_object('user_id', user_id, 'weekday', weekday, 'start_time', start_time,
                                                     'end_time', end_time, 'lunch_start', lunch_start))
                     from work_hours where company_id = $1), '[]')`
             : "'[]'::json"
         } as work_hours`,
      [ctx.company.id, start, end, ctx.userId, ctx.profile.role === "admin"],
    ),
  );
  const rawMembers = data?.members ?? [];
  const patterns = data?.patterns ?? [];
  const schedules = data?.schedules ?? [];
  const workHours = data?.work_hours ?? [];

  const collator = new Intl.Collator("hu");
  const members = [...rawMembers].sort((a, b) =>
    a.id === ctx.userId ? -1 : b.id === ctx.userId ? 1 : collator.compare(a.full_name, b.full_name),
  );
  const myPattern = patterns.find((p) => p.user_id === ctx.userId) ?? null;
  const isAdmin = ctx.profile.role === "admin";

  return (
    <div className="space-y-6">
      {params.new && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-ink bg-butter px-4 py-3 text-sm font-medium shadow-brutal-xs">
          <PartyPopper className="h-4 w-4" />
          Kész a(z) {ctx.company.name} csapat! Hívd meg a kollégáidat a „Kollégák meghívása” gombbal.
        </div>
      )}
      {params.welcome && (
        <div className="flex items-center gap-2 rounded-xl border-2 border-ink bg-emerald-100 px-4 py-3 text-sm font-medium shadow-brutal-xs">
          <PartyPopper className="h-4 w-4" />
          Üdv a(z) {ctx.company.name} csapatában! Állítsd be a heti rutinodat, hogy a kollégák lássák, mikor vagy bent.
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-5xl font-bold leading-none sm:text-6xl">Csapatnaptár</h1>
          <p className="mt-3 text-lg">Ki van bent, ki dolgozik otthonról, és ki van szabadságon.</p>
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
        workHours={workHours}
        lunchMinutes={ctx.company.lunch_minutes}
        nowMinutes={nowMinutesBudapest()}
      />

      <StatusLegend />
    </div>
  );
}
