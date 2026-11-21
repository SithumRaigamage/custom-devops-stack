---
name: network-switch
description: Manage local/LAN binding, devops-network repair, port conflicts, and iPhone Wi-Fi versus Personal Hotspot access in custom-devops-stack. Use when the user says "switch to Wi-Fi", "use Personal Hotspot", "expose GlitchTip to iPhone", "bind 0.0.0.0", "devops-network is broken", or asks about LAN access or port conflicts. Treat LAN exposure and network deletion as approval-gated.
---

# Network Switch

## When to use
- iPhone or other LAN device needs to reach a service.
- Wi-Fi changes to iPhone Personal Hotspot and the Mac address changes.
- `devops-network` is missing or corrupted.
- A host port conflict blocks startup.

## Authoritative sources
- `README.md` network and troubleshooting sections.
- `docs/TOOLS-ROADMAP.md` port registry.
- `glitchtip/README.md` iPhone section.
- `observability/README.md` network note.
- Service `docker-compose.yml` bind variables.

## Hard rules
1. Default posture is loopback: `127.0.0.1`.
2. Exposing a service with `*_BIND=0.0.0.0` requires explicit approval and must be reverted afterward.
3. Keep `GLITCHTIP_DOMAIN=http://localhost:3005` during iPhone testing; the DSN should stay as `localhost`.
4. Never print DSNs, tokens, LAN IPs, or `.env` values unless the user explicitly asks and it is safe.
5. Do not remove `devops-network` while containers are attached without approval; identify attached workloads first.
6. Do not kill an unrelated process holding a port without approval.

## Steps — iPhone access
1. Confirm which app/project DSN is needed; use the project-specific GlitchTip DSN.
2. With approval, set `GLITCHTIP_BIND=0.0.0.0` in `glitchtip/.env` and restart GlitchTip via `make restart S=glitchtip`.
3. Ensure Mailpit is running: `make up S=mailpit`.
4. From the JobTrigger repo, run:
   `SENTRY_DSN_APP=<that DSN> scripts/run-on-iphone.sh`
   The script swaps `localhost` for the Mac's current Wi-Fi or hotspot address.
5. Verify from the device, then restore `GLITCHTIP_BIND=127.0.0.1` and restart GlitchTip.

## Steps — devops-network repair
1. Inspect with `docker network inspect devops-network`.
2. List attached containers before changing anything.
3. If repair requires deletion, ask approval; then use:
   - `docker network rm devops-network`
   - `docker network create devops-network`
4. Restart affected services with `make restart S="<services>"`.
5. Verify with `make status` and `docker network inspect devops-network`.

## Steps — port conflict
1. Identify the port from `make doctor` or `scripts/stack.sh` service registry.
2. Find the listener with `lsof -nP -iTCP:<port> -sTCP:LISTEN`.
3. Report the owning process and proposed options; do not kill it without approval.
4. If a stack bind override is possible, propose a reversible `*_BIND`/port change.

## Checks
- Current bind values in compose files and `.env` files, without printing secret values.
- Mailpit running for GlitchTip.
- Network exists and services are attached.
- LAN exposure reverted after testing.

## Output format
Report:
1. Network mode before and after.
2. Commands run or proposed.
3. Device-facing URL/DSN handling without exposing values.
4. Verification result.
5. Required cleanup and approvals.
