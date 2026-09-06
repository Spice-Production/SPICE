#!/bin/sh
# Self-host entrypoint: optionally apply pending drizzle migrations, then boot
# the Next.js standalone server. Migrations run only when
# SPICE_RUN_MIGRATIONS=1 (set by deploy/docker-compose.yml); every other
# use of this image boots straight into server.js as before.
set -e

if [ "$SPICE_RUN_MIGRATIONS" = "1" ]; then
  if [ -z "$DATABASE_URL" ]; then
    echo "docker-entrypoint: SPICE_RUN_MIGRATIONS=1 but DATABASE_URL is not set." >&2
    exit 1
  fi
  node ./scripts/migrate-selfhost.mjs
fi

exec node server.js "$@"
