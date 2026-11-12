# Analytics (Umami)

Self-hosted, cookie-free product analytics: page views and custom events
(e.g. `paywall_view`, `trial_start`). First user: JobTrigger.

| | |
|---|---|
| UI | http://localhost:3004 (first login `admin` / `umami`; **change it at once**) |
| Event API | `POST http://localhost:3004/api/send` |
| Database | `umami` in the general Postgres (`postgres/`, `stack-postgres`, port 5433) |
| Backups | Included in `make backup` (`pg_dumpall` of `stack-postgres`) |
| Memory limit | 512 MB |

Reuses the stack's Postgres instead of running its own, to save memory on this Mac.

## Start and stop

```bash
make bootstrap                    # first time: creates analytics/.env with generated secrets
make up S="postgres analytics"    # starts Postgres, creates the umami role + DB, starts Umami
make logs S=analytics
make down S=analytics
```

`scripts/stack.sh up analytics` runs `analytics/scripts/init-db.sh` first. It is
idempotent: it creates the `umami` role and database if missing and keeps the role's
password in sync with `analytics/.env`. Run it alone with `analytics/scripts/init-db.sh`.

## Sending events

1. In the UI: Settings → Websites → Add website (one per app, e.g. "JobTrigger app",
   "JobTrigger web"). Copy each **Website ID**.
2. Send events from a **server** (backend or a Next.js server action), not a browser
   script, so no tracker script or CSP change is needed:

```bash
curl -s http://localhost:3004/api/send \
  -H 'Content-Type: application/json' \
  -H 'User-Agent: Mozilla/5.0 (JobTrigger dev)' \
  -d '{"type":"event","payload":{"website":"<website-id>","hostname":"app.jobtrigger.local","url":"/paywall","name":"paywall_view","data":{"reason":"maxCredentialsTotal"}}}'
```

Umami drops requests without a browser-like `User-Agent` (bot filter). Never put
emails, tokens or server URLs in `data`.

To let a phone on the same Wi-Fi send events directly, set `UMAMI_BIND=0.0.0.0`
and use the Mac's Wi-Fi address (`ipconfig getifaddr en0`).

## Configuration (`.env`)

| Variable | Default | Purpose |
|---|---|---|
| UMAMI_APP_SECRET | generated | Session signing secret |
| UMAMI_DB_PASSWORD | generated | Password of the `umami` Postgres role |
| UMAMI_DB_USER / UMAMI_DB_NAME | umami / umami | Role and database |
| UMAMI_DB_HOST / UMAMI_DB_PORT | host.docker.internal / 5433 | Where the general Postgres is published |
| UMAMI_PORT | 3004 | Host port |
| UMAMI_BIND | 127.0.0.1 | Host interface |

## Dashboard entry
Folder `analytics`, port 3004, Health URL `http://localhost:3004/api/heartbeat`.
