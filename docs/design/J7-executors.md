# Design — J7: Raise Jenkins executors from 2 to 3

## What will change
- Set the Jenkins controller's executor count from 2 to 3 so a quick job can run
  beside the two heavy Flutter jobs. Do **not** go to 4: two Flutter builds plus
  SonarQube already fill Docker's ~10.6 GB budget.
- Apply via the authenticated Jenkins Script Console using
  `jenkins.model.Jenkins.instance.setNumExecutors(3)` and persist with `save()`.
  This writes `jenkins/jenkins_home/config.xml` through Jenkins itself; the file
  is not hand-edited and Jenkins does not need a restart.

## Files touched
- Jenkins runtime `jenkins_home/config.xml` (`<numExecutors>`), written by
  Jenkins.
- `docs/design/J7-executors.md` (this note), `docs/backlog.md`,
  `docs/CHANGELOG.md`.

## Verification
- `grep '<numExecutors>' jenkins/jenkins_home/config.xml` → `3`.
- Read-only Script Console check of `Jenkins.instance.numExecutors` → `3`.
- Jenkins remains healthy: `/login` returns 200 and the log has no errors.
- No containers are stopped or removed; no secrets are printed.
