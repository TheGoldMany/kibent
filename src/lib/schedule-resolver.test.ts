import { describe, expect, it } from "vitest";
import { buildMatrix, countOffice, nextToggleStatus, resolveDay } from "./schedule-resolver";
import { getRange, shiftAnchor, todayISO, workdaysBetween, isISODate } from "./dates";

const pattern = { mon: "office", tue: "remote", wed: null, thu: "office", fri: "remote" } as const;

describe("resolveDay", () => {
  it("explicit bejegyzés felülírja a heti rutint", () => {
    const r = resolveDay(
      "2026-11-16",
      { user_id: "u", date: "2026-11-16", status: "remote", approval_status: "approved", request_group_id: null, note: null },
      pattern,
    );
    expect(r).toMatchObject({ status: "remote", source: "explicit", display: "remote" });
  });

  it("elutasított bejegyzésnél visszaesik a rutinra", () => {
    const r = resolveDay(
      "2026-11-16",
      { user_id: "u", date: "2026-11-16", status: "vacation", approval_status: "rejected", request_group_id: "g", note: null },
      pattern,
    );
    expect(r).toMatchObject({ status: "office", source: "pattern" });
  });

  it("függő szabadság külön megjelenítést kap", () => {
    const r = resolveDay(
      "2026-11-17",
      { user_id: "u", date: "2026-11-17", status: "vacation", approval_status: "pending", request_group_id: "g", note: null },
      pattern,
    );
    expect(r.display).toBe("vacation_pending");
  });

  it("rutin a hét napjai szerint (2026-11-16 hétfő)", () => {
    expect(resolveDay("2026-11-16", null, pattern).status).toBe("office");
    expect(resolveDay("2026-11-17", null, pattern).status).toBe("remote");
    expect(resolveDay("2026-11-18", null, pattern)).toMatchObject({ status: null, display: "none" });
  });

  it("hétvégén nincs rutin", () => {
    expect(resolveDay("2026-11-21", null, pattern).source).toBe("none");
    expect(resolveDay("2026-11-22", null, pattern).source).toBe("none");
  });

  it("rutin nélkül üres", () => {
    expect(resolveDay("2026-11-16", null, null).display).toBe("none");
  });
});

describe("buildMatrix / countOffice", () => {
  it("összeszámolja az irodában lévőket", () => {
    const m = buildMatrix(
      ["a", "b", "c"],
      ["2026-11-16"],
      [{ user_id: "b", date: "2026-11-16", status: "sick", approval_status: "approved", request_group_id: "g", note: null }],
      [
        { user_id: "a", ...pattern },
        { user_id: "b", ...pattern },
        { user_id: "c", mon: "remote", tue: null, wed: null, thu: null, fri: null },
      ],
    );
    expect(countOffice(m, "2026-11-16")).toBe(1);
  });
});

describe("nextToggleStatus", () => {
  it("iroda <-> home office, üresből iroda, szabadságnál nincs váltás", () => {
    expect(nextToggleStatus(resolveDay("2026-11-16", null, pattern))).toBe("remote");
    expect(nextToggleStatus(resolveDay("2026-11-17", null, pattern))).toBe("office");
    expect(nextToggleStatus(resolveDay("2026-11-18", null, pattern))).toBe("office");
    expect(
      nextToggleStatus(
        resolveDay(
          "2026-11-16",
          { user_id: "u", date: "2026-11-16", status: "sick", approval_status: "approved", request_group_id: null, note: null },
          pattern,
        ),
      ),
    ).toBeNull();
  });
});

describe("dátum segédek", () => {
  it("heti nézet hétfőtől vasárnapig", () => {
    const r = getRange("week", "2026-11-19");
    expect(r.start).toBe("2026-11-16");
    expect(r.end).toBe("2026-11-22");
    expect(r.days).toHaveLength(7);
  });
  it("kéthetes és havi nézet", () => {
    expect(getRange("2week", "2026-11-19").days).toHaveLength(14);
    const m = getRange("month", "2026-02-10");
    expect(m.start).toBe("2026-02-01");
    expect(m.end).toBe("2026-02-28");
  });
  it("lapozás", () => {
    expect(shiftAnchor("week", "2026-11-19", 1)).toBe("2026-11-26");
    expect(shiftAnchor("2week", "2026-11-19", -1)).toBe("2026-11-05");
    expect(shiftAnchor("month", "2026-01-31", 1)).toBe("2026-02-01");
  });
  it("munkanapok hétvégék nélkül", () => {
    expect(workdaysBetween("2026-11-20", "2026-11-24")).toEqual(["2026-11-20", "2026-11-23", "2026-11-24"]);
    expect(workdaysBetween("2026-11-24", "2026-11-20")).toEqual([]);
  });
  it("budapesti mai nap", () => {
    expect(todayISO(new Date("2026-11-12T23:30:00Z"))).toBe("2026-11-13");
  });
  it("ISO validáció", () => {
    expect(isISODate("2026-02-30")).toBe(false);
    expect(isISODate("2026-02-28")).toBe(true);
    expect(isISODate("x")).toBe(false);
  });
});

import { leaveRequestSchema, safeFileName } from "./validations";

describe("validációk", () => {
  it("szabadságkérelem: hétvégi időszak elutasítva", () => {
    const r = leaveRequestSchema.safeParse({ type: "vacation", startDate: "2026-11-21", endDate: "2026-11-22" });
    expect(r.success).toBe(false);
  });
  it("szabadságkérelem: fordított dátum elutasítva", () => {
    const r = leaveRequestSchema.safeParse({ type: "vacation", startDate: "2026-11-24", endDate: "2026-11-20" });
    expect(r.success).toBe(false);
  });
  it("szabadságkérelem: üres megjegyzés -> null", () => {
    const r = leaveRequestSchema.safeParse({ type: "sick", startDate: "2026-11-20", endDate: "2026-11-24", note: "" });
    expect(r.success && r.data.note).toBe(null);
  });
  it("fájlnév tisztítás", () => {
    expect(safeFileName("Orvosi igazolás – Kovács.pdf")).toBe("Orvosi_igazolas_Kovacs.pdf");
  });
});

import { groupRequests } from "./requests";

describe("groupRequests", () => {
  it("napokat kérelemmé fog össze, függő állapot elsőbbséget kap", () => {
    const base = { user_id: "u", note: null, created_at: "x", reviewed_by: null } as const;
    const groups = groupRequests([
      { ...base, date: "2026-11-18", status: "vacation", approval_status: "approved", request_group_id: "g1" },
      { ...base, date: "2026-11-16", status: "vacation", approval_status: "pending", request_group_id: "g1" },
      { ...base, date: "2026-11-23", status: "sick", approval_status: "approved", request_group_id: "g2" },
      { ...base, date: "2026-11-24", status: "office", approval_status: "approved", request_group_id: null },
    ]);
    expect(groups).toHaveLength(2);
    const g1 = groups.find((g) => g.groupId === "g1")!;
    expect(g1).toMatchObject({ startDate: "2026-11-16", endDate: "2026-11-18", dayCount: 2, approval: "pending" });
  });
});

import { buildFeed, feedRange, mergeConsecutive } from "./ical";

describe("iCal feed", () => {
  it("időszak: előző hónap elejétől +3. hónap végéig", () => {
    const r = feedRange("2026-11-12");
    expect(r.start).toBe("2026-10-01");
    expect(r.end).toBe("2027-02-28");
  });

  it("egymást követő azonos napokat összefűz", () => {
    const ev = mergeConsecutive([
      { date: "2026-11-17", key: "own", title: "A" },
      { date: "2026-11-16", key: "own", title: "A" },
      { date: "2026-11-18", key: "own", title: "B" },
      { date: "2026-11-20", key: "own", title: "B" },
    ]);
    expect(ev.map((e) => [e.title, e.start, e.end])).toEqual([
      ["A", "2026-11-16", "2026-11-17"],
      ["B", "2026-11-18", "2026-11-18"],
      ["B", "2026-11-20", "2026-11-20"],
    ]);
  });

  it("saját beosztás + csapat irodai napjai, elutasított nélkül", () => {
    const ics = buildFeed({
      calendarName: "Kibent – Teszt",
      ownerId: "me",
      members: [
        { id: "me", full_name: "Én" },
        { id: "bob", full_name: "Nagy Bob" },
      ],
      includeTeam: true,
      days: ["2026-11-16", "2026-11-17", "2026-11-18"],
      schedules: [
        { user_id: "me", date: "2026-11-17", status: "vacation", approval_status: "approved", request_group_id: "g", note: null },
        { user_id: "me", date: "2026-11-18", status: "vacation", approval_status: "rejected", request_group_id: "g2", note: null },
      ],
      patterns: [
        { user_id: "me", mon: "office", tue: "office", wed: "remote", thu: null, fri: null },
        { user_id: "bob", mon: "office", tue: "remote", wed: null, thu: null, fri: null },
      ],
      siteUrl: "https://kibent.example",
    });
    expect(ics).toContain("SUMMARY:[Kibent] Iroda");
    expect(ics).toContain("SUMMARY:[Kibent] Szabadság");
    expect(ics).toContain("SUMMARY:[Kibent] Home Office"); // elutasított -> rutin
    expect(ics).toContain("Nagy Bob – Iroda");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261117");
    expect(ics).toContain("DTEND;VALUE=DATE:20261118");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(4);
  });
});
