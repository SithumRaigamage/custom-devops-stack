---
name: sonarqube-ops
description: Operate the local SonarQube service, including first start, token and password handling, quality gate/profile setup, Jenkins wiring, OOM and 401 troubleshooting. Use when the user says "SonarQube setup", "generate a Sonar token", "quality gate", "Industry Standard", "Company Way", "Sonar 401", "SonarQube OOM", "fix the sonar scan", or asks about the SonarQube/Jenkins bridge in custom-devops-stack. Never print tokens or passwords.
---

# SonarQube Operations

## When to use
- First-time SonarQube setup or admin login/token generation.
- Quality gate, quality profile, or permission template configuration.
- `401`/invalid-token failures from Jenkins or `sonar-scan.sh`.
- Exit `137`/crash-looping, memory tuning, or DB password rotation.

## Authoritative sources
- `sonarqube/README.md`, `sonarqube/docker-compose.yml`, `sonarqube/.env.example`.
- `sonarqube/scripts/setup-quality.sh` — the source of truth for "Industry Standard" and "Company Way".
- `README.md` Jenkins↔SonarQube section; `jenkins/PIPELINE_TEMPLATE.md`.
- `backlog.md` J5 (known 401 issue) and the heap notes in `CHANGELOG.md`.

## Hard rules
1. Never print `SONAR_TOKEN`, `SONARQUBE_DB_PASSWORD`, or any admin password. Refer to keys/IDs only.
2. Real values live in gitignored `sonarqube/.env`; templates contain placeholders only.
3. Use `make up S=sonarqube` / `make down S=sonarqube` / `make logs S=sonarqube` for control. SonarQube depends on `sonarqube-db`.
4. The compose image is `sonarqube:26.11.0.134175-community` and the password comes from gitignored `.env`. `sonarqube/README.md` was corrected on 2026-11-21 (real image tag, no literal password, repo-local path); verify before assuming drift.
5. Current heaps are deliberately reduced (web 768m, CE 768m, search 1G). Do not raise them back to 1G+1G+2G — that caused exit 137 OOM kills.
6. Rotating tokens/passwords and resetting data are approval-gated.

## Steps — first start
1. `make up S=sonarqube`; wait for `/api/system/status` to report `UP` (first start can take 2–3 minutes).
2. Create required directories with UID 1000 ownership only if absent: `mkdir -p data extensions logs postgresql temp` and `sudo chown -R 1000:1000 data extensions logs temp`.
3. Open `http://localhost:9000`, log in with `admin`, change the password immediately.
4. Generate a user token (My Account → Security) and put it in `sonarqube/.env` as `SONAR_TOKEN`. Never commit it.
5. Create the matching Jenkins credential with ID `sonarqube-token`; Jenkins uses server `SonarServer` at `http://sonarqube:9000`.

## Steps — quality gate/profiles
1. Confirm `SONAR_TOKEN` and `SONAR_HOST_URL` are set in `sonarqube/.env`.
2. Run `sonarqube/scripts/setup-quality.sh`. It is idempotent and creates:
   - Default gate **"Industry Standard"** (coverage <80%, duplication >3%, ratings >1, hotspots reviewed <100% on new code).
   - Profiles **"Company Way"** copied from "Sonar way" with vulnerability/bug rules activated.
   - `sonar.forceAuthentication=true` and permission template **"Standard Project"**.
3. Verify the gate/profile in the UI and on a test project before changing an existing project.

## Steps — DB password rotation (existing data dir)
Postgres only applies `POSTGRES_PASSWORD` on first init of an empty data directory. For an existing database:
1. Back up first: `make backup`.
2. `docker exec -it sonarqube-db psql -U sonar -d sonar -c "ALTER USER sonar WITH PASSWORD '…';"` (do not echo the value into logs/docs).
3. Update `SONARQUBE_DB_PASSWORD` in `sonarqube/.env` to match.
4. `make restart S=sonarqube` and verify status/logs. Get approval before starting; this can interrupt active analysis.

## Steps — 401 / invalid token
1. Confirm the token works against `SONAR_HOST_URL` directly before touching Jenkins.
2. Regenerate the token in SonarQube, update `sonarqube/.env` and the Jenkins credential `sonarqube-token`.
3. Ensure pipelines pass tokens as `-Dsonar.token="$SONAR_AUTH_TOKEN"`, not inline.
4. Revoke the old temporary token only after the new one is verified; revocation requires approval.

## Checks
- `make status` shows both `sonarqube` and `sonarqube-db` running.
- `make logs S=sonarqube` has no OOM/DB-auth errors.
- Token valid; gate/profile names match the script.
- Jenkins can resolve `http://sonarqube:9000` on `devops-network`.
- No secret values in the report.

## Output format
Report: service state, config keys changed (names only), gate/profile verification, 401/OOM resolution, and any approval needed.
