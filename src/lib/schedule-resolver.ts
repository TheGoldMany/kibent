import { getDay } from "date-fns";
import { parseISODate } from "@/lib/dates";
import type { DisplayStatus } from "@/lib/status";
import type {
  ApprovalStatus,
  RecurringPattern,
  Schedule,
  ScheduleStatus,
  WorkStatus,
} from "@/lib/database.types";

export type PatternDays = Pick<RecurringPattern, "mon" | "tue" | "wed" | "thu" | "fri">;
export type ScheduleLike = Pick<
  Schedule,
  "user_id" | "date" | "status" | "approval_status" | "request_group_id" | "note"
>;

export type ResolvedDay = {
  date: string;
  /** A tényleges státusz (null = nincs megadva). */
  status: ScheduleStatus | null;
  approval: ApprovalStatus | null;
  source: "explicit" | "pattern" | "none";
  requestGroupId: string | null;
  note: string | null;
  display: DisplayStatus;
};

const WEEKDAY_KEYS: Record<number, keyof PatternDays | undefined> = {
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
  5: "fri",
};

export function patternStatusFor(dateISO: string, pattern: PatternDays | null | undefined): WorkStatus | null {
  if (!pattern) return null;
  const key = WEEKDAY_KEYS[getDay(parseISODate(dateISO))];
  return key ? (pattern[key] ?? null) : null;
}

export function toDisplay(status: ScheduleStatus | null, approval: ApprovalStatus | null): DisplayStatus {
  if (!status) return "none";
  if (status === "vacation" && approval === "pending") return "vacation_pending";
  return status;
}

/**
 * Feloldási sorrend:
 *  1. Explicit schedules bejegyzés az adott napra (ha nem elutasított).
 *  2. Munkanapon (H–P) a recurring_patterns beállítás.
 *  3. Egyébként „Nincs megadva”.
 */
export function resolveDay(
  dateISO: string,
  explicit: ScheduleLike | null | undefined,
  pattern: PatternDays | null | undefined,
): ResolvedDay {
  if (explicit && explicit.approval_status !== "rejected") {
    return {
      date: dateISO,
      status: explicit.status,
      approval: explicit.approval_status,
      source: "explicit",
      requestGroupId: explicit.request_group_id,
      note: explicit.note,
      display: toDisplay(explicit.status, explicit.approval_status),
    };
  }
  const fromPattern = patternStatusFor(dateISO, pattern);
  if (fromPattern) {
    return {
      date: dateISO,
      status: fromPattern,
      approval: "approved",
      source: "pattern",
      requestGroupId: null,
      note: null,
      display: fromPattern,
    };
  }
  return {
    date: dateISO,
    status: null,
    approval: null,
    source: "none",
    requestGroupId: null,
    note: null,
    display: "none",
  };
}

export type ResolvedMatrix = Map<string, Map<string, ResolvedDay>>; // userId -> date -> day

export function buildMatrix(
  userIds: string[],
  days: string[],
  schedules: ScheduleLike[],
  patterns: (PatternDays & { user_id: string })[],
): ResolvedMatrix {
  const explicitIndex = new Map<string, ScheduleLike>();
  for (const s of schedules) explicitIndex.set(`${s.user_id}|${s.date}`, s);
  const patternIndex = new Map(patterns.map((p) => [p.user_id, p]));

  const matrix: ResolvedMatrix = new Map();
  for (const userId of userIds) {
    const row = new Map<string, ResolvedDay>();
    for (const day of days) {
      row.set(day, resolveDay(day, explicitIndex.get(`${userId}|${day}`), patternIndex.get(userId)));
    }
    matrix.set(userId, row);
  }
  return matrix;
}

/** Hányan lesznek az irodában az adott napon. */
export function countOffice(matrix: ResolvedMatrix, day: string): number {
  let n = 0;
  for (const row of matrix.values()) if (row.get(day)?.status === "office") n++;
  return n;
}

/** Gyors váltás következő állapota a saját cellán. Szabadság/betegség esetén nincs váltás. */
export function nextToggleStatus(current: ResolvedDay): WorkStatus | null {
  if (current.status === "vacation" || current.status === "sick") return null;
  return current.status === "office" ? "remote" : "office";
}

/**
 * Csapatnap-tipp: az a munkanap, amikor a legtöbben lesztek bent.
 * `fromISO` esetén csak az aznapi és későbbi napokat nézi (ha van ilyen a tartományban).
 * Döntetlennél a korábbi nap nyer; ha senki sincs bent, null.
 */
export function bestOfficeDay(
  matrix: ResolvedMatrix,
  days: string[],
  fromISO?: string,
): { day: string; count: number } | null {
  const weekdays = days.filter((d) => {
    const dow = getDay(parseISODate(d));
    return dow >= 1 && dow <= 5;
  });
  const upcoming = fromISO ? weekdays.filter((d) => d >= fromISO) : weekdays;
  const pool = upcoming.length > 0 ? upcoming : weekdays;
  let best: { day: string; count: number } | null = null;
  for (const day of pool) {
    const count = countOffice(matrix, day);
    if (count > 0 && (!best || count > best.count)) best = { day, count };
  }
  return best;
}
