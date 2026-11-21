# Design — J1: Bake the Android NDK into `jobtrigger-flutter`

## What will change
- In the JobTrigger repo (`~/Personal/03-Personal-Projects/Active/JobTrigger`,
  branch `docs/product-proposals-phase-26`, HEAD `f42feaf`), add an NDK install
  to `buildFlutterImage()` in **all six** `Jenkins/<component>/Jenkinsfile`
  files. The six helper bodies are currently byte-identical; they must stay
  identical so the shared image tag `jobtrigger-flutter:3.47.8` means the same
  thing whichever job builds it.
- After the pinned Flutter SDK is checked out (so `FlutterExtension.kt` is the
  one from `FLUTTER_VERSION`), read `ndkVersion` from
  `packages/flutter_tools/gradle/src/main/kotlin/FlutterExtension.kt` rather
  than hardcoding it, and pass `ndk;<version>` to `sdkmanager`. Verified in the
  existing image: `val ndkVersion: String = "28.2.13676358"` and `sdkmanager`
  is on PATH at `/opt/android-sdk-linux/cmdline-tools/latest/bin/sdkmanager`.
- The `ndk;<v>` argument is produced by a `sed … | head -1 | xargs -r sdkmanager`
  pipeline. This avoids adding shell `$` variables to the unquoted heredoc that
  feeds the Dockerfile (the heredoc already expands `$FLUTTER_VERSION`), so the
  version is resolved at Docker build time from the checked-out SDK.
- A follow-up `find …/ndk -mindepth 1 … | grep -q .` guard fails the layer if no
  NDK was installed. The existing final `chmod -R a+rwX /opt/android-sdk-linux`
  already makes the NDK writable by the container's uid 1000.
- No changes to `jenkins/CI.JenkinsFile` (it has no Flutter/NDK code), and no
  edits to Jenkins workspace copies (generated checkouts, not source of truth).

## Files touched
- JobTrigger: `Jenkins/{backend,frontend,release,security,tools,website}/Jenkinsfile`
- Stack: `docs/design/J1-ndk-in-flutter-image.md` (this note)
- `docs/backlog.md`, `docs/CHANGELOG.md` (item closes on completion)

## Verification
- The six helper bodies hash to the same value after the edit.
- Extract the generated Dockerfile from each Jenkinsfile with the same shell
  heredoc pipeline and confirm the NDK line is correct and `$FLUTTER_VERSION`
  still expands.
- Run the extraction command inside `jobtrigger-flutter:3.47.8` and confirm it
  yields `ndk;28.2.13676358` (already confirmed pre-change).
- Optionally do a test `docker build -t jobtrigger-flutter:3.47.8-ndk-test`
  (new tag, does not overwrite the existing image) and confirm
  `/opt/android-sdk-linux/ndk/28.2.13676358` exists in the result. Overwriting
  the existing image tag and rebuilding Jenkins are separate approval-gated
  items (J3).
- No secrets or credential values are printed or committed.
