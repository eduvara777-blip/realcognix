#!/bin/sh
# First start only (docker-entrypoint-initdb.d): create the non-owner API role and lock tenant tables down.
# Runs db/migrations/003_app_role.sql as the owner (POSTGRES_USER), then sets realcognix_app's password from APP_DB_PASSWORD.
set -e

if [ -z "${APP_DB_PASSWORD:-}" ]; then
  echo "04-app-role: APP_DB_PASSWORD is not set; refusing to create realcognix_app without a password" >&2
  exit 1
fi

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f /rc-migrations/003_app_role.sql

# psql variables keep the password out of the SQL text and quote it safely.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v app_password="$APP_DB_PASSWORD" <<'SQL'
ALTER ROLE realcognix_app WITH LOGIN PASSWORD :'app_password';
SQL
echo "04-app-role: realcognix_app ready (NOBYPASSRLS, non-owner)"
