import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AUTH_SCHEMA_SQL, AUTH_SCHEMA_VERSION } from "./schema-sql";
import { LEAVE_SCHEMA_SQL, LEAVE_SCHEMA_VERSION } from "./leave-sql";
import { TEAMS_SCHEMA_SQL, TEAMS_SCHEMA_VERSION } from "./teams-sql";

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, "../../../db/migrations", f), "utf8");

describe("automatikus migrációk", () => {
  it("0004: a TS modul megegyezik a migrációs fájllal", () => {
    expect(AUTH_SCHEMA_SQL).toBe(read("0004_better_auth.sql"));
    expect(AUTH_SCHEMA_SQL).toContain(`comment on schema better_auth is '${AUTH_SCHEMA_VERSION}'`);
  });
  it("0005: a TS modul megegyezik a migrációs fájllal", () => {
    expect(TEAMS_SCHEMA_SQL).toBe(read("0005_teams.sql"));
    expect(TEAMS_SCHEMA_SQL).toContain(`comment on table public.memberships is '${TEAMS_SCHEMA_VERSION}'`);
  });
  it("0006: a TS modul megegyezik a migrációs fájllal", () => {
    expect(LEAVE_SCHEMA_SQL).toBe(read("0006_leave_team.sql"));
    expect(LEAVE_SCHEMA_SQL).toContain(`comment on function public.leave_team() is '${LEAVE_SCHEMA_VERSION}'`);
  });
});
