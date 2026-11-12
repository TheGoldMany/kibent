import type { Metadata } from "next";
import { PartyPopper } from "lucide-react";
import { CalendarToolbar } from "@/components/calendar/CalendarToolbar";
import { StatusLegend } from "@/components/calendar/StatusLegend";
import { TeamMatrix } from "@/components/calendar/TeamMatrix";
import { RecurringPatternModal } from "@/components/calendar/RecurringPatternModal";
import { LeaveRequestModal } from "@/components/calendar/LeaveRequestModal";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
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

  const supabase = await createClient();
  const [membersRes, patternsRes, schedulesRes] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role").eq("company_id", ctx.company.id),
    supabase
      .from("recurring_patterns")
      .select("user_id, mon, tue, wed, thu, fri")
      .eq("company_id", ctx.company.id),
    supabase
      .from("schedules")
      .select("user_id, date, status, approval_status, request_group_id, note")
      .eq("company_id", ctx.company.id)
      .gte("date", start)
      .lte("date", end),
  ]);

  if (membersRes.error || patternsRes.error || schedulesRes.error) {
    throw new Error("Nem sikerült betölteni a csapatnaptárat.");
  }

  const collator = new Intl.Collator("hu");
  const members = [...membersRes.data].sort((a, b) =>
    a.id === ctx.userId ? -1 : b.id === ctx.userId ? 1 : collator.compare(a.full_name, b.full_name),
  );
  const myPattern = patternsRes.data.find((p) => p.user_id === ctx.userId) ?? null;
  const isAdmin = ctx.profile.role === "admin";

  return (
    <div className="space-y-4">
      {params.welcome && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <PartyPopper className="h-4 w-4" />
          Üdv a(z) {ctx.company.name} csapatában! Állítsd be a heti rutinodat, hogy a kollégák lássák, mikor vagy bent.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Csapatnaptár</h1>
          <p className="text-sm text-muted-foreground">Ki van bent, ki dolgozik otthonról, és ki van szabadságon.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <RecurringPatternModal initial={myPattern} />
          <LeaveRequestModal isAdmin={isAdmin} today={today} />
        </div>
      </div>

      {!myPattern && (
        <p className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          💡 Még nincs heti rutinod. Állítsd be egyszer, és a naptár automatikusan kitöltődik minden hétre.
        </p>
      )}

      <CalendarToolbar view={view} anchor={anchor} start={start} end={end} isCurrent={today >= start && today <= end} />

      <TeamMatrix
        members={members}
        days={days}
        schedules={schedulesRes.data}
        patterns={patternsRes.data}
        currentUserId={ctx.userId}
        isAdmin={isAdmin}
        today={today}
      />

      <StatusLegend />
    </div>
  );
}
