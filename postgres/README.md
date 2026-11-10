# PostgreSQL 16

Standalone `postgres:16-alpine` for lab use, separate from the dashboard's own database (`dashboard/docker-compose.yml`, port 5432).

## Setup
1. `cp .env.example .env` and set `POSTGRES_PASSWORD`.
2. `docker compose up -d`
3. Connect: `psql -h 127.0.0.1 -p 5433 -U postgres` (values from `.env`).

## Configuration (`.env`)
| Variable | Default | Purpose |
|---|---|---|
| POSTGRES_USER / PASSWORD / DB | postgres / required / postgres | Initial superuser and database (applied on first start only) |
| POSTGRES_PORT | 5433 | Host port |
| POSTGRES_BIND | 127.0.0.1 | Host interface to bind |
| POSTGRES_MAX_CONNECTIONS | 100 | `max_connections` |
| POSTGRES_SHARED_BUFFERS | 128MB | `shared_buffers` |
| POSTGRES_LOG_MIN_DURATION_MS | -1 | Slow-query logging threshold |
| POSTGRES_CONTAINER_NAME | stack-postgres | Container name |

User, password and DB changes after first start require changing them inside Postgres or removing the volume (`docker compose down -v` **deletes data**).

## Init scripts
Put `.sql`/`.sh` files in `initdb/`; they run once on an empty volume.

## Dashboard entry
Folder `postgres`, port 5433, Health URL `tcp://localhost:5433`.
