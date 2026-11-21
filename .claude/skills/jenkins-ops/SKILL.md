---
name: jenkins-ops
description: Configure, rebuild, and operate Jenkins in custom-devops-stack, including credentials, tools, pipeline templates, Docker-in-Docker, and JobTrigger integration. Use when the user says "Jenkins setup", "create Jenkins credential", "run Jenkins job", "fix Jenkins pipeline", "rebuild Jenkins", "SonarScanner in Jenkins", or asks about the Jenkins/SonarQube bridge. Never print credential values.
---

# Jenkins Operations

## When to use
- Jenkins first-time setup or plugin/tool configuration.
- Credential IDs, job folders, pipeline templates, or build failures.
- Rebuilding the custom Jenkins image after Dockerfile changes.
- JobTrigger CI/CD pipeline issues.

## Authoritative sources
- `jenkins/README.md`
- `jenkins/PIPELINE_TEMPLATE.md`
- `jenkins/CI.JenkinsFile`
- `jenkins/Dockerfile` and `jenkins/docker-entrypoint-wrapper.sh`
- `README.md` Jenkins↔SonarQube setup section

## Hard rules
1. Never print tokens, SSH keys, SMTP passwords, or API tokens.
2. Known credential IDs: `github-ssh-key`, `sonarqube-token`, `gmail-smtp-creds`, `github-token`.
3. Jenkins reaches SonarQube at `http://sonarqube:9000` on `devops-network`; use that container URL inside jobs.
4. Pass Sonar tokens as `-Dsonar.token="$SONAR_AUTH_TOKEN"`, never inline in a logged command.
5. Docker-in-Docker must use `--volumes-from "$(hostname)" -w "$WORKSPACE"`; do not use `-v "$WORKSPACE:/repo"`.
6. Rebuilding or restarting Jenkins can affect running builds and data; ask approval before destructive operations.
7. Heavy Android builds run one at a time. Executors should be 2–3, not 4.

## Steps — first-time setup
1. Start Jenkins with `make up S=jenkins`.
2. Read the initial admin password from the documented Jenkins home location; do not print it into shared docs.
3. Install/verify plugins: SonarQube Scanner, quality gates, Email Extension, Git, NodeJS, HTML Publisher.
4. Configure tools: NodeJS `NODEJS`, SonarScanner `SonarScanner`, Sonar server `SonarServer` at `http://sonarqube:9000`.
5. Create credentials by ID and purpose only; never store real values in docs.
6. Create jobs under `Projects/JobTrigger/<component>/{CI,CD}-Pipeline`.
7. Verify with a small pipeline run before enabling the full JobTrigger build.

## Steps — pipeline template changes
1. Read `jenkins/PIPELINE_TEMPLATE.md` and `jenkins/CI.JenkinsFile`.
2. Preserve `{{...}}` placeholders and document any new one.
3. Keep token handling via Jenkins credentials and `-Dsonar.token`.
4. Keep the Docker-in-Docker volume pattern.
5. Validate by triggering a non-destructive job and reading console output.

## Steps — rebuild Jenkins image
1. Explain impact: image rebuild plus container recreation; get approval.
2. Back up first: `make backup`.
3. Build via the stack image flow or `scripts/stack.sh` conventions; do not hand-roll a different tag.
4. Restart with `make restart S=jenkins`.
5. Verify plugins, tools, credentials, and one JobTrigger job.

## Checks
- `make status` shows Jenkins running.
- Jenkins can resolve `sonarqube` on `devops-network`.
- Credentials exist by ID; values are never displayed.
- Pipeline uses the correct Docker socket pattern.
- One representative build passes.

## Output format
Report:
1. What was inspected or changed.
2. Plugin/tool/credential IDs involved, without values.
3. Pipeline/test result.
4. Warnings and required approvals.
