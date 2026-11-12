import ical, { ICalCalendarMethod, ICalEventBusyStatus, ICalEventTransparency } from "ical-generator";
import { addDays, addMonths, eachDayOfInterval, endOfMonth, startOfMonth } from "date-fns";
import { parseISODate, toISODate } from "@/lib/dates";
import { buildMatrix, type PatternDays, type ResolvedDay, type ScheduleLike } from "@/lib/schedule-resolver";
import { STATUS_META } from "@/lib/status";

/** Feed időszak: az aktuális hónap előtti hónaptól a +3. hónap végéig. */
export function feedRange(todayISO: string): { start: string; end: string; days: string[] } {
  const today = parseISODate(todayISO);
  const start = startOfMonth(addMonths(today, -1));
  const end = endOfMonth(addMonths(today, 3));
  return { start: toISODate(start), end: toISODate(end), days: eachDayOfInterval({ start, end }).map(toISODate) };
}

export type FeedEvent = { key: string; title: string; start: string; end: string; description?: string };

/** Egymást követő, azonos című napokat egyetlen többnapos eseménnyé fűz össze. */
export function mergeConsecutive(items: { date: string; key: string; title: string; description?: string }[]): FeedEvent[] {
  const sorted = [...items].sort((a, b) => (a.key === b.key ? (a.date < b.date ? -1 : 1) : a.key < b.key ? -1 : 1));
  const out: FeedEvent[] = [];
  for (const it of sorted) {
    const last = out[out.length - 1];
    if (last && last.key === it.key && last.title === it.title && toISODate(addDays(parseISODate(last.end), 1)) === it.date) {
      last.end = it.date;
    } else {
      out.push({ key: it.key, title: it.title, start: it.date, end: it.date, description: it.description });
    }
  }
  return out;
}

function ownTitle(day: ResolvedDay): string | null {
  if (!day.status) return null;
  return STATUS_META[day.display].icalTitle ?? null;
}

export function buildFeed(opts: {
  calendarName: string;
  ownerId: string;
  members: { id: string; full_name: string }[];
  includeTeam: boolean;
  days: string[];
  schedules: ScheduleLike[];
  patterns: (PatternDays & { user_id: string })[];
  siteUrl: string;
}): string {
  const userIds = opts.includeTeam ? opts.members.map((m) => m.id) : [opts.ownerId];
  const matrix = buildMatrix(userIds, opts.days, opts.schedules, opts.patterns);
  const names = new Map(opts.members.map((m) => [m.id, m.full_name]));

  const items: { date: string; key: string; title: string; description?: string }[] = [];
  for (const [userId, row] of matrix) {
    for (const day of row.values()) {
      if (userId === opts.ownerId) {
        const title = ownTitle(day);
        if (title) items.push({ date: day.date, key: `own`, title });
      } else if (day.status === "office") {
        items.push({
          date: day.date,
          key: `team-${userId}`,
          title: `[Kibent] ${names.get(userId) ?? "Kolléga"} – Iroda`,
        });
      }
    }
  }

  const calendar = ical({
    name: opts.calendarName,
    description: "Kibent csapatnaptár – automatikusan frissül",
    timezone: "Europe/Budapest",
    prodId: { company: "Kibent", product: "Csapatnaptar", language: "HU" },
    method: ICalCalendarMethod.PUBLISH,
    ttl: 60 * 60, // a kliensek óránként frissítsenek
    url: opts.siteUrl,
  });

  for (const ev of mergeConsecutive(items)) {
    calendar.createEvent({
      id: `${opts.ownerId}-${ev.key}-${ev.start}@kibent`,
      // Helyi éjfél: az ical-generator egész napos dátumnál helyi getter-eket használ.
      start: parseISODate(ev.start),
      end: addDays(parseISODate(ev.end), 1), // DTEND kizárólagos (RFC 5545)
      allDay: true,
      summary: ev.title,
      description: ev.description,
      url: opts.siteUrl,
      transparency: ICalEventTransparency.TRANSPARENT, // ne blokkolja a foglaltságot
      busystatus: ICalEventBusyStatus.FREE,
    });
  }

  return calendar.toString();
}
