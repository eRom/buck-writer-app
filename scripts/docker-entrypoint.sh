#!/bin/sh
set -e

echo "[entrypoint] running database migrations..."
node /app/dist/db/migrate.js

echo "[entrypoint] running idempotent seed..."
node /app/dist/db/seed.js

echo "[entrypoint] starting app: $*"
exec "$@"
