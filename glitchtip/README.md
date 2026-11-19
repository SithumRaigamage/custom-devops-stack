# Error tracking (GlitchTip)

Self-hosted error and crash reporting. GlitchTip accepts the Sentry SDKs, so apps
use `sentry_flutter`, `@sentry/nextjs` or `@sentry/node` with a GlitchTip DSN.
First user: JobTrigger (app, website, backend).

| | |
|---|---|
| UI | http://localhost:3005 (create your account on first visit, then turn sign-up off) |
| Ingest | the DSN of each project (Settings → Projects → Client Keys) |
| Database | `glitchtip` in the general Postgres (`postgres/`, `stack-postgres`, port 5433) |
| Uploads | `./glitchtip/data/uploads` (source maps; git-ignored) |
| Backups | Database included in `make backup` (`pg_dumpall` of `stack-postgres`) |
| Memory limit | 512 MB |

Runs GlitchTip 6 in **all-in-one mode** (web server and background worker in one
container) with **no Valkey/Redis**: GlitchTip keeps its cache, tasks and sessions in
Postgres. That costs some speed but saves a container and memory on this Mac, which
is the right trade for a lab. For a busy production instance, add Valkey and set
`VALKEY_URL`.

## Start and stop

```bash
make bootstrap                    # first time: creates glitchtip/.env with generated secrets
make up S="postgres glitchtip"    # starts Postgres, creates the glitchtip role + DB, starts GlitchTip
make logs S=glitchtip
make down S=glitchtip
```

`scripts/stack.sh up glitchtip` runs `glitchtip/scripts/init-db.sh` first. It is
idempotent: it creates the `glitchtip` role and database if missing and keeps the
role's password in sync with `glitchtip/.env`. The first start runs GlitchTip's
database migrations, so give it a minute or two before the health check turns green.

**Start Mailpit too** (`make up S="postgres mailpit glitchtip"`). GlitchTip
sends a verification email when you sign up, and with the default
`GLITCHTIP_EMAIL_URL` that goes to Mailpit: if Mailpit isn't running, sign-up
fails with "Internal Server Error" (`Name or service not known` in
`make logs S=glitchtip`). Open the email at http://localhost:8025 to verify.
To skip email entirely, set `GLITCHTIP_EMAIL_URL=consolemail://` in
`glitchtip/.env` (emails are printed to the GlitchTip log instead).

## First setup

1. Open http://localhost:3005 and create your account.
2. Set `GLITCHTIP_ENABLE_REGISTRATION=false` in `glitchtip/.env`, then
   `make down S=glitchtip && make up S=glitchtip`.
3. Create an organization, then a team (a project can't be created without one).
4. Create one project per app. For JobTrigger: `jobtrigger-app` (Flutter),
   `jobtrigger-web` (Next.js), `jobtrigger-backend` (Node).
5. Copy each project's DSN into that app's own `.env`. Never commit a DSN.

## Reaching it from an iPhone (development)

`localhost` on the phone means the phone itself. For a JobTrigger build running on
an iPhone, on your Wi-Fi or with the Mac on the iPhone's Personal Hotspot:

1. In `glitchtip/.env`: `GLITCHTIP_BIND=0.0.0.0`. Keep
   `GLITCHTIP_DOMAIN=http://localhost:3005`, since you use the web UI on the Mac.
   Restart GlitchTip.
2. Copy the app project's DSN as it is (it says `localhost`) and run
   `SENTRY_DSN_APP=<that DSN> scripts/run-on-iphone.sh` from the JobTrigger repo.
   The script swaps `localhost` for the Mac's current address, so the same DSN
   works on home Wi-Fi and on the hotspot.

Put it back to `127.0.0.1` when you're done. That binding exposes GlitchTip to the
whole network the Mac is on.

## Privacy

Apps must scrub events before sending them: no tokens, passwords, cookies,
`Authorization` headers, request bodies or URL query strings. GlitchTip stores
whatever it receives. Events are deleted after `GLITCHTIP_EVENT_DAYS` (30 by default).

## Configuration (`.env`)

| Variable | Default | Purpose |
|---|---|---|
| GLITCHTIP_SECRET_KEY | generated | Django secret key |
| GLITCHTIP_DB_PASSWORD | generated | Password of the `glitchtip` Postgres role |
| GLITCHTIP_DB_USER / GLITCHTIP_DB_NAME | glitchtip / glitchtip | Role and database |
| GLITCHTIP_DB_HOST / GLITCHTIP_DB_PORT | host.docker.internal / 5433 | Where the general Postgres is published |
| GLITCHTIP_PORT | 3005 | Host port |
| GLITCHTIP_BIND | 127.0.0.1 | Host interface |
| GLITCHTIP_DOMAIN | http://localhost:3005 | Address used in DSNs and links |
| GLITCHTIP_EMAIL_URL | smtp://stack-mailpit:1025 | Mail transport (Mailpit in the lab) |
| GLITCHTIP_FROM_EMAIL | glitchtip@devops.local | Sender address |
| GLITCHTIP_ENABLE_REGISTRATION | true | Set false after your account exists |
| GLITCHTIP_EVENT_DAYS | 30 | Days events are kept |

## Dashboard entry
Folder `glitchtip`, port 3005, Health URL `http://localhost:3005/_health/`.
