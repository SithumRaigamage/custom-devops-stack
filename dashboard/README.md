# StackPilot

A local, single-user dashboard for a custom DevOps stack. It shows the health, CPU and
memory of the services stored in PostgreSQL, lets you start/stop/restart them
and read their logs, and keeps its own data (admin account, sessions, settings) in
PostgreSQL.

Service actions use the global operator commands from the workspace shell configuration
(`jenkins-start`, `sonar-start`, and `webui start`, with matching stop commands). This
preserves image loading, environment checks, and MongoDB handling defined by those
commands. Restart runs stop followed by start. The dashboard's log viewer still reads
Docker logs directly, and Open opens the configured service URL.

- `apps/api` — Fastify + TypeScript API on `http://127.0.0.1:4000`
- `apps/web` — Next.js 16 dashboard on `http://localhost:3001`
- `docker-compose.yml` — PostgreSQL 16 for the dashboard API
- PostgreSQL `services` table — inventory of Compose and custom services to manage

## Prerequisites

- Node.js 20 or newer (this repo was developed on Node 24)
- pnpm 9 or newer (`corepack enable` is enough)
- Docker Desktop (or another Docker daemon) running
  - Powers PostgreSQL
  - Powers the stacks you want to see in the dashboard

## Development setup

### 1. Install dependencies

```bash
pnpm install
```

If pnpm reports `ERR_PNPM_IGNORED_BUILDS` for `argon2`, `esbuild` or `cpu-features`,
approve them once with:

```bash
pnpm approve-builds
```

`argon2` is a native module, so it must be allowed to build.

### 2. Start PostgreSQL

From the repository root:

```bash
docker compose up -d postgres
docker compose ps
```

Wait for `stackpilot-postgres` to report `healthy`. The container listens on
`127.0.0.1:5432` and stores data in the `stackpilot-pgdata` volume.

### 3. Create the API environment file

```bash
cp apps/api/.env.example apps/api/.env
```

Set a real session secret:

```bash
openssl rand -hex 32
```

and put the result in `SESSION_SECRET`. The default values in `.env.example` already
match the Compose database:

```dotenv
DATABASE_URL=postgres://stackpilot:stackpilot@127.0.0.1:5432/stackpilot
STACK_ROOT=.
```

Change `DATABASE_URL` only if you use different `POSTGRES_USER`, `POSTGRES_PASSWORD`,
`POSTGRES_DB` or host settings for the Compose service.

### 4. Manage services in Settings

Use **Settings → Manage services** to add, edit, test, delete, and reorder services.
The first API startup imports the legacy `services.yaml` and renames it to
`services.yaml.bak`; after that, service changes are database-backed and require no
file edits or restart. Compose services use Docker Compose, while custom services use
validated argument-array commands without a shell.

### 5. Run the app

```bash
pnpm dev
```

This starts the API and the web app together (the API uses `tsx watch`, the web app
Next's dev server). To run them separately:

```bash
pnpm --filter api dev     # http://127.0.0.1:4000
pnpm --filter web dev     # http://localhost:3001
```

### 6. Create the admin account

Open <http://localhost:3001>. With no users in the database you are redirected to
`/setup`; choose a username and a password of at least 12 characters. You are then sent
to `/login`. Future visits go straight to the dashboard.

## URLs

| What | URL |
|---|---|
| Dashboard | http://localhost:3001 |
| API | http://127.0.0.1:4000 |
| API health | http://127.0.0.1:4000/api/health |
| PostgreSQL | 127.0.0.1:5432 |

The dashboard calls `/api/*` on its own origin; `apps/web/next.config.mjs` rewrites that
to the API on port 4000, so the session cookie stays first-party.

## Useful commands

| Command | What it does |
|---|---|
| `pnpm dev` | Run API and web together |
| `pnpm --filter api typecheck` | Type-check the API |
| `pnpm --filter web typecheck` | Type-check the web app |
| `pnpm --filter web build` | Production build of the dashboard |
| `docker compose up -d postgres` | Start the database |
| `docker compose logs -f postgres` | Follow database logs |
| `docker compose down` | Stop the database (keeps its volume) |
| `docker compose down -v` | Stop the database **and delete all its data** |

## Resetting the database

Migrations in `apps/api/migrations` run automatically on API startup, so an empty
database is initialised for you.

- Keep the database, remove the admin so `/setup` appears again:
  ```bash
  docker exec stackpilot-postgres psql -U stackpilot -d stackpilot -c 'TRUNCATE users CASCADE;'
  ```
- Delete everything and start over:
  ```bash
  docker compose down -v
  docker compose up -d postgres
  ```

## Troubleshooting

**`503 {"error":"docker_unavailable"}` on the dashboard**

Docker is not reachable. Start Docker Desktop and reload. The API looks for the socket
in this order: `DOCKER_HOST`, then `~/.docker/run/docker.sock` (Docker Desktop on
macOS), then `/var/run/docker.sock`.

**API exits with "PostgreSQL is unavailable"**

Start the container (`docker compose up -d postgres`) and check that `DATABASE_URL`
points at it. If you changed the Compose credentials, update both sides.

**Port already in use**

The API requires `HOST` to be `127.0.0.1` or `localhost`. Use `PORT` to move the API, but
also update the rewrite target in `apps/web/next.config.mjs`. For the web app, change
the port in `apps/web/package.json` and add the new origin to `ALLOWED_ORIGINS` in
`apps/api/src/server.ts`.

**Login loop after changing the database**

The session cookie refers to a row in `sessions`. After wiping the database, sign in
again (or visit `/setup` if there is no admin).
