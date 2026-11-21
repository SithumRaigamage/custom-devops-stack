# Design — P1 #5: Run the full API test suite

## What will change
- No source changes expected. Run `pnpm --filter api test` in `dashboard/` (the
  suite that includes the new audit and log tests). If a test fails, investigate
  and fix the underlying issue before closing this item.

## Files touched
- Only if a test exposes a defect: the relevant `dashboard/apps/api/src` file
- `docs/backlog.md`, `docs/CHANGELOG.md` (item closes on completion)
- This design note

## Verification
- `pnpm --filter api test` exits 0; record the number of test files and tests.
- No secrets or credential values are printed or committed.
