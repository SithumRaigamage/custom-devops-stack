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
├── services.yaml # Docker Compose folders (Jenkins, SonarQube, Open WebUI, Ollama)
└── .env          # local env vars (gitignored)
```

## Stack details

| Component | Tech | Port | Purpose |
|---|---|---|---|
| **API** | Fastify + TypeScript | 4000 | `/api/services`, `/api/services/:id/:action`, `/api/services/:id/logs` |
| **Dashboard** | Next.js 16 + Tailwind + shadcn/ui | 3001 | All seven pages: Overview, Services, Jenkins, SonarQube, Ollama, AI Assistant, Settings |
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
| `/api/services` | GET | `{ id, name, folder, composeFile, url, status: "healthy"\|"unhealthy"\|"stopped" }[]` |
| `/api/services/:id/:action` | POST | `{ id, action, ok, error?, output? }` — start/stop/restart |
| `/api/services/:id/logs` | GET | `{ id, tail, logs }` — docker compose logs |
| `/api/services/:id/health` | GET (implicit via status) | healthy/unhealthy/stopped |

## Local development

```bash
# API
cd apps/api
pnpm dev          # runs tsx watch src/server.ts

# Dashboard
cd apps/web
pnpm dev          # runs next dev on http://localhost:3001
```

The API refuses to start if `HOST` is not `127.0.0.1` or `localhost`. All cross‑origin requests from the dashboard are limited to `http://localhost:3001`.

## Configuration

All env vars live in `apps/api/.env`. See `apps/api/.env.example` for the complete list with comments.

## Data persistence

Each service's Docker Compose state lives in its own folder (`services.yaml`). The dashboard never stores data server‑side; it only reflects the live Docker/container state.

## Accessibility

- All `<button>` and `<a>` elements have accessible names.
- Icon buttons carry `aria-label`.
- Toggles and pills use `aria-pressed`.
- Active nav item has `aria-current="page"`.
- Text contrast ≥ 4.5:1 in all themes.