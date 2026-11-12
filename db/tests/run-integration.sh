#!/usr/bin/env bash
# Integrációs teszt: friss helyi adatbázis (Neon Auth stub + migráció), majd vitest.
# Kell: helyi Postgres, és TCP-n elérhető superuser (alapértelmezés: postgres/kibent-local-test).
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
export PGHOST="${PGHOST:-127.0.0.1}" PGUSER="${PGUSER:-postgres}" PGPASSWORD="${PGPASSWORD:-kibent-local-test}"
DB=kibent_it
dropdb --if-exists "$DB"
createdb "$DB"
psql -v ON_ERROR_STOP=1 -q -X -d "$DB" -f "$DIR/_neon_stub.sql"
for f in "$DIR"/../migrations/*.sql; do psql -v ON_ERROR_STOP=1 -q -X -d "$DB" -f "$f" 2>&1 | grep -v "already been granted" || true; done
cd "$DIR/../.."
TEST_DATABASE_URL="postgresql://$PGUSER:$PGPASSWORD@$PGHOST:5432/$DB" npx vitest run src/integration.test.ts
