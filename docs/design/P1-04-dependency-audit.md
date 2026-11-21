# Design — P1 #4: Dependency audit

## What will change
- Run `pnpm audit --audit-level high` in `dashboard/` to find fixable HIGH/CRITICAL
  dependency advisories (the last open item in `docs/audit-plan.md`).
- If there are findings, apply the smallest safe fixes (version bumps or pnpm
  overrides), refresh the lockfile, and re-run the audit until clean. Any package
  installation is approval-gated — pause before running `pnpm install`/`audit --fix`.
- Mark the final audit-plan row complete and move the backlog item to the changelog.

## Files touched
- `dashboard/package.json`, `dashboard/pnpm-lock.yaml`, and any affected
  `dashboard/apps/*/package.json` (only if fixes are needed)
- `docs/audit-plan.md`, `docs/backlog.md`, `docs/CHANGELOG.md`
- This design note

## Verification
- `pnpm audit --audit-level high` exits 0 with no HIGH/CRITICAL advisories.
- `pnpm typecheck` and `pnpm test` still pass after any dependency changes.
- No secrets or credential values are printed or committed.
