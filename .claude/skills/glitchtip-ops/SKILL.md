---
name: glitchtip-ops
description: Set up and operate the local GlitchTip error tracker, including projects/DSNs, Mailpit email dependency, signup lockdown, retention, and iPhone testing handoff. Use when the user says "GlitchTip setup", "error reporting", "create a DSN", "signup 500", "GlitchTip logs", "crash reporting", or asks about JobTrigger error tracking in custom-devops-stack. Never print DSN keys or secret values. Use network-switch for the LAN/iPhone binding steps.
---

# GlitchTip Operations

## When to use
- First-time GlitchTip setup: account, organization, team, per-app projects.
- Sign-up/verification email failures, health checks, or event retention questions.
- Preparing a DSN for a JobTrigger app, website, or backend.

## Authoritative sources
- `glitchtip/README.md` — setup, Mailpit dependency, iPhone flow, config table.
- `glitchtip/docker-compose.yml`, `glitchtip/.env.example`, `glitchtip/scripts/init-db.sh`.
- `scripts/stack.sh` startup pre-steps (DB init + Mailpit warning).
- JobTrigger `docs/error-reporting.md` for SDK key names (read-only reference).

## Hard rules
1. Never print a DSN key, `GLITCHTIP_SECRET_KEY`, `GLITCHTIP_DB_PASSWORD`, or a verification link.
2. Keep DSNs out of git; they belong in each app's gitignored env/config.
3. GlitchTip needs the general Postgres (`postgres/`, `stack-postgres`, host 5433) and Mailpit for sign-up/alert email. Start all three together.
4. `GLITCHTIP_DOMAIN` stays `http://localhost:3005`; the DSN should stay `localhost` so the iPhone script can rewrite the host.
5. LAN exposure (`GLITCHTIP_BIND=0.0.0.0`) requires approval and must be reverted to `127.0.0.1` afterward. Hand that step to the `network-switch` skill.
6. Disable registration after the first account exists.

## Steps — first setup
1. `make up S="postgres mailpit glitchtip"` (idempotent DB init runs automatically).
2. Open `http://localhost:3005`, create your account, and verify via the email in Mailpit at `http://localhost:8025`.
3. Set `GLITCHTIP_ENABLE_REGISTRATION=false` in `glitchtip/.env`, then `make down S=glitchtip && make up S=glitchtip`.
4. Create an organization, then a team (a project cannot be created without one).
5. Create one project per app: `jobtrigger-app` (Flutter), `jobtrigger-web` (Next.js), `jobtrigger-backend` (Node).
6. Copy each project's DSN into that app's own env config. SDK keys: backend `SENTRY_DSN`, website `NEXT_PUBLIC_SENTRY_DSN`, app Dart-define `SENTRY_DSN`. Never commit values.
7. Verify with `make status` and `make logs S=glitchtip`. Health URL: `http://localhost:3005/_health/`.

## Steps — sign-up 500 / "Name or service not known"
1. Check `make logs S=glitchtip` for the DNS error.
2. Confirm Mailpit is running (`make status`, `make up S=mailpit` if needed).
3. Alternatively set `GLITCHTIP_EMAIL_URL=consolemail://` in `glitchtip/.env` to print emails to the log instead.
4. Verify a fresh sign-up works after the fix.

## Steps — retention / privacy
1. Events are deleted after `GLITCHTIP_EVENT_DAYS` (default 30).
2. Remind that apps must scrub tokens, passwords, cookies, `Authorization` headers, request bodies, and URL query strings before sending events — GlitchTip stores whatever it receives.
3. Source maps go to `glitchtip/data/uploads` (git-ignored) and are included in backups.

## iPhone handoff
Do not duplicate the binding steps here. Use the `network-switch` skill for: approval-gated `GLITCHTIP_BIND=0.0.0.0`, `SENTRY_DSN_APP=<DSN> scripts/run-on-iphone.sh` from the JobTrigger repo, verification, and reverting the bind.

## Checks
- `postgres`, `mailpit`, `glitchtip` all running.
- Health check green; registration disabled after setup.
- One project per app with a DSN stored only in gitignored app config.
- No DSN value appears in the report.

## Output format
Report: projects/SDK key names created, registration state, email dependency status, retention setting, and any approval needed.
