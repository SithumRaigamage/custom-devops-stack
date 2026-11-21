# Design — P1 #2: Bump SonarQube

## What will change
- Replace the pinned `sonarqube:26.1.0.118079-community` with the latest 26.x
  community build, `sonarqube:26.11.0.134175-community` (Docker Hub, pushed
  2026-11-20). The old pin has 7 fixable CRITICAL Java-library CVEs.
- Update every pin reference: `sonarqube/docker-compose.yml`, `scripts/stack.sh`
  (`IMAGE_TARS`), `scripts/scan.sh` (`STACK_IMAGES`), `sonarqube/README.md`,
  `README.md`, `docs/CURRENT_STATE.md`, and the `sonarqube-ops` skill note.
- Pull the new image and save it to a **new** tar
  `images/sonarqube_26.11.0.134175-community.tar`. The old tar is left in place
  (deleting files needs separate approval).
- Re-scan the new image with Trivy and start the service via `scripts/stack.sh up
  sonarqube` to confirm it boots (the Postgres schema migration is part of a
  normal SonarQube upgrade).

## Files touched
- `sonarqube/docker-compose.yml`, `scripts/stack.sh`, `scripts/scan.sh`
- `sonarqube/README.md`, `README.md`, `docs/CURRENT_STATE.md`
- `.claude/skills/sonarqube-ops/SKILL.md`
- `images/sonarqube_26.11.0.134175-community.tar` (new, git-ignored)
- `docs/backlog.md`, `docs/CHANGELOG.md` (item closes on completion)
- This design note

## Verification
- `docker pull` succeeds; `docker image inspect` confirms the new tag.
- Trivy HIGH/CRITICAL report for the new image is compared with the old 7/102
  baseline (12 Nov). Report honestly; the DB snapshot may differ.
- `scripts/stack.sh up sonarqube` then `scripts/stack.sh status` shows the
  container healthy; check `docker logs sonarqube` for migration/errors.
- `make scan-images` includes the new tag and no longer lists the old one.
- No secrets or credential values are printed or committed.
