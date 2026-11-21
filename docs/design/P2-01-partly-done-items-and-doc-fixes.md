# P2-01 — Finish the partly done items and fix wrong docs

Date: 2026-11-21. Approved by the user in session ("do all partly done items and fix
docs that are wrong"; keep Jenkins/SonarQube reachable from Mac **and** Wi-Fi; back up,
then restart the affected services to verify).

## What changes

| Item | Change | Files |
|---|---|---|
| Backlog #18 — health checks | Add `healthcheck` to Jenkins, SonarQube, SonarQube DB, Open WebUI and the five observability containers. SonarQube waits for its DB (`condition: service_healthy`). Commands use only tools present in each image (checked with `docker run --entrypoint`). | `jenkins/`, `sonarqube/`, `open-webui/`, `observability/` compose files |
| Backlog #19 / Practices #26 — memory check | `stack.sh doctor [service...]` sums the compose memory limits of the services that would be started (default: `DEFAULT_UP`) and warns when the sum exceeds Docker Desktop's memory. `make doctor S=...` passes services through. | `scripts/stack.sh`, `Makefile` |
| Backlog #15 / Practices #20–21 — coverage templates | Gate failure already fails the build in `CI.JenkinsFile`. Add `sonar-project.properties` templates with coverage report paths for Node/TS, Python, Java (Maven) and Flutter, documented in `PIPELINE_TEMPLATE.md`. | `jenkins/sonar-templates/`, `jenkins/PIPELINE_TEMPLATE.md` |
| Practices #17 — export configuration | `sonarqube/scripts/export-config.sh` exports the quality gate and quality profiles (no secrets) to `sonarqube/config/`. Jenkins config export stays with backlog #13 (JCasC). | `sonarqube/scripts/`, `sonarqube/config/` |
| Backlog #25 / Practices #23 — update routine | Monthly checklist using `make scan-images`, image tag checks, backup, bump, verify. | `docs/update-routine.md` |
| Wrong docs | Jenkins/SonarQube bind to `0.0.0.0` by default (user decision: LAN access needed); fix README, roadmaps, CHANGELOG note, CLAUDE.md and the stack-health skill. Practices #15 restore test → Done. CURRENT_STATE §8 marked historical. PRACTICES-ROADMAP points to `backlog.md` as the source of truth for open work. | `README.md`, `docs/*.md`, `CLAUDE.md`, `.claude/skills/stack-health/SKILL.md` |

## Verification

- `docker compose config -q` for every changed compose file.
- `make backup`, then restart Jenkins, SonarQube, Open WebUI and observability;
  `make status` / `docker ps` show every container `healthy`.
- `make doctor` prints the memory line; `make doctor S="jenkins sonarqube open-webui"`
  sums those limits.
- `bash -n scripts/stack.sh sonarqube/scripts/export-config.sh`; run the export script
  if `SONAR_TOKEN` is set in `sonarqube/.env` (skip and report if not).
- `make scan-secrets` before committing.
