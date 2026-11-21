# Changelog

Notable changes to the stack. Newest first. Commit history has the details.

## 2026-11-14

### New services
- **GlitchTip (`glitchtip/`)**: 6.1.0 on port 3005 for crash and error reporting (Sentry-SDK compatible), first for JobTrigger. All-in-one mode (web and worker in one container) with no Valkey/Redis, so it adds one container capped at 512 MB. Reuses the general Postgres (database `glitchtip`, created by `glitchtip/scripts/init-db.sh` on `up`), so `make backup` covers it. Alert email goes to Mailpit. `127.0.0.1` only, health check, `devops-network`, in `scripts/stack.sh` (bootstrap, doctor, up/down) and `make scan-images`. Verified on this Mac 2026-11-14 (container healthy, migrations applied). Start Mailpit with it: sign-up sends a verification email, and `stack.sh up glitchtip` now warns when Mailpit is down.

## 2026-11-12

### New services
- **Analytics (`analytics/`)**: Umami 3.2.0 on port 3004 for product analytics. Reuses the general Postgres (database `umami`, created by `analytics/scripts/init-db.sh` on `up`), so it adds no database container and is covered by `make backup`.
- **Mailpit (`mailpit/`)**: v1.29.2, SMTP 1025 and inbox 8025, for testing app email (JobTrigger password reset, Jenkins notifications) without sending real mail.
- Both: `127.0.0.1` only, memory limits, health checks, `devops-network`, in `scripts/stack.sh` (bootstrap, doctor, up/down) and `make scan-images`.

### Dashboard (StackPilot)
- Audit log: every change through the dashboard or API is recorded (who, what, which service, ok/failed), never secret values. Settings → Audit log with filters, paging and CSV export.
- API hardening: strict input validation on every route, rate limits on every change, log redaction, no CORS.
- Discord-only alerts with rich embeds (Telegram removed).
- Theme no longer re-saved on every page load.

### Stack
- One entry point: `Makefile` + `scripts/stack.sh` (up, down, status, logs, doctor, bootstrap). No dependency on `~/.zshrc`.
- `make bootstrap` generates passwords for new `.env` files.
- Jenkins and SonarQube bind to 127.0.0.1 (`JENKINS_BIND` / `SONAR_BIND` to expose).
- `make backup` / `make restore-help`: database dumps, archives, checksums, keep newest 7.
- Security: `make scan` (Gitleaks + Trivy), pre-commit hooks, `.gitleaksignore` for reviewed false positives.
- Jenkins image: gosu 1.17 → 1.19 (removes a critical Go CVE). Rebuild needed.
- Observability: Prometheus, Grafana (provisioned "Stack containers" dashboard), cAdvisor v0.60.4, Loki, Promtail.

### Dashboard services
- Added **Observability** as a dashboard service (start/stop/logs/open Grafana).
- Fixed the **Postgres** entry: it pointed at the dashboard's own database (5432) instead of the lab Postgres (5433).
- `observability/` creates `devops-network` if missing, so it starts on its own.

### Docs
- `docs/backlog.md`: all remaining development, prioritised.
- README quick start, monitoring, scanning and backup sections; port table; roadmap statuses; this changelog.
