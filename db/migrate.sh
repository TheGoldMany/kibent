#!/usr/bin/env bash
# Migrációk futtatása a Neon adatbázison (kibent-oltp).
# A DATABASE_URL-t a Neon konzolból másold (a tulajdonos szerepkörrel, pl. neondb_owner).
# Előfeltétel: a Neon Auth legyen bekapcsolva, mert a séma a neon_auth."user" táblára hivatkozik.
set -euo pipefail
: "${DATABASE_URL:?Állítsd be a DATABASE_URL-t (lásd .env.example)}"
DIR="$(cd "$(dirname "$0")" && pwd)"
for f in "$DIR"/migrations/*.sql; do
  echo "→ $(basename "$f")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -X -1 -f "$f"
done
echo "Kész."
