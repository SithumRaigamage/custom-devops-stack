# Design — P1 #3: Test a restore

## What will change
- No production data is touched. Every restore is verified on a copy:
  - **Integrity first:** `shasum -a 256 -c SHA256SUMS` in both backup archives.
  - **Jenkins archive:** extract `20261121-163059/jenkins_home.tar.gz` into a scratch
    directory under the approved temp path; confirm config, jobs, credentials,
    plugins and build histories are present and well-formed, and compare the file
    inventory with the live `jenkins/jenkins_home`.
  - **Dashboard DB dump:** restore `20261112-124004/stackpilot.sql.gz` into a
    disposable Postgres 16 container with an empty database (never into
    `stackpilot-postgres`), then query table/row counts to prove the data loaded.
- Remove only the scratch directory and scratch container created by this test.
- Update `make restore-help` if the test exposes a gap; record results in the changelog.

## Files touched
- `scripts/backup.sh` only if a restore-help correction is needed
- `docs/backlog.md`, `docs/CHANGELOG.md` (item closes on completion)
- This design note

## Verification
- Both `SHA256SUMS` checks pass.
- Jenkins scratch copy contains the expected key files; XML parses; inventory is
  comparable to live data.
- Scratch Postgres reports a non-empty table set and row counts after restore.
- Live `jenkins/jenkins_home`, `stackpilot-postgres` and all running services are
  unchanged; confirm with `make status`.
- No secrets, dump contents or credential values are printed.
