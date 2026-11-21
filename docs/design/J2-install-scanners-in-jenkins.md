# Design — J2: Install scanners in the Jenkins image

## What will change
- `jenkins/Dockerfile`: add `python3` + `python3-venv` to the base apt layer, then
  add pinned, checksum-verified, multi-arch installs alongside the existing
  Trivy block:
  - gitleaks `8.30.1` (`gitleaks_<v>_linux_x64|arm64.tar.gz` +
    `gitleaks_<v>_checksums.txt`)
  - osv-scanner `2.7.0` (`osv-scanner_linux_amd64|arm64` + `osv-scanner_SHA256SUMS`)
  - syft `1.4.1` (`syft_<v>_linux_amd64|arm64.tar.gz` + `syft_<v>_checksums.txt`)
  - hadolint `2.12.0` (`hadolint-Linux-x86_64|arm64` + matching `.sha256` file)
  - semgrep `1.185.0` via exact pin in a `/opt/semgrep` Python venv, symlinked
    into `/usr/local/bin` (PyPI has no upstream checksum file, so the version
    is pinned and TLS-verified; the native binaries above are `sha256sum -c`)
  Each native block mirrors Trivy: `ARG` version, `dpkg --print-architecture`
  case for amd64/arm64, `wget` binary + upstream checksum file, `sha256sum -c`,
  install to `/usr/local/bin`, and a `--version` smoke check.
- `jenkins/CI.JenkinsFile`: switch scanner stages from `docker run <image>` to
  the agent binaries (gitleaks, semgrep, trivy fs, syft, hadolint). Trivy fs
  uses `misconfig` (the current name, already used by the JobTrigger security
  stage) instead of the old `config`. Non-scanner `docker run` calls (Python,
  Go, .NET, Playwright) and the Flutter image stay untouched.
- JobTrigger (`docs/product-proposals-phase-26` worktree): `Jenkins/security/Jenkinsfile`
  switch its four `dockerTool(...)` scanner calls (gitleaks, osv-scanner,
  semgrep, syft) to direct `sh` invocations; `Jenkins/backend/Jenkinsfile`
  hadolint stage switches to the agent binary. Trivy already uses the agent
  there. `Jenkins/tools/Jenkinsfile` has no scanner stages (its `dockerTool`
  helper is unused), so it needs no change.
- No change to `scripts/stack.sh`, image tars, or running containers — rebuilding
  and restarting Jenkins is the separate, approval-gated J3.

## Files touched
- `jenkins/Dockerfile`, `jenkins/CI.JenkinsFile`
- JobTrigger: `Jenkins/security/Jenkinsfile`, `Jenkins/backend/Jenkinsfile`
- Stack: `docs/design/J2-install-scanners-in-jenkins.md` (this note),
  `docs/backlog.md`, `docs/CHANGELOG.md`

## Verification
- Upstream checksum assets fetched read-only and confirmed to contain the
  expected linux amd64/arm64 entries (already done during design).
- Build a **scratch** image `custom-jenkins:j2-test` (new tag; does not overwrite
  `custom-jenkins:latest`) and run `gitleaks version`, `osv-scanner --version`,
  `syft --version`, `hadolint --version`, `semgrep --version`, `trivy --version`
  inside it.
- Grep both repos: no scanner `docker run`/`dockerTool` calls remain where
  switched; non-scanner docker runs are unchanged.
- `make status` still shows all services unchanged; no secrets printed or
  committed.
