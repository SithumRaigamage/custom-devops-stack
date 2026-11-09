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
├── services.yaml # Docker Compose folders (Jenkins, SonarQube, Open WebUI, Ollama)
└── .env          # local env vars (gitignored)
```

## Stack details

| Component | Tech | Port | Purpose |
|---|---|---|---|
| **API** | Fastify + TypeScript | 4000 | `/api/services`, `/api/services/:id/:action`, `/api/services/:id/logs` |
| **Dashboard** | Next.js 16 + Tailwind + shadcn/ui | 3001 | All seven pages: Overview, Services, Jenkins, SonarQube, Ollama, AI Assistant, Settings |
| **PostgreSQL** | Docker (`postgres:16-alpine`) | 5432 | Users, sessions and dashboard tables (auth, settings, metrics, assistant history) |
| **Docker Compose** | docker compose | per-service | Jenkins, SonarQube, Open WebUI, Ollama each live in their own folder listed in `services.yaml` |
| **LLM runtime** | Ollama | 11434 | Serves local models (e.g. `gpt-oss:20b`) |

## Phases A-E (checklist)

| Phase | Goal |
|---|---|
| **A** | Scaffold the monorepo; add `apps/api` (Fastify) and `apps/web` (Next.js) with shared Tailwind/shadcn/ui config. |
| **B** | Build the seven dashboard pages (Overview, Services, Jenkins, SonarQube, Ollama, AI Assistant, Settings) matching `docs/design/DESIGN.md`. |
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

## Data persistence

Each service's Docker Compose state lives in its own folder (`services.yaml`). The dashboard keeps its own data (admin account, sessions, settings, metrics and assistant history) in the PostgreSQL container; live service status and metrics are read from Docker on every request.

## Accessibility

- All `<button>` and `<a>` elements have accessible names.
- Icon buttons carry `aria-label`.
- Toggles and pills use `aria-pressed`.
- Active nav item has `aria-current="page"`.
- Text contrast ≥ 4.5:1 in all themes.