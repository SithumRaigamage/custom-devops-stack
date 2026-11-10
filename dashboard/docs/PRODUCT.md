# StackPilot

## Overview

StackPilot is a **local, single-user dashboard** that visualises and controls a custom DevOps stack running entirely on your Mac. It consists of two parts:

- **`apps/api`** — A Fastify JSON API (port 4000) that talks to Docker Compose and Ollama.
- **`apps/web`** — A Next.js 16 App Router dashboard (port 3001) that consumes the API and provides the UI.

The entire stack never leaves your machine and is **not exposed to the internet**.

## Monorepo layout

```
.
├── apps/api      # Fastify server, TypeScript, port 4000
├── apps/web      # Next.js App Router, Tailwind + shadcn/ui, port 3001
├── docs/         # DESIGN.md is the visual source of truth
├── docker-compose.yml # PostgreSQL container for auth + dashboard data
├── services.yaml.bak # One-time migration backup of the original service registry
└── .env          # local env vars (gitignored)
```

## Stack details

| Component | Tech | Port | Purpose |
|---|---|---|---|
| **API** | Fastify + TypeScript | 4000 | `/api/services`, `/api/services/:id/:action`, `/api/services/:id/logs` |
| **Dashboard** | Next.js 16 + Tailwind + shadcn/ui | 3001 | Overview, All services, a detail page per service (`/services/[id]`), AI Assistant, Settings |
| **PostgreSQL** | Docker (`postgres:16-alpine`) | 5432 | Users, sessions and dashboard tables (auth, settings, metrics, assistant history) |
| **Docker Compose** | docker compose | per-service | Compose services live in folders managed from the dashboard database |
| **LLM runtime** | Ollama | 11434 | Serves local models (e.g. `gpt-oss:20b`) |

## Phases A-E (checklist)

| Phase | Goal |
|---|---|
| **A** | Scaffold the monorepo; add `apps/api` (Fastify) and `apps/web` (Next.js) with shared Tailwind/shadcn/ui config. |
| **B** | Build the dashboard pages (Overview, Services, service detail, AI Assistant, Settings) matching `docs/design/DESIGN.md`. |
| **C** | Add the API config module with Zod‑validated `.env`; enforce `HOST` = `127.0.0.1`/`localhost`; create `.env.example`; wire `.env` and `*.db` into `.gitignore`. |
| **D** | Implement auth, theming, realtime, and any remaining integrations (Open WebUI, Linear, etc.). |
| **E** | Polish: unit/integration tests, Docker‑Compose bootstrap script, deployment scripts, documentation completeness. |

## API surface

| Route | Method | Response |
|---|---|---|
| `/api/services` | GET | `{ id, name, desc, port, url, folder, image, status: "healthy"\|"unhealthy"\|"stopped"\|"starting"\|"stopping"\|"restarting", cpuPct, memBytes, memPct, uptime, healthNote }[]` — `503 { error: "docker_unavailable" }` when Docker is not running |
| `/api/services/:id/:action` | POST | `{ id, action, ok, error?, output? }` — start/stop/restart |
| `/api/services/:id/logs` | GET | `{ id, tail, logs }` — docker compose logs |
| `/api/services/:id/health` | GET (implicit via status) | healthy/unhealthy/stopped |
| `/api/registry/services` | GET/POST | List / add services. Responses include `integration`, `integrationUrl`, `runInShell` and `credentialSaved`, never a credential. |
| `/api/registry/services/:id` | PUT/DELETE | Edit / delete a service |
| `/api/registry/services/reorder` | PUT | `{ ids }`, full ordered list |
| `/api/registry/services/test` | POST | Folder, compose file and health check |
| `/api/registry/services/test-command` | POST | `{ folder, command, runInShell }`, runs the command in the same mode as a start/stop and returns its output |
| `/api/registry/integrations/test` | POST | Test connection. Result is `connected`, `wrong_token`, `unreachable` or `error`, with the exact message |
| `/api/registry/services/:id/credential` | DELETE | Remove the saved credential |
| `/api/jenkins/*`, `/api/sonar/*`, `/api/ollama/*` | GET/POST | Integration data. Take optional `?service=<id>`; default is the first service with that integration |

## Local development

```bash
# PostgreSQL (repo root)
docker compose up -d postgres

# API
cd apps/api
pnpm dev          # runs tsx watch src/server.ts

# Dashboard
cd apps/web
pnpm dev          # runs next dev on http://localhost:3001
```

The API refuses to start if `HOST` is not `127.0.0.1` or `localhost`. All cross‑origin requests from the dashboard are limited to `http://localhost:3001`.

Docker is reached through the socket in `DOCKER_HOST`, else `~/.docker/run/docker.sock` (Docker Desktop on macOS), else `/var/run/docker.sock`. Containers are matched to services by the `com.docker.compose.project` label, which equals the service folder name.

## Configuration

All env vars live in `apps/api/.env`. See `apps/api/.env.example` for the complete list with comments.

The API stores its data in PostgreSQL. `DATABASE_URL` defaults to
`postgres://stackpilot:stackpilot@127.0.0.1:5432/stackpilot`, matching the
`postgres` service in the repo-root `docker-compose.yml`. Migrations in
`apps/api/migrations` run automatically on startup.

## Sidebar and service pages

The sidebar lists every row of the `services` table under a **Services** group, in `sort_order`, each with its icon and a live status dot. Overview, All services, AI Assistant and Settings are fixed items. Add, edit, delete and reorder in Settings invalidate the same React Query cache the sidebar reads, so it updates immediately without a reload.

`/services/[id]` shows the service card with Start/Stop/Restart, live logs (inline), and the integration panel when the service has one. Jenkins, SonarQube and Ollama are ordinary services with an integration set; there are no dedicated pages for them.

## Commands and shell mode

By default a custom command is split into arguments and run with `execFile`, with no shell, in the service `working_dir`. Turn on **Run in shell** (`run_in_shell`) to run it as `/bin/zsh -i -c "<command>"` instead, so aliases and functions from `~/.zshrc` work. In shell mode the command runs **exactly as typed** (pipes, redirects and expansions are interpreted by zsh), and the form shows a warning saying so. For compose services, a start/stop/restart command is only used when shell mode is on; otherwise `docker compose` is used.

Shell-mode commands time out after 120 s. Every start, stop, restart and test run is recorded in `service_runs` (the audit log) with the exact invocation, mode, result and output. The **Test** button next to each command runs it in the same mode and shows the output.

## Integrations

Each service has an `integration`: `none`, `jenkins`, `sonarqube`, `ollama` or `generic_http`. The form shows only the fields that integration needs:

| Integration | Fields |
|---|---|
| jenkins | base URL, username, API token |
| sonarqube | base URL, token |
| ollama | base URL |
| generic_http | base URL, optional header name and value |
| none | nothing |

Non-secret settings live on the `services` row (`integration_url`, `integration_user`, `integration_header`). Secrets (API token, header value) live in `service_credentials`, encrypted with AES-256-GCM using a key derived from `SESSION_SECRET`. They are never returned by the API; the UI shows "Saved" with Replace and Remove. **If `SESSION_SECRET` changes, saved credentials can no longer be decrypted and must be re-entered.**

**Test connection** returns one of: connected, wrong token (401/403, or SonarQube reporting the token invalid), unreachable (connection refused, timeout, host not found) or the exact error. All integration requests use a 5 s timeout, and `localhost` in a base URL is replaced with `127.0.0.1`, which avoids `fetch failed` caused by IPv6 `::1`. Panels show the real error message instead of a generic "can't reach".

The Jenkins, SonarQube and Ollama clients read their settings from the service, not from `.env`. On first start after upgrading, `JENKINS_URL`/`JENKINS_USER`/`JENKINS_API_TOKEN`, `SONAR_URL`/`SONAR_TOKEN` and `OLLAMA_URL` from `.env` are imported once into the first service whose id or name contains `jenkins`, `sonar` or `ollama` (tracked by `integration_env_import:*` keys in `settings`). If no such service exists yet, the import is retried on the next start. The `.env` entries can then be removed.

## Data persistence

Services are stored in the PostgreSQL `services` table and managed exclusively through Settings. On the first API startup after this migration, the legacy `services.yaml` is imported and renamed to `services.yaml.bak`. Service folders remain on disk, while live status and metrics are read from Docker on every request. Compose services use Docker Compose; custom services use validated argument-array commands with no shell unless **Run in shell** is on (see below).

The database is PostgreSQL. Migrations in `apps/api/migrations` run on every start, so they must stay idempotent.

## Accessibility

- All `<button>` and `<a>` elements have accessible names.
- Icon buttons carry `aria-label`.
- Toggles and pills use `aria-pressed`.
- Active nav item has `aria-current="page"`.
- Text contrast ≥ 4.5:1 in all themes.