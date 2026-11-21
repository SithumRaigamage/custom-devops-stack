# Design — J5: Fix the Jenkins `sonarqube-token` 401

## What will change
- No source changes. The `sonarqube/.env` token is **valid** (SonarQube
  `/api/authentication/validate` → HTTP 200, `{"valid":true}`), but the Jenkins
  credential with ID `sonarqube-token` is **invalid** (same endpoint called from
  a read-only Jenkins Script Console check → `{"valid":false}`). This is the
  cause of backend #5's `HTTP 401 Unauthorized` in `compileFlutterBuildRelease`…
  more precisely, in the SonarScanner step: `Failed to query server version:
  GET http://sonarqube:9000/api/v2/analysis/version failed with HTTP 401`.
- Replace the value of the existing Jenkins `StringCredentialsImpl` credential
  `sonarqube-token` with the already-valid token from `sonarqube/.env`. Keep the
  same credential ID, scope and description so no pipeline needs editing.
- Do **not** generate a new SonarQube token: the existing one is valid and does
  not appear in any Jenkins build log (checked: zero occurrences of its exact
  value across all build logs). Generating another would create an extra secret
  to store without fixing anything. Least-privilege separation stays as J14.
- Re-run the backend job with `SONARQUBE_SCAN=true` (and `SEND_EMAIL=false`) to
  verify the scanner authenticates and the job passes.

## Files touched
- Jenkins runtime credential store only (`jenkins_home/credentials.xml`, written
  by Jenkins itself through its credentials API — never hand-edited).
- `docs/design/J5-sonarqube-token-credential.md` (this note), `docs/backlog.md`,
  `docs/CHANGELOG.md`.

## Secret handling
- The token value is read from gitignored `sonarqube/.env` into a shell variable
  and copied to a single temporary file with mode 600. It is never echoed, put
  in a command line, pasted into chat, or written to any tracked file.
- A read-only Groovy snippet in Jenkins' authenticated Script Console reads that
  file, updates the credential through the credentials store API, and prints
  only `UPDATED` — never the value.
- The temporary file is deleted from both the Jenkins container and the host
  immediately after the update; its removal is verified.

## Approval gate
- Updating a Jenkins credential is a credential change (CLAUDE.md approval
  gate). Ask before doing it; no rotation/revocation is planned.

## Verification
- Re-run the read-only validate check from the Jenkins Script Console: expect
  HTTP 200 and `{"valid":true}`.
- Re-run `JobTrigger-backend-CI` on `docs/product-proposals-phase-26` with
  `SONARQUBE_SCAN=true`, `ENVIRONMENT=dev`, `SEND_EMAIL=false`; expect the Sonar
  analysis stage to run without 401 and the build to end `SUCCESS`.
- Confirm `sonarqube/.env` is unchanged and no secret value appears in the
  report, commit, or docs.
