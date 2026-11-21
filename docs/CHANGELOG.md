# Changelog

Notable changes to the stack. Newest first. Commit history has the details.

## 2026-11-21

### Security
- **P1 #1 — Image vulnerability fixes** (`aeaf624`): rebuilt `custom-jenkins:latest` with
  `docker build --pull` (gosu 1.19 verified in the image), re-saved the local
  `images/custom-jenkins_latest.tar` (git-ignored), and pulled fresh
  `postgres:15-alpine`, `postgres:16-alpine`, `mongo:7` and
  `ghcr.io/open-webui/open-webui:main`. `make scan` was clean for secrets (Gitleaks,
  78 commits) and reported these fixable HIGH/CRITICAL totals versus the 12 Nov
  baseline: custom-jenkins 1/42 → 1/41, postgres:15 1/43 → 1/26, postgres:16
  1/43 → 1/26, mongo:7 1/36 → 1/36 (unchanged), open-webui 4/28 → **5/54 (worse)**.
  The comparison is approximate — Trivy's vulnerability DB is live, so the 12 Nov
  baseline used an older snapshot. SonarQube 7/102 is unchanged (separate item #2).
  Images without a 12 Nov report: umami 9/70, mailpit 2/72, glitchtip 10/189.
  open-webui is a floating `:main` tag; pinning it is backlog P2 #17.
- **P1 #2 — Bump SonarQube** (`4acffd6`): moved from `26.1.0.118079-community` to
  `26.11.0.134175-community`, the latest 26.x community tag (Docker Hub, pushed
  2026-11-20). Updated the pin in `sonarqube/docker-compose.yml`, `scripts/stack.sh`
  (`IMAGE_TARS`), `scripts/scan.sh`, `README.md`, `docs/CURRENT_STATE.md`,
  `CLAUDE.md` and the `sonarqube-ops` skill note; corrected `sonarqube/README.md`
  (real image tag, password from `.env`, repo-local paths). Pulled the image and
  saved `images/sonarqube_26.11.0.134175-community.tar`; the old tar was left in
  place. Trivy fixable HIGH/CRITICAL: **7/102 → 3/30**. The major-version step
  required a manual DB migration: took `make backup` first
  (`backups/20261121-163059`, checksums verified, includes `sonarqube-db.sql.gz`),
  then ran `POST /api/system/migrate_db`; API status is now `UP` and the log says
  "SonarQube is operational". Note: `dashboard/services.yaml.bak` still contains
  the old tag for historical reasons; it is a backup artifact, not live config.

### Backup
- **P1 #3 — Test a restore** (`4ec551d`): proved both restore paths on copies without
  touching live data. `SHA256SUMS` passed for both archives. Extracted
  `20261121-163059/jenkins_home.tar.gz` to a scratch dir: `config.xml`,
  `credentials.xml`, 37 job configs (matches live), 193 plugin dirs (matches live),
  12 build-history dirs, and both key XML files parse. Restored
  `20261112-124004/stackpilot.sql.gz` into a disposable Postgres 16 container:
  12 public tables with data (`services=5`, `users=2`, `activity=112`,
  `status_samples=1091`, etc.). A second restore into the same DB failed with
  "relation already exists", confirming the dump needs an empty target — added
  that warning and a Jenkins exclusions note to `make restore-help`. Scratch dir
  and scratch container were removed; live `make status` and `jenkins_home` unchanged.

### Dashboard
- **P1 #4 — Dependency audit** (`4846a7c`): ran `pnpm audit --audit-level high` in
  `dashboard/` (exit 0) — no HIGH/CRITICAL advisories, so no dependency fixes or
  package installs were needed. One moderate advisory remains (esbuild ≤0.24.2 via
  the `drizzle-kit` dev dependency, dev-server only, GHSA-67mh-4wv8-2f99); accepted
  as out of scope and noted in `docs/audit-plan.md`, which is now fully complete.
- **P1 #5 — Full API test suite** (`d5b8bdd`): ran `pnpm --filter api test` —
  6 test files (`compose`, `status`, `integrations`, `registry`, `audit`, `logs`),
  23/23 passing, 0 failures. No source changes were needed. This completes P1;
  the backlog now starts at the Jenkins items.

### Jenkins
- **J1 — Bake the Android NDK into `jobtrigger-flutter`** (`ed7cc78`, JobTrigger
  repo, branch `docs/product-proposals-phase-26`): added an NDK install to the
  identical `buildFlutterImage()` helper in all six JobTrigger Jenkinsfiles
  (`backend`, `frontend`, `release`, `security`, `tools`, `website`) so the six
  copies stay in sync and the shared `jobtrigger-flutter:3.47.8` tag keeps the
  same meaning. The version is read at Docker build time from the checked-out
  Flutter SDK's `packages/flutter_tools/gradle/src/main/kotlin/FlutterExtension.kt`
  (`val ndkVersion`) via `sed | head -1 | xargs -r sdkmanager`, instead of being
  hardcoded, and a `find …/ndk | grep -q .` guard fails the layer if no NDK
  landed. Verified: all six helper bodies hash identically; the generated
  Dockerfile expands `$FLUTTER_VERSION` correctly; the extraction command in
  the existing image resolves `ndk;28.2.13676358`; and a throwaway container
  proved `sdkmanager` installs that NDK (licences already accepted). Did not
  rebuild the image tag or the Jenkins container — that is J3.
- **J2 — Install scanners in the Jenkins image** (`8757da9` in this repo,
  `b01d38c` in JobTrigger): added pinned, checksum-verified, arm64+amd64 installs
  to `jenkins/Dockerfile` — gitleaks 8.30.1, osv-scanner 2.7.0, syft 1.4.1,
  hadolint 2.12.0, and semgrep 1.185.0 in a `/opt/semgrep` Python venv (plus
  `python3`/`python3-venv`). Switched `jenkins/CI.JenkinsFile` and JobTrigger's
  security/backend stages from `docker run`/`dockerTool` scanner images to the
  agent binaries (Trivy fs now uses `misconfig`, and hadolint needs an explicit
  `-` to read stdin). Non-scanner `docker run` calls (Python, Go, .NET, cosign,
  Playwright) and the Flutter image are unchanged. Verified by building a
  scratch `custom-jenkins:j2-test`: all upstream `sha256sum -c` checks printed
  `OK`, all six `--version` calls matched the pins, and the exact gitleaks,
  syft, hadolint, trivy, osv-scanner and semgrep command forms ran successfully.
  The build exposed and fixed two bugs: gitleaks assets use `linux_arm64` (not
  `linux-arm64`) and hadolint requires `-` for stdin. No service was restarted;
  rebuilding/restarting Jenkins is J3.
- **J3 — Rebuild and restart Jenkins** (`29bd318`, design note; no tracked source
  changes): rebuilt `custom-jenkins:latest` with `docker build --pull` from the
  J2 Dockerfile, re-saved `images/custom-jenkins_latest.tar` (447 MB, tar listing
  valid) so the offline cache matches the live tag, and started Jenkins via
  `scripts/stack.sh up jenkins`. Verified: HTTP 200 on `/login`, "Jenkins is fully
  up and running" in the log, all six scanners plus `python3` report the pinned
  versions inside the running container, and `jenkins_home` still has 37 job
  configs and 193 plugin dirs. The local scratch tag `custom-jenkins:j2-test`
  was retained. **Risk:** `make scan-images` now reports `custom-jenkins:latest`
  at **7 CRITICAL / 151 HIGH** fixable (was 1/41 after P1 #1); the added scanner
  toolchain (semgrep's Python venv and Go-based scanner binaries) brought in most
  of the new findings. `make scan-images` still runs and reports the other
  images as before.

- **J4 — Verify the Android builds** (`a172f04`, `e04be23` design notes;
  `752e11a` in JobTrigger): ran both Android jobs sequentially on
  `BRANCH=docs/product-proposals-phase-26`. Frontend #3 (on `develop`) hung in
  `build_runner` with all outputs cached (both Dart processes in `futex_do_wait`,
  21 min of no output); aborted and removed the leaked container. Frontend #4
  cleared the stale `.dart_tool/build` cache, got through code generation in 29 s
  and reached `assembleDebug`, but Docker OOM-killed the container after 908.7 s
  (Gradle plus two Kotlin daemons, each `-Xmx3g`, versus ~10.6 GB Docker). Fix:
  capped Gradle at `-Xmx2g -XX:MaxMetaspaceSize=768m` and added
  `kotlin.daemon.jvmargs=-Xmx1g` in the identical `flutter()` helper of all six
  JobTrigger Jenkinsfiles (all six hashes verified equal), committed and pushed
  with approval. **Debug APK: PASS** — `JobTrigger-frontend-CI #5` built and
  archived `app-debug.apk` (187 MB, sha256 `ee9f2e2c…90b`) in 966536 ms with no
  OOM. **Release APK: FAIL** — `JobTrigger-release-CD` #5 and retry #6 abort in
  `compileFlutterBuildRelease` with Dart's `Unexpected EINTR errno` in
  `File::Copy` (exit 134/SIGABRT); no OOM event, reproducible under qemu/amd64.
  J4 closes as verified-with-finding; the release crash is tracked as **J11**.

- **J5 — Fix the Jenkins `sonarqube-token` 401** (`e800c9d` design note; no tracked
  source changes): read-only checks proved the gitignored `sonarqube/.env` token
  valid (`{"valid":true}`) while the Jenkins credential with the same ID was
  invalid (`{"valid":false}`) — the cause of backend #5's scanner `HTTP 401`.
  With approval, replaced the Jenkins `StringCredentialsImpl` value with the
  existing valid token via the Jenkins credentials store API, using a mode-600
  temp file so the value was never printed or entered in chat; removed and
  verified the temp files in both the container and host. No new token was
  generated or revoked (the value appears in 0 build logs). Post-change Jenkins
  check: `{"valid":true}`. Backend #6 with `SONARQUBE_SCAN=true` reported
  `ANALYSIS SUCCESSFUL` / `EXECUTION SUCCESS` with no 401. The build ended
  `ABORTED` for a separate reason — `waitForQualityGate()` timed out because no
  SonarQube→Jenkins webhook is configured (J12); the gate itself is `OK` in
  SonarQube.

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
