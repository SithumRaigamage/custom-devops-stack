# API Hardening Audit Plan

**Status: complete (12 Nov 2026).** Scope: `dashboard/apps/api` (Fastify) and the Settings page in `dashboard/apps/web`.

| Requirement | Status | Where |
|---|---|---|
| Bind to 127.0.0.1 only | ✅ | `server.ts` (`HOST`), `config.ts` refuses other hosts |
| @fastify/helmet headers | ✅ | `server.ts` (frameguard deny, nosniff, no-referrer, HSTS) |
| CORS off (same-origin proxy) | ✅ | `@fastify/cors` removed; foreign `Origin` on mutating requests → 403 |
| Zod validation, unknown keys rejected | ✅ | Every route has a schema; bodies and queries use `.strict()` (settings, alerts, restore, notifications tightened) |
| execFile with arrays (no shell) | ✅ | `compose.ts`, `housekeeping.ts`; shell only with per-service "Run in shell" |
| IDs checked against the registry | ✅ | `loadServices().find(...)` in routes |
| Paths resolved inside STACK_ROOT | ✅ | `registry.ts` |
| Secrets redacted in logs | ✅ | Pino `redact` paths: cookie/authorization/set-cookie headers and secret field names to two levels (`REDACT_PATHS`) |
| Secrets never in responses | ✅ | `publicSettings()`, credentials write-only |
| Rate limit: login 5/min | ✅ | `auth.ts` |
| Rate limit: actions 30/min | ✅ | `ACTION_LIMIT` on every mutating route; test notification 5/min |
| Rate limit: assistant 10/min | ✅ | `/api/assistant/chat` |
| Assistant read-only + size limits | ✅ | System prompt read-only, no tools, 8000-char message limit |
| Audit entry per state change | ✅ | `audit.ts` hooks + `audit-rules.ts` (one rule per mutating route, success and failure, never secret values) |
| Filterable audit API | ✅ | `GET /api/activity` (kind/actor/service/source/outcome/from/to/q, cursor paging), `GET /api/activity/facets` |
| Audit tab on Settings page | ✅ | `components/AuditLog.tsx`, `/settings?tab=audit`, CSV export |
| pnpm audit fix high/critical | ⏳ | Run on the Mac (needs network): `pnpm audit --audit-level high`, then `pnpm audit --fix` |

Tests: `src/audit.test.ts` covers the rules (no secrets in messages, failure wording, clipping) and the SQL filter builder (parameter binding, LIKE escaping).
