---
name: stack-control
description: Start, stop, restart, or inspect services in the custom DevOps stack through the canonical Makefile/scripts/stack.sh entry point. Use when the user says "start Jenkins", "stop SonarQube", "restart the stack", "bring up the dashboard database", "show stack status", "follow logs", or asks to control any service in this repo. Never use shell functions from ~/.zshrc and never reimplement compose commands.
---

# Stack Control

## When to use
- The user asks to start, stop, restart, list, or inspect stack services.
- The user names a service alias such as `jenkins`, `sonarqube`, `open-webui`, `postgres`, `mongodb`, `dashboard-db`, `analytics`, `mailpit`, or `glitchtip`.
- The user asks for logs or status in this stack.

## Authoritative sources
- `scripts/stack.sh` — service registry, aliases, startup pre-steps, shutdown order.
- `Makefile` — public wrappers for every operational command.
- Each service folder's `README.md` and `docker-compose.yml` for service-specific details.

## Hard rules
1. Use `make` or `scripts/stack.sh`; do not invent `docker compose` invocations for normal control.
2. Do not source or rely on `~/.zshrc` functions. The stack was deliberately moved away from them.
3. Known service names are defined in `scripts/stack.sh`; run `scripts/stack.sh list` if unsure.
4. Default `up` set is `dashboard-db jenkins sonarqube`. Default `down` stops everything in reverse dependency order.
5. Stopping/removing containers or volumes that hold data requires explicit user approval. This skill normally uses non-destructive stop/down only.
6. Never pass `-v` to `docker compose down` from this skill unless the user explicitly approves data deletion.

## Steps
1. Confirm scope: named services only, or the default set.
2. Prefer the Makefile:
   - `make up S="jenkins sonarqube"`
   - `make down S=jenkins`
   - `make restart S=sonarqube`
   - `make status`
   - `make logs S=glitchtip`
3. If `make` is unavailable, call the script directly with the same arguments:
   - `scripts/stack.sh up jenkins sonarqube`
   - `scripts/stack.sh down jenkins`
   - `scripts/stack.sh restart sonarqube`
   - `scripts/stack.sh status`
   - `scripts/stack.sh logs glitchtip -f`
4. Respect special cases:
   - `analytics` runs `analytics/scripts/init-db.sh` on up.
   - `glitchtip` creates `data/uploads`, runs its DB init script, and warns if Mailpit is down.
   - `open-webui` and `mailpit` create their data directories on up.
   - `dashboard-db` is stopped with `docker compose stop postgres`; other services use `docker compose down`.
5. Verify with `make status` and, for a single service, `make logs S=<service>`.

## Checks
- Service name exists in `scripts/stack.sh list`.
- Docker daemon is running; otherwise report that Docker Desktop must be started.
- Required `.env` files exist; otherwise recommend `make bootstrap`.
- Ports are not held by unrelated processes; use `make doctor` if unsure.

## Output format
Report:
1. Command(s) run or proposed.
2. Services affected.
3. Verification result from `status`/`logs`.
4. Warnings and unresolved conflicts.
5. Any approval needed for destructive follow-up.
