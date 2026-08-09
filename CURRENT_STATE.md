# Current State Audit — custom-devops-stack

Audit date: 2026-08-09
Host: MacBook Air (Apple Silicon, model T8112 / M2-class), Darwin 25.5.0

## 1. Host capacity (the constraint that governs everything below)

| Resource | Value |
|---|---|
| Physical RAM | **8 GB** |
| Docker Desktop VM memory allocation | **2.84 GiB** (`docker info`) |
| Docker Desktop CPUs | 5 |
| Free disk | ~9.7 GB free (460 GB volume, but this slice is nearly full) |
| `jenkins_home` on disk | 8.3 GB |
| `sonarqube/data` + `postgresql` on disk | ~435 MB |
| Docker reclaimable image space | 4.5 GB of 5.8 GB (78%) |

**This is the single most important fact in this document.** The current `docker-compose.yml` files already declare resource limits that add up to more than Docker Desktop is allocated:

```
Jenkins limit:      3 GB
SonarQube limit:    4 GB
Postgres limit:     1 GB
─────────────────────────
Declared total:     8 GB   vs.   2.84 GB actually available to Docker
```

Those are soft `deploy.resources.limits` (only enforced by Swarm, not by plain `docker compose up`), so containers don't hard-fail — but the *real* ceiling is 2.84 GB for everything Docker runs, and 8 GB for the whole machine including macOS itself. A platform with 15–20 additional services (Kubernetes, Gitea, Nexus, Vault, Keycloak, Prometheus, Grafana, Loki, Jaeger, Redis, MinIO, Traefik, Falco, Argo CD, Portainer, Uptime Kuma, Backstage) is realistically a **32–64 GB+ machine**, not this one. This must shape any roadmap.

## 2. Services currently defined

| Service | Defined in | Image | Status right now |
|---|---|---|---|
| Jenkins | `jenkins/docker-compose.yml` | `custom-jenkins:latest` (built from `jenkins/Dockerfile`, base `jenkins/jenkins:latest`) | **Not running** |
| SonarQube | `sonarqube/docker-compose.yml` | `sonarqube:26.1.0.118079-community` | **Not running** |
| SonarQube DB | `sonarqube/docker-compose.yml` | `postgres:15-alpine` | **Not running** |
| MongoDB | manual local install, controlled by `script.sh` | `mongod` binary at `../mongodb-macos-aarch64--8.2.3/bin/mongod` | **Not running** (`pgrep mongod` empty) |

Only one container is actually running on the machine right now, and it isn't part of this stack:

```
NAMES                IMAGE          PORTS
expense-tracker-db   mongo:latest   0.0.0.0:27017->27017/tcp
```

This is a Dockerized Mongo for an unrelated project (`expense-tracker`), and **it already occupies port 27017**. If `./script.sh mongo-start` is run while this container is up, the local `mongod` will fail to bind the port. This is a real, live conflict — not hypothetical.

## 3. What Jenkins actually provides

`jenkins/Dockerfile` bakes in more than the README currently documents:
- Trivy (filesystem/image/config scanning) — already installed via the official apt repo
- Docker CLI (`docker.io`) — for building images inside pipelines
- Docker socket bind-mounted from the host

**Correction (was wrong in the original audit):** Trivy is not just installed but already wired into a real pipeline. `jenkins/CI.JenkinsFile` has a full `Trivy Repo Scan` stage (`aquasec/trivy:0.57.0 fs`, severity-gated, fails the build) and a `Trivy Security Scan` stage that scans the built image using the `trivy` binary baked into the Jenkins image, plus SBOM generation (Syft), secret scanning (Gitleaks), and SAST (Semgrep). This file wasn't read during the first pass of the audit. There is nothing left to do here.

## 4. Security findings (real, not hypothetical)

| Finding | Where | Severity | Status |
|---|---|---|---|
| Jenkins container ran as `user: root`, and its entrypoint ran `chmod 666 /var/run/docker.sock` (world read/write on the Docker socket = root-equivalent access to the host from inside any container) | `jenkins/docker-compose.yml` | High | **Fixed** — entrypoint now starts as root only to match the `jenkins` user's group to the socket's real GID, then drops to `jenkins` via `gosu` (`jenkins/docker-entrypoint-wrapper.sh`). Socket is no longer world-writable. Jenkins still has effective docker.sock access (needed for Docker-in-Docker pipelines), which remains a real, accepted trade-off — not eliminated, just no longer world-exposed. |
| `jenkins/README.md` claimed *"✅ Removed `user: root` (security risk eliminated)"* — was out of date / incorrect | `jenkins/README.md` vs `jenkins/docker-compose.yml` | Docs/reality mismatch | **Fixed** — README now describes the actual gosu-based mechanism and its remaining trade-off. |
| PostgreSQL password hardcoded in plaintext and committed to git (`sonar_secure_password`), used for both the SonarQube app user and the DB itself | `sonarqube/docker-compose.yml` | Medium (local-only network, but still a secret in git history) | **Fixed going forward** — moved to gitignored `sonarqube/.env` (`SONARQUBE_DB_PASSWORD`), compose now reads `${SONARQUBE_DB_PASSWORD:?...}`. Value was kept identical to what's already in the initialized `./postgresql` data dir, since Postgres only applies `POSTGRES_PASSWORD` on first init — `.env.example` documents the `ALTER USER` command needed to actually rotate it. Note: the old value still exists in prior git history; full remediation would mean rotating the password *and* scrubbing history, which hasn't been done. |
| `sonarqube/README.md` documents image `sonarqube:10.8.0-community`; actual compose pins `26.1.0.118079-community` | `sonarqube/README.md` vs `sonarqube/docker-compose.yml` | Docs/reality mismatch | **Fixed** — README now states the real pinned version. |
| No `.env` / `.env.example` anywhere in the repo — all config is inline in compose files | repo-wide | Medium | Partially addressed — `sonarqube/.env` + `.env.example` now exist. Jenkins compose has no secrets to move (it has none). |
| MongoDB has no authentication configured | `script.sh` | Low (local dev only, but noted in README as a TODO already) | Not addressed (still tracked as a TODO). |
| Local `mongod` (port 27017 default) collided with an unrelated project's `expense-tracker-db` Docker container already bound to 27017 | `script.sh` | Medium (silent failure risk) | **Fixed** — local `mongod` now defaults to port 27018 (`MONGO_PORT` override available), and `start_mongodb()` pre-flight-checks the port with `lsof` and fails with a clear message instead of a cryptic bind error. |

## 5. Networking

- Single Docker network: `devops-network` (bridge), shared by Jenkins and SonarQube. This is correctly scoped — no unnecessary networks exist today, and none are needed yet.
- MongoDB is a local OS process, not on any Docker network, and is not reachable from Jenkins/SonarQube containers today.
- No reverse proxy, no local DNS/hostnames — everything is accessed by raw `localhost:<port>`.

## 6. Backups

- `README.md` documents a backup script (tar of `jenkins_home`, SonarQube data, and MongoDB data) but it is **documentation only** — there is no actual `scripts/backup.sh` file in the repo yet, and no backup has ever been taken (no `backups/` directory exists).

## 7. Gap vs. the requested 48-section platform

The requested target platform (Gitea, Nexus/Harbor, Trivy, OWASP ZAP, Vault/OpenBao, Keycloak, k3s, Helm, Argo CD, Prometheus, Grafana, Loki, Alertmanager, OpenTelemetry, Jaeger, k6, Redis, MinIO, Traefik, Portainer, Uptime Kuma, Falco, OpenTofu, Ansible, Backstage) is a legitimate, well-known "DevOps platform in a box" reference architecture — but essentially none of it exists here yet beyond Jenkins + SonarQube + Trivy-the-binary. Building all of it is not a single task; on this hardware, most of it (especially Kubernetes + a full observability stack + Keycloak + Vault running concurrently) is **not physically going to fit** in 2.84 GB of Docker memory regardless of how well it's engineered.

## 8. Recommended starting point

Don't start with Kubernetes or the observability stack — start by making the two services you already have reliable and safe, since right now they're both stopped and one has a known root/socket security hole. In priority order:

1. **Fix the Jenkins root/docker-socket issue** and reconcile the READMEs with what the compose files actually do (both are quick, high-value, zero new dependencies).
2. **Move the SonarQube DB password into a `.env` file** (gitignored) referenced from compose via `${SONAR_DB_PASSWORD}` — removes the committed secret with minimal effort.
3. **Right-size the memory limits** to fit inside the real 2.84 GB Docker Desktop allocation (or bump Docker Desktop's memory setting first, if you're willing to give it more of the 8 GB host RAM) — otherwise every future addition makes contention worse.
4. **Resolve the port 27017 conflict** between `script.sh`'s local `mongod` and the unrelated `expense-tracker-db` container.
5. **Wire Trivy into a Jenkins pipeline stage** (filesystem + image scan) — it's already installed in the image, so this is the highest-value/lowest-cost item from the entire 48-section list.
6. Only after 1–4 are done and the stack starts reliably: pick **one** next addition based on what you actually need next (a Git server if you want to self-host repos, or a metrics/logs setup if you want visibility) rather than adding the full observability + GitOps + Kubernetes + identity + secrets stack at once. On an 8 GB laptop, each additional always-on service should be a deliberate trade-off against what's already running.

None of the above has been implemented yet — this file is the audit only, per your request to document first.
