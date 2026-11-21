# Design — J3: Rebuild and restart Jenkins

## What will change
- Rebuild `custom-jenkins:latest` from the updated `jenkins/Dockerfile` (J1/J2
  changes are already in the JobTrigger branch and the stack image build inputs).
  Use `docker build --pull -t custom-jenkins:latest jenkins/` so the base image
  is refreshed, matching the P1 #1 approach. This overwrites the local image tag.
- Re-save `images/custom-jenkins_latest.tar` from the rebuilt image so the
  offline cache in `scripts/stack.sh` (`IMAGE_TARS`) stays consistent; otherwise
  a future `ensure_images` restore would silently load a scanner-free image.
  This overwrites the existing git-ignored tar.
- Start Jenkins through the canonical entry point: `scripts/stack.sh up jenkins`
  (the Makefile `up` target delegates to it). `jenkins_home` is a bind mount, so
  jobs, credentials, plugins and settings persist; the container was stopped in
  `make status` before this work.

## Files touched
- `images/custom-jenkins_latest.tar` (git-ignored, overwritten)
- Local Docker tag `custom-jenkins:latest` (overwritten)
- `docs/design/J3-rebuild-jenkins.md` (this note), `docs/backlog.md`,
  `docs/CHANGELOG.md`

## Verification
- `docker image inspect` shows the new image; `docker run --rm … --version`
  confirms gitleaks/osv-scanner/syft/hadolint/semgrep/trivy are present.
- Tar validity: `tar -tf images/custom-jenkins_latest.tar | head` and file size.
- `scripts/stack.sh status` shows Jenkins running; container logs have no
  migration errors; `curl` to `http://localhost:8080/login` responds.
- Job/settings persistence: `jenkins_home/jobs/.../config.xml` count still 37,
  plugins still 193.
- `make scan-images` still runs. No secrets are printed or committed.
