# Design — J4: Verify the Android builds

## What will change
- No source changes. Run two existing Jenkins jobs **one at a time** to confirm the
  Gradle/NDK fixes (`af4ac91` heap cap, `f42feaf` `GRADLE_USER_HOME`, J1 NDK bake)
  actually produce an APK:
  1. `JobTrigger-frontend-CI` — stage `Build Debug APK`
     (`flutter build apk --debug`). Prior builds `#1` and `#2` are both `ABORTED`.
  2. `JobTrigger-release-CD` — stage `Build Android APK (release, debug-signed)`.
     Prior builds are `ABORTED`/`FAILURE`.
- Parameters: `BUILD_IOS=false`, `ENVIRONMENT=dev`, `BRANCH=develop` (job defaults),
  `GIT_REPO_URL` left at its configured default. Keeping iOS off avoids the
  macOS/Xcode agent; `dev` avoids the prod approval gate.
- Authentication: Jenkins requires sign-in and no local token is available. Use
  the signed-in session in the Review-pane browser — the user signs in there; no
  credentials are typed into chat, logged, or committed.
- Resource use: each Flutter build is ~4.5 GB. Run sequentially, wait for each to
  finish, and never start the second until the first is done. `df` shows ~161 GB
  free, so one build at a time is safe.

## Files touched
- Jenkins runtime artifacts only: `jenkins_home/jobs/.../builds/` and workspaces.
- `docs/design/J4-verify-android-builds.md` (this note), `docs/backlog.md`,
  `docs/CHANGELOG.md`.

## Verification
- Read each build's console output; confirm the Android build stage completes and
  an APK artifact is produced. Record build number and result.
- If a build fails, capture the failing stage and log line, then open a follow-up
  backlog item rather than guessing a fix in this item.
- No service is stopped or removed; no secrets printed or committed.
