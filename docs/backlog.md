# Backlog

Remaining development for the custom DevOps stack and the StackPilot dashboard.
Done work is in `docs/CHANGELOG.md`. Priorities: **P1** next, **P2** soon, **P3** later.
Move an item to `docs/CHANGELOG.md` when it's finished.

## Jenkins — continue next (added 2026-11-19)

Context: the `Projects/JobTrigger` jobs (backend, frontend, website, security, tools CI;
release CD) run the JobTrigger repo's `Jenkins/<component>/Jenkinsfile`, built on
`jenkins/CI.JenkinsFile`, from branch `docs/product-proposals-phase-26` (last commit
`752e11a`). Passing: website, tools, security, backend (with `SONARQUBE_SCAN=false`),
and frontend debug APK (J4). Docker Desktop was stopped at the end of an earlier
session; start it first if the containers are down.

| # | Item | Why / notes | Area |
|---|---|---|---|
| J10 | Merge the JobTrigger `Jenkins/` folder to `develop` | **BLOCKED:** local merge `368d3e5` done, but push to `origin/develop` rejected by branch protection (9 required checks, none run); PR #149 open/BEHIND with 0 checks. User asked to stay in this repo, so jobs remain on `*/docs/product-proposals-phase-26`. Do not switch jobs until the Jenkinsfiles are on remote `develop` | CI/CD |
| J11 | Fix the release APK's Dart `File::Copy` EINTR abort | `JobTrigger-release-CD` #5 and #6 both abort in `compileFlutterBuildRelease` with `file_linux.cc: 492: Unexpected EINTR errno` (Dart 3.13.7, exit 134) under the amd64/qemu Flutter image — reproducible, not memory-related. Debug APK passes. Investigate a Dart/Flutter workaround or an amd64-native agent; re-run the release build when fixed | CI/CD |
| J12 | Configure the SonarQube → Jenkins webhook | No webhook is configured for project `JobTrigger`, so `waitForQualityGate()` polls for 5 min and times out; backend #6 ended ABORTED even though the analysis succeeded and the gate is `OK`. Add a project/global webhook pointing at Jenkins' `/sonarqube-webhook/`, then re-run a backend build with Sonar on | CI/CD |

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
| 16 | Hello-World-Node-JS SonarQube URL | Uses `host.docker.internal:9000`; switch to the container URL `http://sonarqube:9000` on `devops-network`, like the other jobs | CI/CD |
| 17 | Pinned versions file | One `versions.env` for every image tag (Open WebUI `:main`, `mongo:7`, Postgres are floating) | Reproducibility |
| 32 | Memory limits on the remaining services | `make doctor` reports no limit on dashboard-db (`postgres`), Open WebUI, Postgres and MongoDB, so their memory isn't counted; add `deploy.resources.limits` sized from Grafana's "Stack containers" dashboard | Reliability |
| 20 | Credentials policy doc | Where each secret lives, rotation, token types | Security |
| 21 | Runbook and architecture diagram | How services connect; what to do when X breaks | Docs |

## P3 — Later

| # | Item | Why / notes | Area |
|---|---|---|---|
| 22 | Docker log rotation | `max-size` / `max-file` on every service | Maintenance |
| 23 | MongoDB authentication | Root user from `.env`, connection string in docs | Security |
| 24 | Retire `script.sh` and the local `mongod` | Everything through `make`; MongoDB already runs in Docker | Maintenance |
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
