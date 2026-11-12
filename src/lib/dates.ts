import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  format,
  isValid,
  isWeekend,
  parse,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { hu } from "date-fns/locale";

export const APP_TIMEZONE = "Europe/Budapest";
export const ISO = "yyyy-MM-dd";

export type ViewMode = "week" | "2week" | "month";
export const VIEW_MODES: ViewMode[] = ["week", "2week", "month"];
export const VIEW_LABELS: Record<ViewMode, string> = {
  week: "Heti",
  "2week": "Kéthetes",
  month: "Havi",
};

/** yyyy-MM-dd -> helyi éjfél Date (csak naptári aritmetikára). */
export function parseISODate(value: string): Date {
  return parse(value, ISO, new Date(2000, 0, 1));
}

export function toISODate(date: Date): string {
  return format(date, ISO);
}

export function isISODate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && isValid(parseISODate(value)) &&
    toISODate(parseISODate(value)) === value;
}

/** A mai nap Budapesti idő szerint, yyyy-MM-dd formában (szerveren és kliensen is helyes). */
export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function getRange(view: ViewMode, anchorISO: string): { start: string; end: string; days: string[] } {
  const anchor = parseISODate(anchorISO);
  let start: Date;
  let end: Date;
  if (view === "month") {
    start = startOfMonth(anchor);
    end = endOfMonth(anchor);
  } else {
    start = startOfWeek(anchor, { weekStartsOn: 1 });
    end = addDays(start, view === "week" ? 6 : 13);
  }
  const days = eachDayOfInterval({ start, end }).map(toISODate);
  return { start: toISODate(start), end: toISODate(end), days };
}

export function shiftAnchor(view: ViewMode, anchorISO: string, direction: 1 | -1): string {
  const anchor = parseISODate(anchorISO);
  if (view === "month") return toISODate(startOfMonth(addMonths(anchor, direction)));
  return toISODate(addWeeks(anchor, view === "week" ? direction : 2 * direction));
}

export function isWeekendISO(value: string): boolean {
  return isWeekend(parseISODate(value));
}

/** Munkanapok (H–P) egy zárt intervallumban. */
export function workdaysBetween(startISO: string, endISO: string): string[] {
  const start = parseISODate(startISO);
  const end = parseISODate(endISO);
  if (end < start) return [];
  return eachDayOfInterval({ start, end })
    .filter((d) => !isWeekend(d))
    .map(toISODate);
}

export function formatHu(value: string, pattern: string): string {
  return format(parseISODate(value), pattern, { locale: hu });
}

/** Pl. "2026. nov. 16. – nov. 20." */
export function formatRangeHu(startISO: string, endISO: string): string {
  if (startISO === endISO) return formatHu(startISO, "yyyy. MMM d. (EEEE)");
  const sameYear = startISO.slice(0, 4) === endISO.slice(0, 4);
  return `${formatHu(startISO, "yyyy. MMM d.")} – ${formatHu(endISO, sameYear ? "MMM d." : "yyyy. MMM d.")}`;
}

export function rangeTitle(view: ViewMode, start: string, end: string): string {
  if (view === "month") {
    const s = formatHu(start, "yyyy. LLLL");
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return formatRangeHu(start, end);
}

const DAY_ON_HU = ["vasárnap", "hétfőn", "kedden", "szerdán", "csütörtökön", "pénteken", "szombaton"] as const;

/** „csütörtökön” – a nap neve határozóragos alakban. */
export function weekdayOnHu(value: string): string {
  return DAY_ON_HU[parseISODate(value).getDay()]!;
}

/** Hónap napja „-án/-én/-jén” raggal: 1-jén, 2-án, 4-én, 10-én, 20-án … */
export function dayOfMonthOnHu(day: number): string {
  if (day === 10) return "10-én";
  if (day === 20 || day === 30) return `${day}-án`;
  const last = day % 10;
  if (last === 1) return `${day}-jén`;
  return [2, 3, 6, 8].includes(last) ? `${day}-án` : `${day}-én`;
}

/** „nov. 19-én, csütörtökön” vagy csak „csütörtökön”. */
export function dayPhraseHu(value: string, withDate: boolean): string {
  if (!withDate) return weekdayOnHu(value);
  const d = parseISODate(value);
  return `${format(d, "MMM", { locale: hu })} ${dayOfMonthOnHu(d.getDate())}, ${weekdayOnHu(value)}`;
}
