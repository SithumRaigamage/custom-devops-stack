---
name: backup-restore
description: Create, verify, and restore backups of the custom DevOps stack using scripts/backup.sh, including checksums, retention, and per-service restore steps. Use when the user says "backup the stack", "make a backup before this", "restore Jenkins/SonarQube/Postgres/MongoDB/Open WebUI", "check backup integrity", or asks about backup retention. Restores are destructive and approval-gated; never overwrite live data without explicit confirmation.
---

# Backup & Restore

## When to use
- Before risky changes: image rebuilds, upgrades, network changes, data resets.
- Creating a scheduled/manual backup of running services.
- Recovering a service from a timestamped backup.

## Authoritative sources
- `scripts/backup.sh` — creates `backups/<timestamp>/`, `SHA256SUMS`, retention.
- `scripts/backup.sh --restore-help` — authoritative restore steps.
- `README.md` backup section; `Makefile` `backup` and `restore-help` targets.

## Hard rules
1. Backups are taken from **running** services via `pg_dump`/`pg_dumpall`/`mongodump` and tar archives — never by copying live data files. Stopped services are skipped and reported.
2. `make backup` is non-destructive. Every **restore** is destructive: it can overwrite current data. Get explicit approval and verify the target first.
3. Always verify integrity with `shasum -a 256 -c SHA256SUMS` inside the backup folder before restoring.
4. Never print secret values from dumps or archives; treat backups as sensitive.
5. Prefer testing a restore on a copy. An untested backup is not a backup.
6. Retention is `BACKUP_KEEP=7` by default (`0` keeps all). Do not delete old backups without approval.
7. Jenkins archives exclude workspaces/caches; note that Jenkins workspaces may contain other projects' artifacts.

## Steps — create a backup
1. Confirm Docker is running: `make status`.
2. Run `make backup` (or `scripts/backup.sh`). Note which services were backed up vs skipped.
3. Verify: `cd backups/<timestamp> && shasum -a 256 -c SHA256SUMS`.
4. Confirm `BACKUP_KEEP` behavior and that older backups are within policy.
5. Report the backup path and contents; do not expose values.

## Steps — restore (approval-gated)
1. Identify the exact backup folder and verify its checksums.
2. Stop the target service as documented; confirm what data will be overwritten.
3. Use the documented per-service commands from `make restore-help`:
   - **Jenkins**: `make down S=jenkins`; `tar -xzf jenkins_home.tar.gz -C jenkins/`; `make up S=jenkins`.
   - **SonarQube DB**: stop the `sonarqube` container (DB must run); restore into an **empty** `sonar` database with `gunzip -c sonarqube-db.sql.gz | docker exec -i sonarqube-db psql -U sonar -d sonar`; restart SonarQube.
   - **General Postgres**: `gunzip -c stack-postgres.sql.gz | docker exec -i stack-postgres psql -U postgres`.
   - **Dashboard DB**: `gunzip -c stackpilot.sql.gz | docker exec -i stackpilot-postgres psql -U stackpilot -d stackpilot`.
   - **MongoDB**: `docker exec -i stack-mongodb mongorestore --archive --gzip --drop < mongodb.archive.gz`.
   - **Open WebUI**: `make down S=open-webui`; `tar -xzf open-webui-data.tar.gz -C open-webui/`; `make up S=open-webui`.
4. Verify with `make status`, `make logs S=<service>`, and the service health URL.
5. Report what was restored and any follow-up (e.g. re-enter encrypted dashboard credentials if `SESSION_SECRET` changed).

## Checks
- Checksums pass before any restore.
- Target service stopped where required; destination verified.
- No secret values printed from dumps/archives.
- Post-restore health verified.

## Output format
Report: backup path/time, included/skipped services, integrity result, restore commands proposed or run, verification, and explicit approval status for destructive steps.
