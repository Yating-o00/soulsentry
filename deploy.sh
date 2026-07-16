#!/usr/bin/env bash

set -Eeuo pipefail

APP_ROOT="${APP_ROOT:-/opt/soulsentry}"
RELEASES_DIR="${RELEASES_DIR:-$APP_ROOT/releases}"
CURRENT_LINK="${CURRENT_LINK:-$APP_ROOT/current}"
SHARED_DIR="${SHARED_DIR:-$APP_ROOT/shared}"
SHARED_ENV="${SHARED_ENV:-$SHARED_DIR/backend.env}"
WEB_ROOT="${WEB_ROOT:-/var/www/html}"
SERVICE_NAME="${SERVICE_NAME:-soulsentry-backend}"
BACKEND_DIRNAME="${BACKEND_DIRNAME:-backend}"
BACKEND_PORT="${BACKEND_PORT:-3000}"
HEALTH_PATH="${HEALTH_PATH:-/api/health}"
PUBLIC_HEALTH_URL="${PUBLIC_HEALTH_URL:-https://xinzhan-soulsentry.cn/api/health}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
ALLOW_DESTRUCTIVE_SCHEMA="${ALLOW_DESTRUCTIVE_SCHEMA:-0}"
SKIP_FRONTEND_BUILD="${SKIP_FRONTEND_BUILD:-1}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"

timestamp() {
  date +"%Y%m%d-%H%M%S"
}

log() {
  printf '[%s] %s\n' "$(date +"%F %T")" "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "missing command: $1"
}

cleanup_on_error() {
  local exit_code=$?
  if [[ $exit_code -ne 0 ]]; then
    log "Deploy failed, start rollback"
    if [[ -n "${PREVIOUS_CURRENT:-}" && -e "${PREVIOUS_CURRENT:-}" ]]; then
      ln -sfn "$PREVIOUS_CURRENT" "$CURRENT_LINK"
      systemctl daemon-reload || true
      systemctl reset-failed "$SERVICE_NAME" || true
      systemctl restart "$SERVICE_NAME" || true
      log "Rollback finished -> $PREVIOUS_CURRENT"
    fi
  fi
  exit "$exit_code"
}

trap cleanup_on_error ERR

require_cmd git
require_cmd npm
require_cmd rsync
require_cmd curl
require_cmd systemctl
require_cmd node
require_cmd sqlite3

[[ -d "$PROJECT_ROOT/.git" ]] || fail "run this script from the repo root"
[[ -f "$SHARED_ENV" ]] || fail "missing shared env file: $SHARED_ENV"
[[ -d "$PROJECT_ROOT/$BACKEND_DIRNAME" ]] || fail "missing backend directory"

GIT_SHA="$(git -C "$PROJECT_ROOT" rev-parse --short HEAD)"
RELEASE_NAME="release-${GIT_SHA}-$(timestamp)"
RELEASE_PATH="$RELEASES_DIR/$RELEASE_NAME"
PREVIOUS_CURRENT="$(readlink -f "$CURRENT_LINK" || true)"

log "Prepare directories"
mkdir -p "$RELEASES_DIR" "$SHARED_DIR" "$WEB_ROOT" "$APP_ROOT/backups"

log "Create clean release: $RELEASE_PATH"
mkdir -p "$RELEASE_PATH"
rsync -a --delete \
  --exclude ".git" \
  --exclude "node_modules" \
  --exclude "dist" \
  --exclude "backend/node_modules" \
  "$PROJECT_ROOT/" "$RELEASE_PATH/"

if [[ "$SKIP_FRONTEND_BUILD" != "1" ]]; then
  log "Install frontend dependencies"
  npm --prefix "$RELEASE_PATH" ci

  log "Build frontend"
  VITE_API_MODE=standalone \
  VITE_API_BASE_URL= \
  npm --prefix "$RELEASE_PATH" run build
else
  log "Skip frontend build because SKIP_FRONTEND_BUILD=1"
  if [[ -d "$CURRENT_LINK/dist" ]]; then
    log "Reuse current dist from $CURRENT_LINK/dist"
    mkdir -p "$RELEASE_PATH/dist"
    rsync -a --delete "$CURRENT_LINK/dist/" "$RELEASE_PATH/dist/"
  else
    fail "current dist not found; set SKIP_FRONTEND_BUILD=0 for a full build"
  fi
fi

log "Install backend dependencies"
npm --prefix "$RELEASE_PATH/$BACKEND_DIRNAME" ci

log "Prepare backend runtime env"
cp "$SHARED_ENV" "$RELEASE_PATH/$BACKEND_DIRNAME/.env"

log "Load env"
set -a
# shellcheck disable=SC1090
source "$SHARED_ENV"
set +a

[[ -n "${DATABASE_URL:-}" ]] || fail "DATABASE_URL missing in $SHARED_ENV"

log "Run Prisma generate"
npm --prefix "$RELEASE_PATH/$BACKEND_DIRNAME" run prisma:generate

PRISMA_DIR="$RELEASE_PATH/$BACKEND_DIRNAME"
DIFF_FILE="/tmp/prisma-diff-${RELEASE_NAME}.sql"

log "Check Prisma diff safety"
(
  cd "$PRISMA_DIR"
  npx prisma migrate diff \
    --from-url "$DATABASE_URL" \
    --to-schema-datamodel prisma/schema.prisma \
    --script > "$DIFF_FILE"
)

if [[ -s "$DIFF_FILE" ]]; then
  log "Prisma diff generated: $DIFF_FILE"
else
  log "Prisma diff is empty"
fi

if grep -Eiq \
  'DROP TABLE|DROP COLUMN|ALTER TABLE .* DROP COLUMN|CREATE UNIQUE INDEX .*phone|SET NOT NULL|ADD COLUMN .* NOT NULL' \
  "$DIFF_FILE"; then
  if [[ "$ALLOW_DESTRUCTIVE_SCHEMA" != "1" ]]; then
    echo
    echo "========== BLOCKED DANGEROUS PRISMA CHANGE =========="
    cat "$DIFF_FILE"
    echo "====================================================="
    fail "dangerous schema change detected; fix schema first or run with ALLOW_DESTRUCTIVE_SCHEMA=1 after manual review"
  else
    log "Dangerous schema allowed because ALLOW_DESTRUCTIVE_SCHEMA=1"
  fi
fi

if [[ "$DATABASE_URL" == file:* ]]; then
  DB_PATH="${DATABASE_URL#file:}"
  if [[ -f "$DB_PATH" ]]; then
    DB_BACKUP="$APP_ROOT/backups/$(basename "$DB_PATH").before-${RELEASE_NAME}"
    log "Backup SQLite database -> $DB_BACKUP"
    cp "$DB_PATH" "$DB_BACKUP"
  else
    log "SQLite database file not found yet: $DB_PATH"
  fi
fi

log "Apply Prisma schema"
(
  cd "$PRISMA_DIR"
  npx prisma db push --skip-generate
)

log "Switch current symlink"
ln -sfn "$RELEASE_PATH" "$CURRENT_LINK"

[[ -d "$CURRENT_LINK/$BACKEND_DIRNAME" ]] || fail "current backend directory missing after symlink switch"

log "Publish frontend to web root"
rsync -a --delete "$CURRENT_LINK/dist/" "$WEB_ROOT/"

log "Restart backend service"
systemctl daemon-reload
systemctl reset-failed "$SERVICE_NAME" || true
systemctl restart "$SERVICE_NAME"
systemctl is-active --quiet "$SERVICE_NAME" || fail "service is not active: $SERVICE_NAME"

log "Validation 1/3: local backend health"
curl -fsS "http://127.0.0.1:${BACKEND_PORT}${HEALTH_PATH}" >/dev/null

log "Validation 2/3: local backend response contains ok"
curl -fsS "http://127.0.0.1:${BACKEND_PORT}${HEALTH_PATH}" | grep -qi '"ok":true'

log "Validation 3/3: public health"
curl -fsS "$PUBLIC_HEALTH_URL" | grep -qi '"ok":true'

log "Cleanup old releases"
if [[ "$KEEP_RELEASES" =~ ^[0-9]+$ ]] && (( KEEP_RELEASES > 0 )); then
  mapfile -t all_releases < <(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d | sort)
  if (( ${#all_releases[@]} > KEEP_RELEASES )); then
    delete_count=$(( ${#all_releases[@]} - KEEP_RELEASES ))
    for ((i = 0; i < delete_count; i += 1)); do
      if [[ "${all_releases[$i]}" != "$(readlink -f "$CURRENT_LINK")" ]]; then
        rm -rf "${all_releases[$i]}"
      fi
    done
  fi
fi

log "Deploy succeeded"
log "Current release: $(readlink -f "$CURRENT_LINK")"
