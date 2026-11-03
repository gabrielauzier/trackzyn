#!/usr/bin/env bash
# Applies the Alembic migrations to one empty database and the Drizzle migrations to another,
# dumps both with pg_dump --schema-only and fails when the dumps differ.
#
#   scripts/schema-diff.sh              compare; exit 1 and print the diff when they differ
#   scripts/schema-diff.sh --self-test  compare, then change one column in the Drizzle database
#                                       and require the comparison to fail
#
# Environment (defaults suit the CI job, where PG* variables point at the service container):
#   SCHEMA_DIFF_URL_BASE  postgresql://user:password@host:port, as the migration tools reach it
#   PSQL_CMD              psql command that connects to the maintenance database ("psql -d postgres")
#   PG_DUMP_CMD           pg_dump command, called with "-d <database>" appended ("pg_dump")
#   PYTHON_BIN            Python with the backend dependencies ("python")
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../.." && pwd)"

url_base="${SCHEMA_DIFF_URL_BASE:?set SCHEMA_DIFF_URL_BASE, e.g. postgresql://user:pass@127.0.0.1:5432}"
psql_cmd="${PSQL_CMD:-psql -d postgres}"
pg_dump_cmd="${PG_DUMP_CMD:-pg_dump}"
python_bin="${PYTHON_BIN:-python}"

alembic_db="schema_diff_alembic"
drizzle_db="schema_diff_drizzle"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

sql() { $psql_cmd -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }

recreate() {
  sql "DROP DATABASE IF EXISTS $1 WITH (FORCE)"
  sql "CREATE DATABASE $1"
}

# pg_dump >= 16.10 writes a random \restrict token; alembic_version and the drizzle schema are
# each tool's own bookkeeping and are left out.
dump() {
  $pg_dump_cmd --schema-only --no-owner --no-privileges -T 'public.alembic_version' -N drizzle -d "$1" \
    | grep -v -e '^\\restrict' -e '^\\unrestrict'
}

echo "== applying the Alembic migrations to $alembic_db"
recreate "$alembic_db"
(cd "$repo/backend" && DATABASE_URL="${url_base/postgresql:\/\//postgresql+asyncpg://}/$alembic_db" \
  SECRET_KEY=schema-diff "$python_bin" -m alembic upgrade head)

echo "== applying the Drizzle migrations to $drizzle_db"
recreate "$drizzle_db"
(cd "$repo/backend-node" && DATABASE_URL="$url_base/$drizzle_db" npm run --silent migrate)

dump "$alembic_db" > "$work/alembic.sql"
dump "$drizzle_db" > "$work/drizzle.sql"

if [ ! -s "$work/alembic.sql" ] || ! grep -q 'CREATE TABLE public.users' "$work/alembic.sql"; then
  echo "the Alembic dump looks empty; refusing to call that a match" >&2
  exit 2
fi

compare() {
  diff -u --label alembic --label drizzle "$work/alembic.sql" "$work/drizzle.sql"
}

if ! compare; then
  echo "schema-diff: the Alembic and Drizzle schemas differ" >&2
  exit 1
fi
echo "schema-diff: identical ($(grep -c . "$work/alembic.sql") lines)"

if [ "${1:-}" = "--self-test" ]; then
  echo "== self-test: change a column in $drizzle_db and require the comparison to fail"
  # A later -d overrides the maintenance database in PSQL_CMD.
  $psql_cmd -v ON_ERROR_STOP=1 -q -d "$drizzle_db" -c "ALTER TABLE users ADD COLUMN extra integer" >/dev/null
  dump "$drizzle_db" > "$work/drizzle.sql"
  if compare >/dev/null; then
    echo "schema-diff self-test: a changed column was NOT detected" >&2
    exit 1
  fi
  echo "schema-diff self-test: the changed column was detected"
fi
