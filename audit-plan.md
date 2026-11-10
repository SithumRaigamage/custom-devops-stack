# API Hardening Audit Plan

## Phase 1: Inspect & Analyze (Complete)

**Scope**: `dashboard/apps/api` — Fastify server powering the StackPilot dashboard

### Current State

| Requirement | Status | Notes |
|---|---|---|
| Bind to 127.0.0.1 only | ✅ Done | `server.ts:67` hardcodes `HOST = "127.0.0.1"` |
| @fastify/helmet headers | ❌ Missing | Only cors + rate-limit registered |
| CORS off (same-origin proxy) | ❌ Not done | `@fastify/cors` registered with `ALLOWED_ORIGIN` |
| Zod validation on all params/query/body | ⚠️ Partial | Some routes validate; no strict unknown rejection |
| execFile with arrays (no shell) | ✅ Done | `compose.ts`, `housekeeping.ts` use `execFileAsync` |
| IDs checked vs services.yaml | ✅ Done | `loadServices().find(...)` in routes |
| Paths resolved inside STACK_ROOT | ✅ Done | `registry.ts:resolveServiceFolder` validates |
| Secrets redacted in logs | ❌ Missing | Pino logger has no redaction; secrets in .env |
| Secrets never in responses | ✅ Done | `publicSettings()` strips webhook/token |
| Rate limit: login 5/min | ✅ Done | Per-route config on `/auth/login` |
| Rate limit: actions 30/min | ❌ Missing | Not on mutating routes |
| Rate limit: assistant 10/min | ❌ Missing | Not on `/assistant/chat` |
| Assistant read-only + tail/size limits | ⚠️ Partial | 8000 char message limit; no tool use |
| Audit entry per state change | ⚠️ Partial | Only compose actions log to activity |
| Audit tab on Settings page | ❌ Missing | Activity page exists; no filterable audit |
| pnpm audit fix high/critical | ⏳ Pending | Not yet run |

### Confirmed Findings vs Assumptions

- **Confirmed**: Server already binds to 127.0.0.1; execFile used everywhere; path validation in registry; secrets stripped from responses
- **Assumed**: All child processes use execFile — verified in compose.ts, housekeeping.ts, docker.ts
- **Confirmed missing**: Helmet, CORS removal, zod strict validation, pino redaction, action/assistant rate limits, full audit logging, Audit tab

---

## Phase 3: Migration Plan

| Current Path | Proposed Change | Reason | Confidence | Risk |
|---|---|---|---|---|
| `package.json` deps | Add `@fastify/helmet`, remove `@fastify/cors` | Security headers; same-origin proxy | High | Low |
| `server.ts` | Register helmet; remove cors; add pino redact | Harden transport; prevent secret leaks | High | Low |
| `config.ts` | Fix HOST export to use validated value | Ensure 127.0.0.1 binding enforced | High | Low |
| All route handlers | Add zod schemas for params/query/body with `.strict()` | Reject unknown keys; validate all input | High | Medium |
| `server.ts` rateLimit | Add per-route limits: actions 30/min, assistant 10/min | Prevent abuse on mutating/expensive endpoints | High | Low |
| `events.ts` recordActivity | Call from all state-changing routes | Complete audit trail | High | Medium |
| `activity.ts` | Add `/api/activity` filters (kind, actor, service, time) | Enable Audit tab filtering | High | Low |
| `settings.ts` | Add audit kind constants | Consistency | Medium | Low |
| Web: `settings/page.tsx` | Add Audit tab with filters | UI for audit trail | High | Medium |
| Web: `api.ts` | Add `fetchActivity` with filters | API support | High | Low |
| Web: `use-activity.ts` | Hook for filtered activity | React integration | High | Low |
| Run `pnpm audit` | Fix high/critical in api + web | Dependency hygiene | High | Low |

### Conflicts / Clarifications Needed

- None identified — all changes are additive or replacements within authorized scope

### Files to Preserve

- `.env` (secrets), `.env.example`, `services.yaml`, `migrations/`, `dist/` (will rebuild)

### Proposed Deletions

- None — only additions and modifications

---

## Phase 4: Approval Gate

**Awaiting explicit approval to proceed with Phase 5 execution.**

---

## Phase 5 & 6: Execution & Verification (Pending Approval)

Will execute approved changes in order:
1. Update package.json (helmet, remove cors)
2. Harden server.ts (helmet, pino redact, route validation, rate limits)
3. Add zod schemas to all routes
4. Extend activity logging to all mutating endpoints
5. Add filtered activity endpoint
6. Build Audit tab in web Settings page
7. Run `pnpm audit` and fix high/critical
8. Build + typecheck both apps
9. Verify no regressions

---

**Approval status**: ❌ Not approved — awaiting user confirmation