# Design — J9: Optional JobTrigger setup

## Decisions (2026-11-21)
This backlog item bundles four optional configuration/decision points. After
inspecting the current state, you chose:

1. **`CI_RECEIVER_EMAIL` — set it.** You supplied a dedicated receiver address.
   It will be added as a Jenkins *global environment property* so all six
   JobTrigger Jenkinsfiles pick it up via `env.CI_RECEIVER_EMAIL` instead of
   falling back to `SMTP_USER` (the sender). The address is a plain config
   value, not a secret; it lives only in gitignored `jenkins_home/config.xml`
   and is not repeated in committed docs.
2. **`codecov-token` / `UPLOAD_CODECOV` — defer.** No Codecov token exists
   locally and the parameter defaults to `false`. Leave the option available
   but unused; add the credential later if coverage uploads are wanted.
3. **`macos` agent / `BUILD_IOS` — defer.** No Jenkins agents are configured
   and the parameter defaults to `false`. Setting up an inbound macOS agent
   with Xcode/CocoaPods is not needed now.
4. **`trivy fs` license findings — accept and document.** The security job's
   result is `SUCCESS`; only the `trivy fs` stage is `UNSTABLE` because
   `@img/sharp-libvips-darwin-arm64` is classified `LGPL-3.0-or-later` /
   restricted / HIGH in `JobTrigger-Web/package-lock.json`. Keep `license` in
   `--scanners vuln,misconfig,license` so the signal stays visible. No source
   change or push.

## What will change
- Only the Jenkins global node properties, written by Jenkins through its
  Script Console (`hudson.slaves.EnvironmentVariablesNodeProperty`) and saved.
  No Jenkinsfile/source edits, no new credentials, no agents, no container
  restarts.

## Files touched
- Jenkins runtime `jenkins/jenkins_home/config.xml` (`<globalNodeProperties>`),
  written by Jenkins; the path is gitignored.
- `docs/design/J9-optional-jobtrigger-setup.md` (this note), `docs/backlog.md`,
  `docs/CHANGELOG.md`.

## Verification
- Read-only Script Console check confirms `CI_RECEIVER_EMAIL` resolves from the
  global property.
- `jenkins/jenkins_home/config.xml` contains the property in
  `<globalNodeProperties><EnvironmentVariablesNodeProperty><envVars>`.
- `/login` returns 200; no new errors in the Jenkins log; containers unchanged.
- No secret values are printed or committed; no source branches pushed.

## Final outcome (2026-11-21)
- Added `CI_RECEIVER_EMAIL` (user-supplied address) as a Jenkins global
  environment property via the authenticated Script Console, using
  `EnvironmentVariablesNodeProperty` and `Jenkins.save()`. No value was printed
  in the result or written to a tracked file.
- Verification: read-only console check → `present=true configured=true
  length=30`; gitignored `jenkins_home/config.xml` now has a
  `<globalNodeProperties>` entry with the key and value; `/login` → 200; no new
  Jenkins log errors; all three containers unchanged.
- `codecov-token` and the `macos` agent remain deliberately unset; their
  parameters (`UPLOAD_CODECOV`, `BUILD_IOS`) stay off by default. No JobTrigger
  source files were edited and nothing was pushed.
- The Trivy LGPL-3.0 finding is accepted as an informational `UNSTABLE` stage;
  security build #4 is `SUCCESS`. No scanner/ignore changes were made.
