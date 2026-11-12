#!/usr/bin/env bash
# Back up the stack's data into backups/<timestamp>/.
#
#   scripts/backup.sh                 back up everything that is running
#   scripts/backup.sh --restore-help  print restore steps
#
# Env:
#   BACKUP_DIR   where backups go            (default: <stack>/backups)
#   BACKUP_KEEP  how many backups to keep    (default: 7; 0 keeps all)
#
# Databases are dumped from the running containers (pg_dump / mongodump), never by
# copying live data files. Jenkins is archived without workspaces and caches, which
# are rebuilt by the next build.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
BACKUP_KEEP="${BACKUP_KEEP:-7}"

restore_help() {
  cat <<'TXT'
Restore from backups/<timestamp>/ (stop the service first unless noted):

  Jenkins       make down S=jenkins
                tar -xzf jenkins_home.tar.gz -C jenkins/        # recreates jenkins/jenkins_home
                make up S=jenkins

  SonarQube DB  make up S=sonarqube   (DB must run; stop the sonarqube container itself)
                docker stop sonarqube
                gunzip -c sonarqube-db.sql.gz | docker exec -i sonarqube-db psql -U sonar -d sonar
                docker start sonarqube
                Note: restore into an empty database (drop and recreate "sonar" first).

  Postgres      gunzip -c stack-postgres.sql.gz | docker exec -i stack-postgres psql -U postgres

  Dashboard DB  gunzip -c stackpilot.sql.gz | docker exec -i stackpilot-postgres psql -U stackpilot -d stackpilot

  MongoDB       docker exec -i stack-mongodb mongorestore --archive --gzip --drop < mongodb.archive.gz

  Open WebUI    make down S=open-webui
                tar -xzf open-webui-data.tar.gz -C open-webui/   # recreates open-webui/data
                make up S=open-webui

Check integrity first:  (cd backups/<timestamp> && shasum -a 256 -c SHA256SUMS)
Test a restore on a copy at least once; an untested backup is a hope, not a backup.
TXT
}

if [ "${1:-}" = "--restore-help" ]; then restore_help; exit 0; fi

command -v docker >/dev/null 2>&1 || { echo "docker is not installed" >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker is not running" >&2; exit 1; }

STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_DIR/$STAMP"
mkdir -p "$DEST"
chmod 700 "$BACKUP_DIR" "$DEST"

done_items=()
skipped=()

running() { [ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null || echo false)" = "true" ]; }

step() { printf '→ %s\n' "$1"; }

# --- Jenkins (bind mount; config, jobs, build history, plugins, credentials) ---
if [ -d "$ROOT/jenkins/jenkins_home" ]; then
  step "Jenkins home"
  tar -czf "$DEST/jenkins_home.tar.gz" -C "$ROOT/jenkins" \
    --exclude='jenkins_home/workspace' \
    --exclude='jenkins_home/caches' \
    --exclude='jenkins_home/.cache' \
    --exclude='jenkins_home/.npm' \
    --exclude='jenkins_home/.sonar/cache' \
    --exclude='*/node_modules' \
    --exclude='jenkins_home/war' \
    jenkins_home
  done_items+=("jenkins_home.tar.gz")
else
  skipped+=("jenkins (no jenkins/jenkins_home)")
fi

# --- SonarQube database ---
if running sonarqube-db; then
  step "SonarQube database"
  docker exec sonarqube-db pg_dump -U sonar -d sonar --no-owner | gzip >"$DEST/sonarqube-db.sql.gz"
  done_items+=("sonarqube-db.sql.gz")
else
  skipped+=("sonarqube-db (not running)")
fi

# --- General-purpose Postgres ---
PG_NAME="$(grep -E '^POSTGRES_CONTAINER_NAME=' "$ROOT/postgres/.env" 2>/dev/null | cut -d= -f2 || true)"
PG_NAME="${PG_NAME:-stack-postgres}"
PG_USER="$(grep -E '^POSTGRES_USER=' "$ROOT/postgres/.env" 2>/dev/null | cut -d= -f2 || true)"
PG_USER="${PG_USER:-postgres}"
if running "$PG_NAME"; then
  step "Postgres ($PG_NAME)"
  docker exec "$PG_NAME" pg_dumpall -U "$PG_USER" | gzip >"$DEST/stack-postgres.sql.gz"
  done_items+=("stack-postgres.sql.gz")
else
  skipped+=("$PG_NAME (not running)")
fi

# --- Dashboard (StackPilot) database ---
if running stackpilot-postgres; then
  step "Dashboard database"
  docker exec stackpilot-postgres pg_dump -U stackpilot -d stackpilot --no-owner | gzip >"$DEST/stackpilot.sql.gz"
  done_items+=("stackpilot.sql.gz")
else
  skipped+=("stackpilot-postgres (not running)")
fi

# --- MongoDB ---
if running stack-mongodb; then
  step "MongoDB"
  docker exec stack-mongodb mongodump --quiet --archive --gzip >"$DEST/mongodb.archive.gz"
  done_items+=("mongodb.archive.gz")
else
  skipped+=("stack-mongodb (not running)")
fi

# --- Open WebUI (SQLite + uploads; stop it for a fully consistent copy) ---
if [ -d "$ROOT/open-webui/data" ]; then
  step "Open WebUI data"
  running open-webui && echo "  (open-webui is running; for a fully consistent copy run: make down S=open-webui first)"
  tar -czf "$DEST/open-webui-data.tar.gz" -C "$ROOT/open-webui" --exclude='data/cache' data
  done_items+=("open-webui-data.tar.gz")
else
  skipped+=("open-webui (no data folder)")
fi

if [ ${#done_items[@]} -eq 0 ]; then
  echo "Nothing was backed up." >&2
  rmdir "$DEST" 2>/dev/null || true
  exit 1
fi

(cd "$DEST" && shasum -a 256 "${done_items[@]}" >SHA256SUMS 2>/dev/null || sha256sum "${done_items[@]}" >SHA256SUMS)
chmod 600 "$DEST"/*

echo
echo "Backup written to $DEST"
du -sh "$DEST" | awk '{print "  size: " $1}'
for item in "${done_items[@]}"; do echo "  ✔ $item"; done
if [ ${#skipped[@]} -gt 0 ]; then
  for item in "${skipped[@]}"; do echo "  – skipped $item"; done
fi

# --- Retention: keep the newest BACKUP_KEEP timestamped folders ---
if [ "$BACKUP_KEEP" -gt 0 ] 2>/dev/null; then
  old="$(ls -1d "$BACKUP_DIR"/[0-9]*-[0-9]* 2>/dev/null | sort -r | tail -n +"$((BACKUP_KEEP + 1))")"
  if [ -n "$old" ]; then
    echo
    echo "Removing backups beyond the newest $BACKUP_KEEP:"
    while IFS= read -r dir; do
      echo "  $dir"
      rm -rf -- "$dir"
    done <<<"$old"
  fi
fi
