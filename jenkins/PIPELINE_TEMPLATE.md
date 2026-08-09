# Jenkins Pipeline Template (Frontend) — Reusable Reference

This document describes the standardized Jenkins pipeline template stored at `jenkins/CI.JenkinsFile`. Use this template as a starting point for future frontend projects. Replace the `{{...}}` placeholders or set equivalent Jenkins job parameters.

## Purpose

- Provide a consistent, reusable CI pipeline for frontend projects.
- Integrates: Git checkout, semantic version validation, SonarQube analysis, Docker image build, Trivy vulnerability scan, artifact publishing, and email notifications.

## Files

- `jenkins/CI.JenkinsFile` — Pipeline template (Groovy declarative pipeline).
- `jenkins/PIPELINE_TEMPLATE.md` — This documentation.

## Required Jenkins configuration

1. Global Tools
   - Install a NodeJS tool and name it the value used in `{{NODEJS_TOOL_NAME}}`.
   - Install `SonarScanner` in Jenkins Global Tool Configuration and use the name in `{{SONAR_SCANNER_TOOL_NAME}}`.

2. Credentials
   - SonarQube token: add a secret text credential and use its ID in `{{SONAR_AUTH_TOKEN_ID}}`.
   - GitHub SSH key: add as `SSH Username with private key` and set `{{GITHUB_CREDENTIALS}}`.
   - (Optional) Email sending credentials depending on your SMTP setup.

3. SonarQube server
   - Configure SonarQube server in Jenkins: Manage Jenkins → Configure System → SonarQube servers.
   - Use the server name in the pipeline where `{{SONAR_SERVER_NAME}}` appears.

4. Plugins used (ensure installed)
   - Email Extension Plugin (`emailext`)
   - HTML Publisher Plugin (`publishHTML`)
   - SonarQube Scanner Plugin

## Pipeline parameters

- `RELEASE_VERSION` — Semantic version (X.Y.Z). Pipeline fails if invalid.
- `GIT_REPO_URL` — Git repository SSH/HTTPS URL.
- `BRANCH` — Branch to build (default `main`).
- `ENVIRONMENT` — `dev`, `qa`, `staging`, `prod` — used to prefix image name for non-prod.
- `SEND_EMAIL` — whether to send build notifications.
- `SONARQUBE_SCAN` — whether to run SonarQube analysis.

## How to use the template in a new project

1. Copy `jenkins/CI.JenkinsFile` into your project repository as `Jenkinsfile` or reference it from a multibranch job.
2. Update these placeholders (either by editing the file, or passing parameters in the job):
   - `{{DOCKER_IMAGE_NAME}}` — short image name (example: `my-app-frontend`).
   - `{{NODEJS_TOOL_NAME}}`, `{{SONAR_SCANNER_TOOL_NAME}}`, `{{SONAR_SERVER_NAME}}`, etc.
3. Ensure the repository contains a buildable Docker context and that `npm install` and `npm test` succeed locally.

## Trivy notes

- The pipeline downloads an HTML template for Trivy if missing and generates `trivy-report.html`.
- The report is archived and published via the HTML Publisher plugin when present.

## Quick start (example)

From Jenkins job configuration (Declarative pipeline script from SCM):

1. Set `GIT_REPO_URL` to `git@github.com:your-org/your-frontend.git` and `BRANCH` to `main`.
2. Configure job parameters for `RELEASE_VERSION` when triggering a release build.
3. Ensure the job has access to the credentials referenced in `GITHUB_CREDENTIALS` and `SONAR_AUTH_TOKEN`.

## Troubleshooting

- SonarQube connection failures: verify `SONAR_SERVER_URL`, the server name in Jenkins, and that the token credential is correct.
- Trivy failures: ensure `trivy` is available on the Jenkins agent or add Trivy to the build container.
- Docker build failures: check that the Jenkins agent has Docker access or run Docker-in-Docker for the job.

## Example parameter values

- `{{NODEJS_TOOL_NAME}}` = `NODEJS`
- `{{SONAR_SCANNER_TOOL_NAME}}` = `SonarScanner`
- `{{SONAR_SERVER_NAME}}` = `SonarServer`
- `{{GIT_REPO_URL}}` = `git@github.com:YourOrg/your-repo.git`
- `{{DOCKER_IMAGE_NAME}}` = `your-frontend`

## Next steps (optional)

- Add a small `templates/` folder for per-project overrides (env file or YAML) and update the pipeline to read it.
- Add automated tests for the pipeline (e.g., using Jenkinsfile Runner or a linting stage).

---
If you want, I can also:
- Create a tiny script that generates a project-specific `Jenkinsfile` from this template by replacing placeholders.
- Add an example `template-variables.yml` to the repo.
