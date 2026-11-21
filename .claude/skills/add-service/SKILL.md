---
name: add-service
description: Add and register a new service in custom-devops-stack using the repo's folder, compose, env, network, port, docs, and scanner conventions. Use when the user says "add a new service", "onboard a tool", "create a compose service", "register this in the stack", "add it to devops-network", or asks to update the port registry. Produce a plan first; do not modify files until the user approves the plan.
---

# Add Service

## When to use
- A new self-hosted tool needs to join the stack.
- An existing compose service needs to become a managed stack service.
- The user asks to update service registration, ports, or docs.

## Authoritative sources
- `README.md` — service catalogue, access table, "adding a service" section.
- `docs/TOOLS-ROADMAP.md` — port registry and tool inventory.
- `scripts/stack.sh` — `SERVICES`, `DEFAULT_UP`, `IMAGE_TARS`.
- `scripts/scan.sh` — `STACK_IMAGES`.
- `Makefile` — wrappers.

## Required plan before changes
Present a table:

| Current / proposed path | Purpose | Reason | Confidence | Risk |
|---|---|---|---|---|

Include conflicts, duplicate destinations, and items needing human clarification. Wait for approval before writing.

## Hard rules
1. One folder per service with `docker-compose.yml`, `.env.example`, `.gitignore`, and `README.md`.
2. Bind to `127.0.0.1` by default. Use a `*_BIND=0.0.0.0` override only with explicit approval.
3. Attach to `devops-network` when the service needs container-to-container access.
4. Use pinned image tags; never `latest`.
5. Use bind-mounted data under the service folder; keep state with its owning service.
6. Real secrets live only in gitignored `.env`; templates use placeholders.
7. Add an explicit health URL or TCP probe suitable for the dashboard.
8. Do not overwrite an existing service folder or port silently.

## Steps
1. Gather service name, image/version, ports, env vars, volumes, health URL, and dependencies.
2. Check `docs/TOOLS-ROADMAP.md` and `scripts/stack.sh` for port/alias conflicts.
3. Draft the folder and compose file.
4. Register the service in `scripts/stack.sh`:
   - `SERVICES` entry: `name|folder|compose-filter|host-ports`.
   - `IMAGE_TARS` only if an offline tar is required.
5. Add the image to `scripts/scan.sh STACK_IMAGES`.
6. Add a Makefile wrapper only if the service needs a bespoke command.
7. Update `README.md`, `docs/TOOLS-ROADMAP.md`, `CHANGELOG.md`, and the dashboard service registry docs as needed.
8. After approval, write files, then verify with `scripts/stack.sh list`, `make doctor`, `make up S=<service>`, `make status`, and `make logs S=<service>`.

## Checks
- Port is unused by another stack service or unrelated process (`lsof -nP -iTCP:<port> -sTCP:LISTEN`).
- `.env.example` has placeholders only.
- Compose file uses `devops-network` where required.
- Health probe matches the dashboard convention (`http://...` or `tcp://...`).
- Docs and scanner registry are updated.

## Output format
Return:
1. Proposed file tree.
2. Migration/registration table.
3. Conflicts and open questions.
4. Verification commands and results after approval.
5. Any required documentation updates.
