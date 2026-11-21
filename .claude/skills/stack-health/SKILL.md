---
name: stack-health
description: Diagnose stack health using doctor, status, logs, and observability tools. Use when the user says "check stack health", "run doctor", "why is Jenkins unhealthy", "show GlitchTip logs", "container keeps restarting", "investigate Grafana", or asks for troubleshooting in custom-devops-stack. Read-only diagnosis first; propose changes only after evidence.
---

# Stack Health

## When to use
- The user reports a service not starting, unhealthy, slow, or crashing.
- The user asks for status, logs, doctor, Grafana, Prometheus, Loki, or cAdvisor checks.
- A change was just made and needs verification.

## Authoritative sources
- `scripts/stack.sh doctor`, `status`, `logs`.
- `README.md` troubleshooting and port table.
- `observability/README.md` for Grafana/Prometheus/Loki/cAdvisor.
- Service READMEs for known failure modes.

## Hard rules
1. Diagnose before changing anything.
2. Use `make doctor`, `make status`, and `make logs S=<service>` before ad hoc Docker commands.
3. Never print `.env` values, DSNs, tokens, passwords, or session secrets.
4. Do not restart, stop, or remove data-bearing containers or volumes without approval.
5. Treat docs that claim Jenkins/SonarQube bind to `127.0.0.1` as potentially stale: verify the compose defaults and actual `.env` before making network claims.

## Steps
1. Run `make doctor` and capture failed checks.
2. Run `make status` and note stopped, exited, or unhealthy containers.
3. For the affected service, run `make logs S=<service>` (add `-f` only when live following is needed).
4. Check known dependencies:
   - `sonarqube` needs `sonarqube-db`.
   - `analytics` and `glitchtip` need general Postgres on host port 5433.
   - `glitchtip` needs Mailpit for signup and alert email.
   - `open-webui` needs host Ollama on port 11434.
   - `observability` expects `devops-network`; start Jenkins first if the network is missing.
5. If observability is up, inspect Grafana/Prometheus/Loki evidence before proposing fixes.
6. For port conflict symptoms, use `lsof -nP -iTCP:<port> -sTCP:LISTEN` and identify the owner; do not kill it without approval.

## Known failure signatures
- GlitchTip signup 500 / `Name or service not known` → Mailpit is not running.
- SonarQube exit 137 / Elasticsearch OOM → heap settings were too high; current heaps were reduced deliberately.
- Dashboard `fetch failed` on `localhost` → IPv6 `::1`; check URL normalization in `integration-probe.ts`.
- cAdvisor failures on Docker Desktop → wrong socket or cAdvisor older than v0.54.
- Port 27017 conflict → unrelated `expense-tracker-db`; local legacy Mongo uses 27018.

## Checks
- `make doctor` exit status.
- Container state and health from `make status`.
- Last 200 log lines from `make logs S=<service>`.
- Dependency services running.
- No secret values exposed in the report.

## Output format
Provide:
1. Symptom and affected service.
2. Evidence collected (doctor/status/logs/observability).
3. Root cause or ranked hypotheses.
4. Safe next steps.
5. Actions requiring approval, especially restarts, data-volume changes, or network exposure.
