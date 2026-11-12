#!/usr/bin/env bash
# Creates (or updates) Umami's role and database in the general Postgres.
# Idempotent: safe to run on every `stack.sh up analytics`.
# The password goes to psql on stdin, never on a command line.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
A_ENV="$ROOT/analytics/.env"
P_ENV="$ROOT/postgres/.env"
envval() { grep -E "^$2=" "$1" 2>/dev/null | tail -1 | cut -d= -f2- || true; }
die() { printf '✘ %s\n' "$*" >&2; exit 1; }

[ -f "$A_ENV" ] || die "analytics/.env missing (run: make bootstrap)"
PG_NAME="$(envval "$P_ENV" POSTGRES_CONTAINER_NAME)"; PG_NAME="${PG_NAME:-stack-postgres}"
PG_USER="$(envval "$P_ENV" POSTGRES_USER)"; PG_USER="${PG_USER:-postgres}"
DB_USER="$(envval "$A_ENV" UMAMI_DB_USER)"; DB_USER="${DB_USER:-umami}"
DB_NAME="$(envval "$A_ENV" UMAMI_DB_NAME)"; DB_NAME="${DB_NAME:-umami}"
DB_PASS="$(envval "$A_ENV" UMAMI_DB_PASSWORD)"

[[ "$DB_USER" =~ ^[a-z_][a-z0-9_]*$ ]] || die "UMAMI_DB_USER must be lowercase letters, digits, _"
[[ "$DB_NAME" =~ ^[a-z_][a-z0-9_]*$ ]] || die "UMAMI_DB_NAME must be lowercase letters, digits, _"
[[ "$DB_PASS" =~ ^[A-Za-z0-9]{16,}$ ]] || die "UMAMI_DB_PASSWORD must be 16+ letters/digits (it goes in a URL)"

[ "$(docker inspect -f '{{.State.Running}}' "$PG_NAME" 2>/dev/null || true)" = "true" ] \
  || die "$PG_NAME isn't running. Start it first: make up S=postgres"

for _ in $(seq 1 30); do
  docker exec "$PG_NAME" pg_isready -U "$PG_USER" -q && break
  sleep 1
done

q() { docker exec -i "$PG_NAME" psql -v ON_ERROR_STOP=1 -qtA -U "$PG_USER" -d postgres; }

if [ "$(echo "SELECT 1 FROM pg_roles WHERE rolname = '$DB_USER';" | q)" = "1" ]; then
  echo "ALTER ROLE \"$DB_USER\" WITH LOGIN PASSWORD '$DB_PASS';" | q
else
  echo "CREATE ROLE \"$DB_USER\" WITH LOGIN PASSWORD '$DB_PASS';" | q
fi
if [ "$(echo "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME';" | q)" != "1" ]; then
  echo "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\";" | q
fi
printf '✔ Postgres role and database "%s" ready in %s\n' "$DB_NAME" "$PG_NAME"
