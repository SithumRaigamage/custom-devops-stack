# Design — J8: Revoke the shared Jenkins API token

## What will change
- Revoke the single Jenkins API token named `jobTrigger` (uuid
  `4acbeb66-e0a4-4664-8f0d-e9d70bbbeb0a`) on user **Sithum Raigamage**. Metadata:
  created 2026-10-28, expires 2026-11-27, last used 2026-11-19 15:43 UTC — the
  session where it was shared.
- Do **not** create a replacement now; the backlog says "create a new one when
  needed". The signed-in browser session has been used for all recent work and
  requires no token.
- Revoke through Jenkins' own API-token API via the authenticated Script Console
  so Jenkins writes its user config itself. Never print or log the token value.

## Files touched
- Jenkins runtime `jenkins_home/users/…/config.xml` and `apiTokenStats.xml`,
  written by Jenkins.
- `docs/design/J8-revoke-jenkins-api-token.md` (this note), `docs/backlog.md`,
  `docs/CHANGELOG.md`.

## Safety checks
- The dashboard's `JENKINS_API_TOKEN` in gitignored `dashboard/apps/api/.env`
  equals the `.env.example` placeholder (`mytoken`), so no live integration
  depends on the token being revoked. (Compared programmatically; value not printed.)
- No tracked config references the token name or uuid.

## Approval gate
- Revoking a token is explicitly approval-gated. Ask before acting.

## Verification
- Read-only Script Console/API check shows the user's token list is empty.
- Jenkins `/login` still returns 200 and the signed-in browser session still
  works.
- No token value appears in docs, commit, or report.

## Final outcome (2026-11-21)
- With approval, revoked the `jobTrigger` token via the Jenkins API-token store's
  `revokeToken(uuid)` through the authenticated Script Console. Store count went
  1 → 0; the user was saved explicitly so Jenkins flushed the change to disk.
- Verified on disk: `<tokenList/>` is empty and the token's uuid no longer
  appears in the user config. `/login` still returns 200 and all containers are
  unchanged. No replacement token was generated.
