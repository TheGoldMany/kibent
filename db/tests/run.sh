#!/usr/bin/env bash
# Helyi teszt: friss adatbázis + migrációk + RLS tesztek.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
DB=kibent_test
PSQL=(psql -v ON_ERROR_STOP=1 -q -X -t -o /dev/null)
dropdb --if-exists "$DB" >/dev/null 2>&1 || true
createdb "$DB"
for f in "$DIR"/../migrations/*.sql; do
  "${PSQL[@]}" -d "$DB" -f "$f"
done
"${PSQL[@]}" -d "$DB" -f "$DIR/rls_test.sql"
# A 0005 újrafuttatható (a bootstrap ezt feltételezi)
"${PSQL[@]}" -d "$DB" -f "$DIR/../migrations/0005_teams.sql"
"${PSQL[@]}" -d "$DB" -f "$DIR/../migrations/0006_leave_team.sql"
