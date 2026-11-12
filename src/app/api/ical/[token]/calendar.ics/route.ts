import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildFeed, feedRange } from "@/lib/ical";
import { todayISO } from "@/lib/dates";
import { siteUrl } from "@/lib/utils";
import { uuidSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

/**
 * Publikus, tokennel védett élő .ics feed. Nem igényel sütit, így a külső
 * naptárkliensek (Google, Apple, Outlook) közvetlenül lekérdezhetik.
 * Service Role kliens: a hozzáférést kizárólag az ical_token azonosítja.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const parsed = uuidSchema.safeParse(token);
  if (!parsed.success) return new NextResponse("Not found", { status: 404 });

  const supabase = createAdminClient();
  const { data: owner } = await supabase
    .from("profiles")
    .select("id, full_name, company_id")
    .eq("ical_token", parsed.data)
    .maybeSingle();
  if (!owner || !owner.company_id) return new NextResponse("Not found", { status: 404 });

  const includeTeam = request.nextUrl.searchParams.get("team") === "1";
  const { start, end, days } = feedRange(todayISO());

  let schedulesQuery = supabase
    .from("schedules")
    .select("user_id, date, status, approval_status, request_group_id, note")
    .eq("company_id", owner.company_id)
    .gte("date", start)
    .lte("date", end);
  let patternsQuery = supabase
    .from("recurring_patterns")
    .select("user_id, mon, tue, wed, thu, fri")
    .eq("company_id", owner.company_id);

  if (!includeTeam) {
    schedulesQuery = schedulesQuery.eq("user_id", owner.id);
    patternsQuery = patternsQuery.eq("user_id", owner.id);
  }

  const [companyRes, membersRes, schedulesRes, patternsRes] = await Promise.all([
    supabase.from("companies").select("name").eq("id", owner.company_id).single(),
    includeTeam
      ? supabase.from("profiles").select("id, full_name").eq("company_id", owner.company_id)
      : Promise.resolve({ data: [{ id: owner.id, full_name: owner.full_name }], error: null }),
    schedulesQuery,
    patternsQuery,
  ]);

  if (membersRes.error || schedulesRes.error || patternsRes.error) {
    return new NextResponse("Internal error", { status: 500 });
  }

  const body = buildFeed({
    calendarName: `Kibent – ${companyRes.data?.name ?? "Csapat"}${includeTeam ? " (csapat)" : ""}`,
    ownerId: owner.id,
    members: membersRes.data,
    includeTeam,
    days,
    // A feedben a megjegyzések nem jelennek meg (adatvédelem).
    schedules: schedulesRes.data.map((s) => ({ ...s, note: null })),
    patterns: patternsRes.data,
    siteUrl: siteUrl(),
  });

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="kibent.ics"',
      "Cache-Control": "private, max-age=900",
      "X-Robots-Tag": "noindex",
    },
  });
}
