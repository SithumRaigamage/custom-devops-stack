# Backlog

Remaining development for the custom DevOps stack and the StackPilot dashboard.
Done work is in `CHANGELOG.md`. Priorities: **P1** next, **P2** soon, **P3** later.
Move an item to `CHANGELOG.md` when it's finished.

## P1 — Next

| # | Item | Why / notes | Area |
|---|---|---|---|
| 1 | Apply image vulnerability fixes | `docker build --pull -t custom-jenkins:latest jenkins` (gosu 1.19), re-save `images/custom-jenkins_latest.tar`, pull fresh `postgres:15-alpine`, `postgres:16-alpine`, `mongo:7`, `open-webui:main`, then `make scan` and compare with the 12 Nov baseline | Security |
| 2 | Bump SonarQube | Pinned `26.1.0.118079` carries 7 critical Java library CVEs; move to the latest 26.x, update `sonarqube/docker-compose.yml`, `scripts/stack.sh` (`IMAGE_TARS`), `scripts/scan.sh` and the image tar | Security |
| 3 | Test a restore | Follow `make restore-help` on a copy (Jenkins archive, dashboard DB dump). An unrestored backup is unproven | Backup |
| 4 | Dependency audit | `cd dashboard && pnpm audit --audit-level high`, fix high/critical, close the last item in `audit-plan.md` | Dashboard |
| 5 | Run the full API test suite | `pnpm --filter api test` (includes the new audit and log tests) | Dashboard |

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
