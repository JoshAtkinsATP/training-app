#!/usr/bin/env bash
# Starts a throwaway local Postgres for RLS tests and prints TEST_DATABASE_URL.
set -euo pipefail
BIN=$(ls -d /usr/lib/postgresql/*/bin | tail -1)
DIR=${PGTEST_DIR:-/tmp/pgtest}
PORT=${PGTEST_PORT:-54329}
if [ ! -d "$DIR" ]; then
  mkdir -p "$DIR" && chown postgres "$DIR"
  su postgres -c "$BIN/initdb -D $DIR -A trust >/dev/null"
fi
su postgres -c "$BIN/pg_ctl -D $DIR -o '-p $PORT -k /tmp' -l $DIR/log -w start >/dev/null" || true
echo "postgres://postgres@localhost:$PORT/postgres"
