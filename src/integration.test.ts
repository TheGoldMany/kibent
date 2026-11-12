/**
 * Integrációs teszt: a VALÓDI server actionök és az iCal route egy helyi
 * Postgresen (db/migrations + Neon Auth stub). A Neon Auth sessiont és a
 * Vercel Blobot helyettesítjük; minden más (SQL, RLS, triggerek) éles kód.
 *
 * Futtatás: bash db/tests/run-integration.sh
 * (Neon-szerű jogosultságokkal: TEST_DATABASE_URL = korlátozott tulajdonos,
 *  TEST_SETUP_DATABASE_URL = superuser a neon_auth tesztadatokhoz.)
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";

const DB = process.env.TEST_DATABASE_URL;
const run = DB ? describe : describe.skip;

// ---- helyettesítések -------------------------------------------------------
const session = { userId: null as string | null, verified: true };
// A session email címe egyezik a neon_auth."user" címmel (mint élesben)
const SESSION_EMAILS: Record<string, string> = {
  "00000000-0000-0000-0000-0000000000a1": "anna@acme.hu",
  "00000000-0000-0000-0000-0000000000b1": "bela@acme.hu",
  "00000000-0000-0000-0000-0000000000d1": "dani@acme.hu",
};
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`REDIRECT:${url}`), { digest: `NEXT_REDIRECT;${url}` });
  },
}));
vi.mock("@/lib/auth/server", () => ({
  getAuth: () => ({
    getSession: async () => ({
      data: session.userId
        ? {
            user: {
              id: session.userId,
              email: SESSION_EMAILS[session.userId] ?? `${session.userId.slice(-2)}@test.hu`,
              name: "Teszt Elek",
              emailVerified: session.verified,
            },
          }
        : null,
    }),
    updateUser: async () => ({}),
  }),
}));
const blobs = new Map<string, File>();
vi.mock("@/lib/blob", () => ({
  uploadPrivate: async (p: string, f: File) => void blobs.set(p, f),
  deletePrivate: async (ps: string[]) => ps.forEach((p) => blobs.delete(p)),
  signedReadUrl: async (p: string, ttl: number) => `https://blob.test/${p}?ttl=${ttl}`,
}));
// React cache() kérésenként memoizál – tesztben minden hívás friss legyen.
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));

const ANNA = "00000000-0000-0000-0000-0000000000a1"; // admin
const BELA = "00000000-0000-0000-0000-0000000000b1"; // member
const DANI = "00000000-0000-0000-0000-0000000000d1"; // member
const as = (id: string) => (session.userId = id);
const fd = (o: Record<string, string | File>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
};

async function expectRedirect(p: Promise<unknown>, to: string) {
  await expect(p).rejects.toThrow(`REDIRECT:${to}`);
}

run("integráció (helyi Postgres)", () => {
  let pool: Pool;

  beforeAll(async () => {
    process.env.DATABASE_URL = DB;
    process.env.NEXT_PUBLIC_SITE_URL = "https://kibent.test";
    // A tesztadatok beszúrásához (neon_auth."user") külön, magasabb jogú kapcsolat is megadható.
    pool = new Pool({ connectionString: process.env.TEST_SETUP_DATABASE_URL ?? DB });
    await pool.query(
      `insert into neon_auth."user" (id, email, name) values
        ($1, 'anna@acme.hu', 'Kovács Anna'), ($2, 'bela@acme.hu', 'Nagy Béla'), ($3, 'dani@acme.hu', 'Tóth Dani')`,
      [ANNA, BELA, DANI],
    );
  });

  it("profil trigger nélkül: az első belépés létrehozza (ensure_profile)", async () => {
    const ERIK = "00000000-0000-0000-0000-0000000000e1";
    const hasTrigger = (await pool.query("select 1 from pg_trigger where tgname = 'on_auth_user_created'")).rowCount;
    if (hasTrigger) await pool.query('alter table neon_auth."user" disable trigger on_auth_user_created');
    await pool.query(`insert into neon_auth."user" (id, email, name) values ($1, 'e1@test.hu', 'Erik')`, [ERIK]);
    if (hasTrigger) await pool.query('alter table neon_auth."user" enable trigger on_auth_user_created');
    expect((await pool.query("select 1 from profiles where id = $1", [ERIK])).rowCount).toBe(0);

    const { getSessionContext } = await import("@/lib/auth");
    as(ERIK);
    const ctx = await getSessionContext();
    expect(ctx?.profile).toMatchObject({ id: ERIK, full_name: "Teszt Elek", role: "member", company_id: null });
    expect(ctx?.company).toBeNull();
  });

  it("onboarding: cég létrehozása és meghívás email címre", async () => {
    const { createCompanyAction } = await import("@/app/(auth)/actions");
    const { sendInvitationsAction } = await import("@/app/(dashboard)/settings/actions");
    const { getSessionContext } = await import("@/lib/auth");
    const { getInvitePreview } = await import("@/lib/invitations");
    const InvitePage = (await import("@/app/invite/[token]/page")).default;

    as(ANNA);
    await expectRedirect(createCompanyAction(null, fd({ name: "Acme Kft." })), "/");

    expect(await sendInvitationsAction(null, fd({ emails: "bela@acme.hu, nem-email" }))).toMatchObject({
      error: expect.stringContaining("Érvénytelen email cím"),
    });
    const sent = await sendInvitationsAction(null, fd({ emails: "Bela@Acme.hu,\ndani@acme.hu" }));
    // Emailküldés nincs beállítva a tesztben -> a link kimásolható
    expect(sent?.results?.map((r) => [r.email, r.status])).toEqual([
      ["bela@acme.hu", "link"],
      ["dani@acme.hu", "link"],
    ]);
    const belaToken = sent!.results![0]!.url!.split("/invite/")[1]!;

    // Újraküldés ugyanarra a címre nem duplikál
    await sendInvitationsAction(null, fd({ emails: "bela@acme.hu" }));
    expect((await pool.query("select count(*)::int as n from company_invitations where email = 'bela@acme.hu'")).rows[0].n).toBe(1);

    // Bejelentkezés előtt: a belépő oldal a token alapján kitölti az email címet
    // (hasAccount attól függ, belépett-e már valaha – trigger nélküli Neonon csak az első belépés után van profil)
    expect(await getInvitePreview(belaToken)).toMatchObject({ email: "bela@acme.hu", companyName: "Acme Kft.", expired: false });
    session.userId = null;
    await expectRedirect(InvitePage({ params: Promise.resolve({ token: belaToken }) }), `/login?next=%2Finvite%2F${belaToken}`);

    // Más fiókkal megnyitva elutasítja (Dani még nincs megerősítve -> nincs automatikus csatlakozás)
    as(DANI);
    session.verified = false;
    const wrong = JSON.stringify(await InvitePage({ params: Promise.resolve({ token: belaToken }) }));
    expect(wrong).toContain("bela@acme.hu címre szól");

    // A jó fiókkal csatlakozik
    as(BELA);
    session.verified = true;
    await expectRedirect(InvitePage({ params: Promise.resolve({ token: belaToken }) }), "/?welcome=1");
    expect((await getSessionContext())?.profile.role).toBe("member");

    // Dani: megerősített email -> belépéskor automatikusan a csapatban van
    as(DANI);
    const dani = await getSessionContext();
    expect(dani?.company?.name).toBe("Acme Kft.");

    // Member nem hívhat meg
    as(BELA);
    await expectRedirect(sendInvitationsAction(null, fd({ emails: "x@pelda.hu" })), "/");
  });

  it("munkaidő és ebédszünet", async () => {
    const { saveWorkHoursAction, updateLunchMinutesAction } = await import("@/app/(dashboard)/settings/actions");
    as(BELA);
    await expectRedirect(updateLunchMinutesAction(null, fd({ minutes: "45" })), "/");
    as(ANNA);
    expect(await updateLunchMinutesAction(null, fd({ minutes: "37" }))).toMatchObject({ error: expect.any(String) });
    expect(await updateLunchMinutesAction(null, fd({ minutes: "45" }))).toEqual({ success: "Ebédszünet hossza elmentve." });

    as(BELA);
    const week = (lunch: string) =>
      fd({
        d1_enabled: "on", d1_start: "09:00", d1_end: "17:00", d1_lunch: lunch,
        d3_enabled: "on", d3_start: "08:30", d3_end: "16:30", d3_lunch: "",
      });
    expect(await saveWorkHoursAction(null, week("16:30"))).toMatchObject({ error: expect.stringContaining("45 perc") });
    expect(await saveWorkHoursAction(null, week("12:00"))).toEqual({ success: "Munkaidő elmentve." });
    const { rows } = await pool.query(
      "select weekday, start_time::text as s, end_time::text as e, lunch_start::text as l from work_hours where user_id = $1 order by weekday",
      [BELA],
    );
    expect(rows).toEqual([
      { weekday: 1, s: "09:00:00", e: "17:00:00", l: "12:00:00" },
      { weekday: 3, s: "08:30:00", e: "16:30:00", l: null },
    ]);
    // Újramentés felülírja (nincs duplikáció)
    expect(await saveWorkHoursAction(null, fd({ d2_enabled: "on", d2_start: "10:00", d2_end: "18:00", d2_lunch: "13:00" }))).toEqual({
      success: "Munkaidő elmentve.",
    });
    expect((await pool.query("select count(*)::int as n from work_hours where user_id = $1", [BELA])).rows[0].n).toBe(1);
  });

  it("heti rutin és gyors váltás (iroda <-> HO, visszaállítás)", async () => {
    const { saveRecurringPatternAction, setDayStatusAction } = await import("@/app/(dashboard)/actions");
    as(BELA);
    expect(
      await saveRecurringPatternAction(null, fd({ mon: "office", tue: "remote", wed: "", thu: "office", fri: "remote" })),
    ).toEqual({ success: "Heti rutin elmentve." });
    // újramentés = upsert
    expect(await saveRecurringPatternAction(null, fd({ mon: "office", tue: "office" }))).toEqual({
      success: "Heti rutin elmentve.",
    });
    expect(await setDayStatusAction("2026-11-16", "remote")).toEqual({ ok: true });
    expect(await setDayStatusAction("2026-11-16", "office")).toEqual({ ok: true });
    const { rows } = await pool.query("select date, status from schedules where user_id = $1", [BELA]);
    expect(rows).toEqual([{ date: expect.anything(), status: "office" }]);
    expect(await setDayStatusAction("2026-11-16", null)).toEqual({ ok: true });
    expect((await pool.query("select 1 from schedules where user_id = $1", [BELA])).rowCount).toBe(0);
    expect(await setDayStatusAction("2026-02-30", "office")).toMatchObject({ ok: false });
  });

  it("szabadságkérelem: függő, ütközés, admin elbírálás, gyors váltás tiltva", async () => {
    const { createLeaveRequestAction, reviewRequestAction } = await import("@/app/(dashboard)/requests/actions");
    const { setDayStatusAction } = await import("@/app/(dashboard)/actions");
    as(BELA);
    const res = await createLeaveRequestAction(
      null,
      fd({ type: "vacation", startDate: "2026-12-18", endDate: "2026-12-22", note: "Karácsony" }),
    );
    expect(res).toMatchObject({ success: expect.stringContaining("3 munkanap") });
    const { rows } = await pool.query(
      "select date::text, approval_status, request_group_id from schedules where user_id = $1 order by date",
      [BELA],
    );
    expect(rows.map((r) => r.date)).toEqual(["2026-12-18", "2026-12-21", "2026-12-22"]); // hétvége kihagyva
    expect(new Set(rows.map((r) => r.approval_status))).toEqual(new Set(["pending"]));
    const groupId = rows[0].request_group_id as string;

    expect(
      await createLeaveRequestAction(null, fd({ type: "vacation", startDate: "2026-12-22", endDate: "2026-12-23" })),
    ).toMatchObject({ error: expect.stringContaining("ütközik") });
    expect(await setDayStatusAction("2026-12-21", "office")).toMatchObject({ ok: false });

    // member nem bírálhat el
    await expectRedirect(reviewRequestAction(groupId, "approved"), "/");

    as(ANNA);
    expect(await reviewRequestAction(groupId, "approved")).toEqual({ ok: true });
    expect(await reviewRequestAction(groupId, "approved")).toMatchObject({ ok: false });
    const after = await pool.query("select distinct approval_status, reviewed_by from schedules where request_group_id = $1", [
      groupId,
    ]);
    expect(after.rows).toEqual([{ approval_status: "approved", reviewed_by: ANNA }]);
  });

  it("betegszabadság + orvosi igazolás: csak a feltöltő és az admin látja", async () => {
    const { createLeaveRequestAction, getMedicalDocUrlAction, cancelRequestAction } = await import(
      "@/app/(dashboard)/requests/actions"
    );
    as(BELA);
    const pdf = new File([new Uint8Array([37, 80, 68, 70])], "Orvosi igazolás.pdf", { type: "application/pdf" });
    const res = await createLeaveRequestAction(
      null,
      fd({ type: "sick", startDate: "2026-11-23", endDate: "2026-11-24", file: pdf }),
    );
    expect(res).toMatchObject({ success: expect.stringContaining("Betegszabadság rögzítve") });
    const doc = (await pool.query("select id, storage_path, request_group_id from medical_documents")).rows[0];
    expect(doc.storage_path).toMatch(new RegExp(`^[0-9a-f-]{36}/${BELA}/${doc.request_group_id}/[0-9a-f-]{36}-Orvosi_igazolas\\.pdf$`));
    expect(blobs.has(doc.storage_path)).toBe(true);

    expect(await getMedicalDocUrlAction(doc.id)).toMatchObject({ ok: true, url: expect.stringContaining("ttl=60") });
    as(DANI);
    expect(await getMedicalDocUrlAction(doc.id)).toMatchObject({ ok: false });
    as(ANNA);
    expect(await getMedicalDocUrlAction(doc.id)).toMatchObject({ ok: true });

    // rossz fájltípus
    as(BELA);
    const exe = new File(["x"], "virus.exe", { type: "application/x-msdownload" });
    expect(
      await createLeaveRequestAction(null, fd({ type: "sick", startDate: "2026-11-25", endDate: "2026-11-25", file: exe })),
    ).toMatchObject({ error: expect.stringContaining("PDF, JPG vagy PNG") });

    // visszavonás törli a fájlt is
    expect(await cancelRequestAction(doc.request_group_id)).toEqual({ ok: true });
    expect(blobs.has(doc.storage_path)).toBe(false);
    expect((await pool.query("select 1 from medical_documents")).rowCount).toBe(0);
  });

  it("oldalak adatbetöltése (naptár, kérelmek, beállítások) RLS alatt", async () => {
    const DashboardPage = (await import("@/app/(dashboard)/page")).default;
    const RequestsPage = (await import("@/app/(dashboard)/requests/page")).default;
    const SettingsPage = (await import("@/app/(dashboard)/settings/page")).default;
    as(DANI);
    await expect(DashboardPage({ searchParams: Promise.resolve({ view: "month", date: "2026-12-01" }) })).resolves.toBeTruthy();
    await expect(RequestsPage()).resolves.toBeTruthy();
    await expect(SettingsPage()).resolves.toBeTruthy();
    as(ANNA);
    await expect(RequestsPage()).resolves.toBeTruthy();
    const companyId = (await pool.query("select id from companies")).rows[0].id;
    const { getSessionContext } = await import("@/lib/auth");
    expect((await getSessionContext())?.pendingCount).toBe(0);
    void companyId;
  });

  it("beállítások: szerepkör, utolsó admin védelme, tag eltávolítása", async () => {
    const { setMemberRoleAction, removeMemberAction, updateCompanyNameAction } = await import(
      "@/app/(dashboard)/settings/actions"
    );
    as(ANNA);
    expect(await setMemberRoleAction(ANNA, "member")).toMatchObject({ ok: false, error: expect.stringContaining("legalább egy") });
    expect(await updateCompanyNameAction(null, fd({ name: "Acme Zrt." }))).toEqual({ success: "Cégnév elmentve." });
    expect(await setMemberRoleAction(DANI, "admin")).toEqual({ ok: true });
    as(BELA);
    await expectRedirect(removeMemberAction(DANI), "/");
    as(DANI);
    expect(await removeMemberAction(BELA)).toEqual({ ok: true });
    expect((await pool.query("select company_id from profiles where id = $1", [BELA])).rows[0].company_id).toBeNull();
  });

  it("iCal feed: token alapján, csapat opcióval, ismeretlen tokenre 404", async () => {
    const { GET } = await import("@/app/api/ical/[token]/calendar.ics/route");
    const { NextRequest } = await import("next/server");
    const { rows } = await pool.query("select ical_token from profiles where id = $1", [ANNA]);
    await pool.query(
      `insert into schedules (company_id, user_id, date, status)
       select company_id, id, current_date, 'office' from profiles where id = $1`,
      [DANI],
    );
    const call = (token: string, q = "") =>
      GET(new NextRequest(`https://kibent.test/api/ical/${token}/calendar.ics${q}`), {
        params: Promise.resolve({ token }),
      });

    const own = await call(rows[0].ical_token);
    expect(own.status).toBe(200);
    expect(own.headers.get("content-type")).toContain("text/calendar");
    const ownBody = await own.text();
    expect(ownBody).toContain("X-WR-CALNAME:Kibent – Acme Zrt.");
    expect(ownBody).not.toMatch(/SUMMARY:\[Kibent\] .+ – Iroda/);

    const team = await (await call(rows[0].ical_token, "?team=1")).text();
    // A név a profilból jön (triggeres környezetben „Tóth Dani”, trigger nélkül a session neve).
    expect(team).toMatch(/SUMMARY:\[Kibent\] .+ – Iroda/);

    expect((await call("00000000-0000-0000-0000-000000000000")).status).toBe(404);
    expect((await call("nem-uuid")).status).toBe(404);
  });
});
