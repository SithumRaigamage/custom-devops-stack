# Design — J6: Commit the stack's Jenkins/SonarQube changes

## What will change
- Nothing. This item was written when four stack files were uncommitted on
  `feat/dashboard`. They have since been committed by earlier items, so J6 is a
  verification-and-close item, not a code change:
  - `jenkins/CI.JenkinsFile` — `710b500` (template fixes, `--volumes-from`
    mounts, `sonar.token`, semgrep fix) and `8757da9` (J2 scanner binaries).
  - `jenkins/README.md`, `jenkins/PIPELINE_TEMPLATE.md` — `710b500`.
  - `sonarqube/docker-compose.yml` — `710b500` (heaps) and `4acffd6` (P1 #2 tag).
- The working tree is clean for all tracked files except the pre-existing
  `.DS_Store` modification, which is not part of this item and is not committed.

## Files touched
- `docs/design/J6-commit-stack-jenkins-sonarqube.md` (this note),
  `docs/backlog.md`, `docs/CHANGELOG.md`.

## Verification
- `git log -- <file>` shows each file committed on `feat/dashboard`.
- `grep` confirms the fixes are present: `--volumes-from "$(hostname)"` mounts,
  `-Dsonar.token="$SONAR_AUTH_TOKEN"`, `semgrep scan … --sarif-output`, and
  heap settings `768m / 768m / 1G` (web / CE / search).
- The pipeline template has executed successfully in this session (frontend #5,
  backend #6 Sonar analysis), confirming it compiles.
- No secret values are printed or committed.
