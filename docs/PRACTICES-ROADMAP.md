# DevOps Stack — Practices and Improvements Roadmap

Improvements to how the stack is built, secured and run. These are practices and
structure changes, not new tools. For new tools, see [TOOLS-ROADMAP.md](TOOLS-ROADMAP.md).

## Purpose and assumptions

- Local, single-machine lab (Docker Desktop, Apple Silicon Mac).
- Services are Docker Compose projects in one folder each, joined on `devops-network`.
- Secrets live only in gitignored `.env` files.
- Each item follows the usual flow: audit, plan, approval, build, verify, document.

Status key: **Done** · **Planned** · **Idea**. Priority: **P1** do first, **P2** next, **P3** later.

## Why these exist

Two failures have already happened in this stack:

1. A fresh clone cannot start the stack, because the start commands live in `~/.zshrc`.
2. A real token was committed to a tracked file (`sonarqube/.env.example`).

Items marked **P1** target those directly.

## 1. Reproducibility

| # | Item | What to do | Priority | Status |
|---|---|---|---|---|
| 1 | One entry point | Add a `Makefile` (or fix `script.sh`) with `make up`, `down`, `status`, `setup`, so nothing depends on `~/.zshrc`. | P1 | Done: `Makefile` + `scripts/stack.sh` |
| 2 | Pinned versions | Pin every image to an exact tag and record all versions in one file (for example `versions.env`). Jenkins and SonarQube are already pinned. | P2 | Planned |
| 3 | Jenkins as code | Keep Jenkins plugins, jobs and settings in the repo using Configuration as Code, so Jenkins can be rebuilt from scratch. | P2 | Planned |
| 4 | Bootstrap script | One command that creates `.env` files, generates random passwords, starts services and runs `sonarqube/scripts/setup-quality.sh`. | P1 | Done: `make bootstrap` (generates passwords for new `.env` files) |
| 5 | Single setup guide | A "new machine" checklist in the README: prerequisites, clone, bootstrap, first login. | P2 | Planned |

## 2. Security habits

| # | Item | What to do | Priority | Status |
|---|---|---|---|---|
| 6 | Pre-commit checks | A git hook that blocks `.env` files and token-like strings. This would have stopped the `.env.example` leak. | P1 | Done: `.pre-commit-config.yaml` (Gitleaks, private keys, `.env` block) |
| 7 | Credentials policy | One short doc: where secrets live, how they rotate, and which SonarQube tokens are User, Project or Global Analysis tokens. | P1 | Planned |
| 8 | Least privilege | Give Jenkins its own SonarQube user and its own token instead of reusing the admin token. | P2 | Planned |
| 9 | Health checks | Add `healthcheck` entries to compose files so `depends_on` waits until a service is ready. | P2 | Planned |
| 10 | Token expiry and rotation | Give every token an expiry date and record a rotation schedule. | P2 | Planned |
| 11 | Protect the default branch | Require review and passing checks before merging to `main`, once the repo has collaborators or CI. | P3 | Idea |
| 12 | Bind services to localhost | Publish ports as `127.0.0.1:PORT:PORT` so services are not reachable from the network. | P2 | Done: Jenkins, SonarQube and all new services bind to 127.0.0.1 (`JENKINS_BIND` / `SONAR_BIND` to override) |
| 13 | Remove exposed history | If a secret was ever pushed, revoke it first, then decide whether to rewrite history. | P1 | Planned |

## 3. Backup and recovery

| # | Item | What to do | Priority | Status |
|---|---|---|---|---|
| 14 | Backup script | Back up `jenkins/jenkins_home` and `sonarqube/postgresql` to a dated archive outside the repo. | P1 | Done: `make backup` (`scripts/backup.sh`, DB dumps + archives + checksums) |
| 15 | Restore test | Restore a backup into a scratch location regularly. A backup that has never been restored is unproven. | P2 | Planned |
| 16 | Backup retention | Keep for example 7 daily and 4 weekly archives, and delete older ones only by rule. | P3 | Done: newest 7 kept (`BACKUP_KEEP`) |
| 17 | Export configuration | Keep exported SonarQube gates, profiles and Jenkins config in the repo, so settings survive a lost volume. | P2 | Planned |

## 4. CI/CD design

| # | Item | What to do | Priority | Status |
|---|---|---|---|---|
| 18 | Shared pipeline template | One reusable Jenkinsfile for every project: build, test, SonarQube scan, quality-gate check. | P2 | Done: `jenkins/CI.JenkinsFile` + `PIPELINE_TEMPLATE.md` |
| 19 | Fail on quality gate | A failed SonarQube quality gate fails the build. | P2 | Planned |
| 20 | Scanner templates | A `sonar-project.properties` template for each language in use, including coverage report paths. | P2 | Planned |
| 21 | Coverage by default | Make every template produce a coverage report, otherwise the 80% gate condition always fails. | P2 | Planned |
| 22 | Build caching | Cache dependency downloads (Maven, npm, pip) between builds to keep builds fast. | P3 | Idea |

## 5. Maintenance and documentation

| # | Item | What to do | Priority | Status |
|---|---|---|---|---|
| 23 | Update routine | Monthly: check for newer image versions, test, then bump the pinned versions. | P2 | Planned |
| 24 | Architecture notes | A diagram of how services connect, plus a "what to do if X breaks" runbook. | P2 | Planned |
| 25 | Commit conventions and CHANGELOG | Keep the existing `type: summary` commit style and record notable changes in a `CHANGELOG`. | P3 | Planned |
| 26 | Resource limits and a memory check | Limits on every container, and a check that the machine has enough free memory before the stack starts. | P2 | Partly: limits on every container; memory check not yet |
| 27 | Port registry | One table of every port in use, to prevent conflicts (27017 is already taken by an unrelated project). | P2 | Done: see Port allocation in `TOOLS-ROADMAP.md` |
| 28 | Log rotation | Cap Docker log size (`max-size`, `max-file`) so logs do not fill the disk. | P3 | Planned |
| 29 | Disk usage review | Regularly review `docker system df` and prune unused images and volumes, with care for data volumes. | P3 | Idea |
| 30 | Decision records | Short notes on why choices were made, such as why Mongo runs outside Docker. | P3 | Idea |

## Suggested order

1. **P1 first:** Makefile (1), bootstrap script (4), pre-commit checks (6), credentials policy (7), backup script (14), and cleaning up the exposed token (13).
2. **Then P2:** pinned versions, Jenkins as code, least privilege, health checks, localhost binding, restore test, pipeline template, update routine and the runbook.
3. **P3 last:** retention, caching, log rotation, decision records.

## Notes

- Counts and priorities are suggestions and can be reordered.
- Update the Status column and the root `README.md` whenever an item is completed.
