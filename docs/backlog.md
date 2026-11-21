# Backlog

Remaining development for the custom DevOps stack and the StackPilot dashboard.
Done work is in `docs/CHANGELOG.md`. Priorities: **P1** next, **P2** soon, **P3** later.
Move an item to `docs/CHANGELOG.md` when it's finished.

## Jenkins — continue next (added 2026-11-19)

Context: the `Projects/JobTrigger` jobs (backend, frontend, website, security, tools CI;
release CD) run the JobTrigger repo's `Jenkins/<component>/Jenkinsfile`, built on
`jenkins/CI.JenkinsFile`, from branch `docs/product-proposals-phase-26` (last commit
`f42feaf`). Passing: website, tools, security, backend (with `SONARQUBE_SCAN=false`).
Docker Desktop was stopped at the end of the session; start it first.

| # | Item | Why / notes | Area |
|---|---|---|---|
| J1 | Bake the Android NDK into `jobtrigger-flutter` | Every Android build downloads and unpacks NDK 28.2 (~700 MB): it lands in the throwaway container. In `buildFlutterImage()` (shared helper, all six JobTrigger Jenkinsfiles) add `sdkmanager "ndk;<v>"`, reading `<v>` from the Flutter SDK's `ndkVersion` instead of hardcoding it. Same change in both copies, or the image tag stops matching | CI/CD |
| J2 | Install scanners in the Jenkins image | In `jenkins/Dockerfile`, like Trivy (pinned, checksum-verified, arm64 + amd64): gitleaks 8.30.1, osv-scanner 2.7.0, syft, hadolint 2.12.0, semgrep 1.185.0 (Python venv), `python3`. Then switch `CI.JenkinsFile` and the JobTrigger security/tools stages from `docker run <image>` to the agent binaries. Flutter/Android stay in their amd64 image (Android tools are x86-only on Linux); Playwright stays in its image | CI/CD |
| J3 | Rebuild and restart Jenkins | `docker compose build && docker compose up -d` in `jenkins/` after J1/J2; jobs and settings persist in `jenkins_home` | CI/CD |
| J4 | Verify the Android builds | Frontend "Build Debug APK" and release "Build Android APK" have not run since the Gradle fixes (`af4ac91` heap cap, `f42feaf` `GRADLE_USER_HOME`); both earlier runs were aborted. Run them **one at a time** (each Flutter build takes ~4.5 GB) | CI/CD |
| J5 | Regenerate `sonarqube-token` | SonarQube returns 401 for the stored token, so every job's Sonar stage fails (backend #5). New token in SonarQube → update the `sonarqube-token` credential in Jenkins (same ID), then re-run backend with Sonar on. Ties in with #14 | Security |
| J6 | Commit the stack's Jenkins/SonarQube changes | Uncommitted on `feat/dashboard`: `jenkins/CI.JenkinsFile` (template now compiles; `--volumes-from` mounts; `sonar.token`; semgrep fix), `jenkins/README.md`, `jenkins/PIPELINE_TEMPLATE.md`, `sonarqube/docker-compose.yml` (heaps 768M/768M/1G: at 1G/1G/2G Elasticsearch was killed, exit 137) | Docs |
| J7 | Executors 2 → 3 | Lets a quick job run beside the two heavy ones. Not 4: two Flutter builds plus SonarQube already fill Docker's ~10.6 GB | CI/CD |
| J8 | Revoke the temporary Jenkins API token | It was shared during the session; create a new one when needed | Security |
| J9 | Optional JobTrigger setup | `CI_RECEIVER_EMAIL` global property (email receiver), `codecov-token` credential (enables `UPLOAD_CODECOV`), a `macos` agent (enables `BUILD_IOS`), and a decision on `trivy fs` license findings (LGPL-3.0 in JobTrigger-Web, marks security UNSTABLE) | CI/CD |
| J10 | Merge the JobTrigger `Jenkins/` folder to `develop` | Jobs build from `docs/product-proposals-phase-26`; after the merge, switch each job's branch to `*/develop` | CI/CD |

## P2 — Soon

| # | Item | Why / notes | Area |
|---|---|---|---|
| 6 | Nightly backups | launchd job running `make backup`, plus a copy to another disk; include SonarQube/Postgres/Mongo by starting them first or skipping cleanly | Backup |
| 7 | Jenkins metrics | Install the *Prometheus metrics* plugin; Prometheus already scrapes `jenkins:8080/prometheus` | Observability |
| 8 | Grafana alerts | Alert on container OOM, memory > 90 % of limit, and services down; route to the same Discord webhook | Observability |
| 9 | Dashboard service commands | Jenkins/SonarQube/Open WebUI still list zsh functions (`jenkins-start`, `webui`) that are ignored with shell mode off; replace with `scripts/stack.sh up <svc>` or clear them | Dashboard |
| 10 | Dashboard: per-container view for multi-container services | Observability (5 containers) and SonarQube (app + DB) show as one service; show each container's state and memory on the service page | Dashboard |
| 11 | Dashboard: backups page | Trigger `make backup`, list `backups/` with size and checksum status, show restore steps | Dashboard |
| 12 | Dashboard: scan results page | Run `make scan` and show the Gitleaks/Trivy summary per image with history | Dashboard |
| 13 | Jenkins Configuration as Code | Plugins, jobs and settings in the repo so Jenkins can be rebuilt from scratch | CI/CD |
| 14 | Least-privilege SonarQube token | Dedicated SonarQube user and token for Jenkins instead of the admin token; record expiry and rotation | Security |
| 15 | Fail on quality gate + coverage templates | Gate failure fails the build; `sonar-project.properties` templates with coverage paths | CI/CD |
| 16 | Hello-World-Node-JS SonarQube URL | Uses `host.docker.internal:9000`; switch to `http://sonarqube:9000` now that SonarQube binds to localhost | CI/CD |
| 17 | Pinned versions file | One `versions.env` for every image tag (Open WebUI `:main`, `mongo:7`, Postgres are floating) | Reproducibility |
| 18 | Health checks in compose | `healthcheck` for Jenkins, SonarQube, Open WebUI, Postgres so `depends_on` waits for readiness | Reliability |
| 19 | Memory check in `make doctor` | Warn when Docker Desktop's memory is below the sum of the limits of the services being started | Reliability |
| 20 | Credentials policy doc | Where each secret lives, rotation, token types | Security |
| 21 | Runbook and architecture diagram | How services connect; what to do when X breaks | Docs |

## P3 — Later

| # | Item | Why / notes | Area |
|---|---|---|---|
| 22 | Docker log rotation | `max-size` / `max-file` on every service | Maintenance |
| 23 | MongoDB authentication | Root user from `.env`, connection string in docs | Security |
| 24 | Retire `script.sh` and the local `mongod` | Everything through `make`; MongoDB already runs in Docker | Maintenance |
| 25 | Monthly update routine | Check new image versions, scan, bump pins | Maintenance |
| 26 | Private registry | Nexus or Harbor; replaces the `images/` tar cache | Platform |
| 27 | Reverse proxy | Traefik or Caddy with `*.localhost` names instead of ports | Platform |
| 28 | Self-hosted Git | Gitea triggering Jenkins builds | Platform |
| 29 | Secrets manager | Vault, so `.env` files are not the only credential store | Platform |
| 30 | Infrastructure as code | Terraform + k3d for local Kubernetes deployments | Platform |
| 31 | Decision records | Short notes on why choices were made | Docs |

## Known caveats

- Grafana's admin password is set at first start only; change it with `docker exec -it obs-grafana grafana cli admin reset-admin-password '<new>'`.
- The dashboard's own database (`stackpilot-postgres`) is intentionally not a dashboard service; manage it with `make dashboard` / `make down S=dashboard-db`.
- `make backup` only dumps databases that are running.
