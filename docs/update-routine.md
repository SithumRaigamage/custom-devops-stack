# Monthly update routine

How to keep the stack's images and scanners current without breaking it. Run it once a
month, or sooner when `make scan-images` reports a fixable HIGH/CRITICAL issue.

**Prerequisites:** Docker Desktop running, enough free disk for new images
(`docker system df`), and no Jenkins build in progress.

## Steps

1. **Back up first.** `make backup`, then confirm the newest folder in `backups/` has a
   checksum file. Database upgrades (Postgres, SonarQube) can't be undone without it.
2. **See what's vulnerable.** `make scan-images`. Reports land in `reports/`. Note every
   image with a fixable HIGH/CRITICAL finding.
3. **Check for newer versions** of each image in the compose files
   (`grep -h 'image:' */docker-compose.yml`). Read the release notes for any major
   version jump. Floating tags (`open-webui:main`, `mongo:7`, `custom-jenkins:latest`)
   change underneath you: pin them when you touch them (backlog #17).
4. **Bump one service at a time.** Edit the tag in that service's compose file (and in
   `scripts/stack.sh` `IMAGE_TARS` / `scripts/scan.sh` `STACK_IMAGES` if listed there).
   For Jenkins, rebuild the custom image following the `jenkins-ops` skill.
5. **Restart and verify** that service: `make restart S=<service>`, then `make status`
   shows it `healthy`, and its UI or a representative job works (for Jenkins, one
   JobTrigger build; for SonarQube, a scan and the quality gate).
6. **Re-scan.** `make scan-images` again; the fixed findings should be gone.
7. **Update scanner pins** in `scripts/scan.sh` (Gitleaks, Trivy) and the Jenkins image
   if a newer scanner is out, then `make scan` once to confirm they still run.
8. **Record it.** Add a dated entry to `docs/CHANGELOG.md` listing each old → new tag,
   and update the version mentioned in the service's README.

## Rules

- Never `docker compose down -v` or delete data folders during an update.
- A database major-version bump (for example Postgres 15 → 16) needs a dump and restore,
  not just a new tag. Plan it as its own backlog item.
- If a service fails to start after a bump, put the old tag back and restart; restore
  from the backup only if the data was migrated.
