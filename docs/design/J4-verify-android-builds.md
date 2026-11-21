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

## Observed results and follow-up fix (2026-11-21)
- Build #3 (`BRANCH=develop`) hung in `dart run build_runner` when all outputs
  were cached/skipped: both Dart processes in `futex_do_wait`, no output for
  21 min. Aborted; the leaked build container was stopped and removed.
- Build #4 (`BRANCH=docs/product-proposals-phase-26`, stale
  `JobTrigger-Frontend/.dart_tool/build` cache deleted first) got past code
  generation in 29 s, downloaded the NDK, installed SDK platforms, and reached
  `flutter build apk --debug` → `assembleDebug`. After 908.7 s Docker OOM-killed
  the container (`oom` event on `youthful_taussig`): Gradle (`-Xmx3g`) plus two
  Kotlin daemons (`-Xmx3g` each) exceeded the ~10.6 GB Docker limit. Result FAILURE.
- Fix to apply in JobTrigger's `docs/product-proposals-phase-26` worktree: in
  the `flutter()` helper's generated `~/.gradle/gradle.properties`, lower Gradle
  to `org.gradle.jvmargs=-Xmx2g -XX:MaxMetaspaceSize=768m
  -XX:+HeapDumpOnOutOfMemoryError` and add `kotlin.daemon.jvmargs=-Xmx1g` so the
  two Kotlin daemons are capped too. All **six** helpers (backend, frontend,
  release, security, tools, website) must stay byte-identical, per J1.
- Pushing the feature branch to GitHub is required for Jenkins to fetch the fix;
  that is a separate, explicit approval gate. Retry both builds afterwards with
  `SEND_EMAIL=false` to avoid duplicate failure emails.

## Final outcome (2026-11-21)
- Heap cap committed as `752e11a` (JobTrigger) and pushed to the feature branch;
  both builds re-run with `SEND_EMAIL=false` and `BRANCH=docs/product-proposals-phase-26`.
- **Debug — PASS** (`JobTrigger-frontend-CI #5`, 966536 ms): `build_runner` finished
  in 31 s, `assembleDebug` completed, `✓ Built …/app-debug.apk`. The 187 MB APK is
  archived under `builds/5/archive/…/flutter-apk/app-debug.apk`
  (sha256 `ee9f2e2c135c8c5c0beccd2ef1e422cef2671f152820121097c16b181c71190b`).
  No OOM: the Gradle/Kotlin heap cap works. Note the earlier cached-output hang
  (#3) did not recur once the stale `.dart_tool/build` cache was cleared.
- **Release — FAIL** (`JobTrigger-release-CD #5` at 594.6 s and retry `#6` at
  ~56 s into `assembleRelease`): the Dart 3.13.7 VM aborts with
  `../../runtime/bin/file_linux.cc: 492: error: Unexpected EINTR errno` inside
  `dart::bin::File::Copy`, exit 134 / SIGABRT, on `compileFlutterBuildRelease`.
  No Docker `oom` event fired, so this is not a memory problem and is distinct
  from the #4 debug OOM. Two identical failures make a transient signal unlikely;
  it is reproducible under the amd64/qemu emulation of `jobtrigger-flutter`.
- J4 is closed as **verified, partially passing**: the Gradle/NDK/heap fixes are
  proven by the debug APK. The release-only Dart `File::Copy` EINTR crash is a
  new, separate problem and is tracked as follow-up item **J11**.
