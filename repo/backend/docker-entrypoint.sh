#!/bin/sh
set -eu

attempt=1
max_attempts=30

until npx prisma db push --skip-generate; do
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "Prisma schema sync failed after ${max_attempts} attempts." >&2
    exit 1
  fi

  echo "Waiting for database schema sync (${attempt}/${max_attempts})..."
  attempt=$((attempt + 1))
  sleep 2
done

exec node dist/index.js
