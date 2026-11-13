import { NextResponse, type NextRequest } from "next/server";
import { withSystem } from "@/lib/db";
import { buildFeed, feedRange } from "@/lib/ical";
import { todayISO } from "@/lib/dates";
import type { PatternDays, ScheduleLike } from "@/lib/schedule-resolver";
import { siteUrl } from "@/lib/utils";
import { uuidSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

type Owner = { id: string; full_name: string; company_id: string | null; company_name: string | null };

/**
 * Publikus, tokennel védett élő .ics feed. Nem igényel sütit, így a külső
 * naptárkliensek (Google, Apple, Outlook) közvetlenül lekérdezhetik.
 * Tulajdonosi (RLS-t megkerülő) kapcsolat: a hozzáférést kizárólag az ical_token
 * azonosítja, és minden lekérdezés a token gazdájának cégére szűr.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const parsed = uuidSchema.safeParse(token);
  if (!parsed.success) return new NextResponse("Not found", { status: 404 });

  const includeTeam = request.nextUrl.searchParams.get("team") === "1";
  // Melyik csapat naptára (?c=<csapat>); régi linkeknél a felhasználó első csapata.
  const wantedTeam = uuidSchema.safeParse(request.nextUrl.searchParams.get("c"));
  const teamId = wantedTeam.success ? wantedTeam.data : null;
  const { start, end, days } = feedRange(todayISO());

  const data = await withSystem(async (db) => {
    const owner = await db.one<Owner>(
      `select p.id, p.full_name, m.company_id, c.name as company_name
         from profiles p
         join memberships m on m.user_id = p.id and ($2::uuid is null or m.company_id = $2::uuid)
         join companies c on c.id = m.company_id
        where p.ical_token = $1
        order by m.created_at
        limit 1`,
      [parsed.data, teamId],
    );
    if (!owner?.company_id) return null;

    // Csapat nézetben a cég minden tagja, egyébként csak a token gazdája.
    const onlyUser = includeTeam ? null : owner.id;

    const members = includeTeam
      ? await db.query<{ id: string; full_name: string }>(
          "select p.id, p.full_name from memberships m join profiles p on p.id = m.user_id where m.company_id = $1",
          [owner.company_id],
        )
      : [{ id: owner.id, full_name: owner.full_name }];
    const patterns = await db.query<PatternDays & { user_id: string }>(
      `select user_id, mon, tue, wed, thu, fri from recurring_patterns
        where company_id = $1 and ($2::uuid is null or user_id = $2::uuid)`,
      [owner.company_id, onlyUser],
    );
    // A megjegyzéseket (note) adatvédelmi okból nem kérdezzük le.
    const schedules = await db.query<ScheduleLike>(
      `select user_id, date, status, approval_status, request_group_id, null::text as note
         from schedules
        where company_id = $1 and ($2::uuid is null or user_id = $2::uuid)
          and date between $3 and $4`,
      [owner.company_id, onlyUser, start, end],
    );
    return { owner, members, patterns, schedules };
  });

  if (!data) return new NextResponse("Not found", { status: 404 });
  const { owner, members, patterns, schedules } = data;

  const body = buildFeed({
    calendarName: `Kibent – ${owner.company_name ?? "Csapat"}${includeTeam ? " (csapat)" : ""}`,
    ownerId: owner.id,
    members,
    includeTeam,
    days,
    schedules,
    patterns,
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
