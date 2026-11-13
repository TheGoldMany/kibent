import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AUTH_SCHEMA_SQL, AUTH_SCHEMA_VERSION } from "./schema-sql";

describe("auth séma", () => {
  it("a TS modul megegyezik a migrációs fájllal", () => {
    const file = fs.readFileSync(path.resolve(__dirname, "../../../db/migrations/0004_better_auth.sql"), "utf8");
    expect(AUTH_SCHEMA_SQL).toBe(file);
    expect(file).toContain(`comment on schema better_auth is '${AUTH_SCHEMA_VERSION}'`);
  });
});
