---
name: dashboard-dev
description: Develop, test, and troubleshoot the StackPilot dashboard (Fastify API on 4000, Next.js web on 3001, Postgres on 5432) in custom-devops-stack. Use when the user says "dashboard", "StackPilot", "run the dashboard", "fix the API", "add an endpoint", "dashboard tests", "typecheck", "build the web app", or asks about integrations, audit rules, sessions, or credential encryption in the dashboard. Never expose SESSION_SECRET, tokens, or stored credentials; DB wipes/resets are approval-gated.
---

# Dashboard Development (StackPilot)

## When to use
- Running or debugging the dashboard locally.
- Adding/changing API routes, registry entries, integrations, or audit rules.
- Running unit tests, typecheck, or the web production build.
- Troubleshooting auth, sessions, credential encryption, or Docker/Postgres connectivity.

## Authoritative sources
- `dashboard/README.md`, `dashboard/docs/PRODUCT.md`, `dashboard/docs/design/DESIGN.md` (visual source of truth).
- `dashboard/apps/web/AGENTS.md` — read `node_modules/next/dist/docs/` before writing Next.js code.
- `dashboard/apps/api/.env.example`, `dashboard/docker-compose.yml`, `dashboard/package.json`, `dashboard/apps/api/package.json`.
- `Makefile` `dashboard`/`test`/`typecheck` targets.

## Hard rules
1. API `HOST` must be `127.0.0.1` or `localhost`; the dashboard is not internet-exposed. No CORS — web reaches API via the same-origin Next.js rewrite.
2. `SESSION_SECRET` must be at least 32 chars (`openssl rand -hex 32`). **If it changes, all encrypted service credentials become undecryptable** and must be re-entered.
3. Never print `SESSION_SECRET`, Jenkins/Sonar tokens, or values from `service_credentials`. Audit log messages name changed fields, never values — keep it that way.
4. Every new mutating route needs a matching rule in `apps/api/src/audit-rules.ts` (registered via `audit.ts` hooks).
5. Migrations in `apps/api/migrations` run on startup and must stay idempotent.
6. `TRUNCATE users CASCADE`, `docker compose down -v`, and DB wipes are destructive: approval-gated.
7. `dashboard/README.md:8-12` is stale (claims `~/.zshrc` shell functions). The DB-backed service registry in Settings is authoritative; do not rely on that text.
8. On this branch, `pnpm test` covers DB-free unit tests; check `package.json` for any `test:db`/`test:all` scripts before promising DB-backed tests.

## Steps — run locally
1. Start the DB: `make up S=dashboard-db` (or `cd dashboard && docker compose up -d postgres`), wait for `stackpilot-postgres` healthy on `127.0.0.1:5432`.
2. `cd dashboard && pnpm install`; if builds are ignored, run `pnpm approve-builds` (argon2 is native and must build).
3. `cp apps/api/.env.example apps/api/.env`; set a generated `SESSION_SECRET` and confirm `DATABASE_URL`/`STACK_ROOT`.
4. `make dashboard` (starts `dashboard-db` then `pnpm dev`), or `pnpm dev` inside `dashboard/`.
5. Open `http://localhost:3001`; on a fresh DB you are redirected to `/setup` to create the admin (password ≥12 chars). API health: `http://127.0.0.1:4000/api/health`.

## Steps — verify changes
1. `pnpm typecheck` (root; runs both apps).
2. `pnpm test` (root; DB-free unit tests).
3. `pnpm --filter web build` for the production web build.
4. If DB test scripts exist (`test:db` / `test:all`), ensure Postgres is running before invoking them.
5. Manually exercise the changed route/UI and check the audit log entry for mutating actions.

## Steps — integrations / credentials
1. Integrations are `none`, `jenkins`, `sonarqube`, `ollama`, `generic_http`; config lives on the service row, secrets in `service_credentials` encrypted via AES-256-GCM derived from `SESSION_SECRET`.
2. Test connection results: `connected`, `wrong_token`, `unreachable`, or the exact error. `localhost` base URLs are normalized to `127.0.0.1` to avoid IPv6 `fetch failed`; timeouts are 5 s.
3. `.env` integration values are imported once on first start into the first matching service, then can be removed from `.env`.
4. Custom commands run via `execFile` with no shell by default; **Run in shell** uses `/bin/zsh -i -c` and is opt-in. Compose services use `docker compose` unless shell mode is on.

## Checks
- `dashboard-db` healthy on `127.0.0.1:5432`; API health returns 200 on `127.0.0.1:4000/api/health`.
- `pnpm typecheck`, `pnpm test`, and `pnpm --filter web build` all pass.
- Mutating routes have matching `audit-rules.ts` entries.
- No secret values in code, logs, or the report; credentials still decrypt after any config change.

## Troubleshooting
- `503 {"error":"docker_unavailable"}` → start Docker; socket lookup order: `DOCKER_HOST`, `~/.docker/run/docker.sock`, `/var/run/docker.sock`.
- "PostgreSQL is unavailable" → start `dashboard-db` and check `DATABASE_URL`.
- Port conflict → API `HOST` must stay loopback; change `PORT` and the rewrite target in `apps/web/next.config.mjs`; add new origins to `ALLOWED_ORIGINS` in `server.ts`.
- Login loop after a DB wipe → sign in again or visit `/setup`.

## Output format
Report: commands run, files changed, test/typecheck/build results, audit-rule updates, and any approval needed for destructive DB operations.
