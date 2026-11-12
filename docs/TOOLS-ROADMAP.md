# DevOps Stack — Tools Roadmap

A living catalogue of tools that can be added to this personal DevOps stack.
Nothing here is installed unless the **Status** column says so.

## Purpose and assumptions

- Local, single-machine lab on an Apple Silicon Mac (Docker Desktop).
- Services run as Docker Compose projects, one folder per service, on the shared `devops-network`.
- Memory is limited (SonarQube alone is capped at 4 GB), so add services gradually and check headroom first.
- Secrets live in gitignored `.env` files only. Never commit tokens, passwords or real `.env` values.
- Every new tool follows the same flow: audit, plan, approval, install, verify, document.

Status key: **Installed** · **Planned** (priority picks) · **Idea** (not scheduled).

## Current stack

| Tool | Role | Status | Port |
|---|---|---|---|
| Jenkins | CI/CD | Installed | 8080, 50000 |
| SonarQube Community + PostgreSQL | Code quality | Installed | 9000 |
| MongoDB (local binary) | Database | Installed | 27018 |

## Recommended order

### 1. Do first — close security gaps

| Tool | What it adds | Notes | Status |
|---|---|---|---|
| Trivy (or Grype) | Vulnerability scan of images, dependencies and IaC | One container; Jenkins can call it. SonarQube does not scan images. | Done: CI pipeline stage + `make scan-images` |
| Gitleaks | Secret scanning of files and git history | Run as a pre-commit hook and in Jenkins. Would have caught a token committed to a tracked `.env.example`. | Done: CI stage, pre-commit hook, `make scan-secrets` |
| Nexus or Harbor | Private registry and artifact store | Replaces the `images/` tar cache; Jenkins pushes builds here. Harbor is registry-focused, Nexus also stores Maven/npm/PyPI. | Planned |

### 2. Next — observability

| Tool | What it adds | Notes | Status |
|---|---|---|---|
| Prometheus + Grafana + cAdvisor | Metrics and dashboards for container CPU/memory | Useful for checking the SonarQube memory limits. | Done: `observability/` |
| Loki + Promtail | Central logs | Replaces running each `*-logs` command separately. | Done: `observability/` |

### 3. Later — platform

| Tool | What it adds | Notes | Status |
|---|---|---|---|
| Traefik or Caddy | Reverse proxy | Names such as `jenkins.localhost` instead of ports. | Planned |
| Gitea or GitLab CE | Self-hosted Git | Triggers Jenkins builds. GitLab CE is heavy (4 GB+). | Planned |
| HashiCorp Vault | Secrets manager | So `.env` files are not the only credential store. | Planned |
| Terraform + kind or k3d | Infrastructure as code and local Kubernetes | For practising deployment, not just builds. | Planned |

### 4. Housekeeping (no new service)

| Item | Why | Status |
|---|---|---|
| Root `docker-compose.yml` or Makefile | Stack no longer depends on functions in `~/.zshrc` | Done: `Makefile` + `scripts/stack.sh` |
| Jenkins Configuration as Code (JCasC) | Rebuild Jenkins from the repo | Planned |
| `docs/` for ports and credentials policy | One source of truth | Planned (this file is the start) |
| Backup script for `jenkins_home`, `sonarqube/postgresql` | Backup readiness | Done: `make backup` |

## Full catalogue by category

### Source control and collaboration
Gitea, GitLab CE, Forgejo, Gogs. Pre-commit framework and Husky for local hooks.

### CI/CD and automation
Jenkins (installed), Drone CI, Woodpecker CI, Concourse, GitHub Actions runner (self-hosted), Argo Workflows, Tekton, Act (run GitHub Actions locally).

### Continuous delivery / GitOps
Argo CD, Flux, Spinnaker, Helm, Kustomize.

### Code quality and static analysis
SonarQube (installed), Semgrep, Checkstyle/ESLint/Ruff/ShellCheck/Hadolint (language linters; Hadolint for Dockerfiles), CodeClimate (self-hosted CLI), Qodana.

### Security (DevSecOps)
- Dependencies and images: Trivy, Grype, Syft (SBOM), OWASP Dependency-Check, Snyk CLI.
- Secrets: Gitleaks, TruffleHog, detect-secrets.
- IaC and config: Checkov, tfsec, KICS, Kubescape, kube-bench.
- Web app testing: OWASP ZAP, Nuclei.
- Image signing: Cosign / Sigstore.
- Policy: Open Policy Agent (OPA), Conftest, Kyverno.
- Runtime: Falco, Wazuh.
- Container hardening: Docker Bench for Security.

### Artifacts and registries
Nexus Repository, Harbor, JFrog Artifactory OSS, Docker Registry (`registry:2`), Verdaccio (npm), devpi (PyPI), Athens (Go modules).

### Observability
- Metrics: Prometheus, Grafana, cAdvisor, node-exporter, VictoriaMetrics, Alertmanager.
- Logs: Loki, Promtail, Grafana Alloy, ELK/OpenSearch, Graylog.
- Tracing: Jaeger, Tempo, OpenTelemetry Collector.
- Uptime: Uptime Kuma, Blackbox exporter.
- Errors: Sentry (self-hosted), GlitchTip.

### Infrastructure and platform
Terraform / OpenTofu, Ansible, Packer, Pulumi, Vagrant, Multipass, Colima, kind, k3d, minikube, k3s, Portainer, Lazydocker, Dozzle.

### Networking and access
Traefik, Caddy, Nginx Proxy Manager, Nginx, HAProxy, Tailscale, WireGuard, Cloudflare Tunnel, Authelia / Authentik / Keycloak (single sign-on).

### Secrets and configuration
HashiCorp Vault, SOPS + age, Infisical, Bitwarden (self-hosted Vaultwarden), direnv, 1Password CLI.

### Data services
MongoDB (installed), PostgreSQL, MySQL/MariaDB, Redis, Valkey, RabbitMQ, Kafka (Redpanda), MinIO (S3-compatible storage), Elasticsearch/OpenSearch, pgAdmin, Adminer, Mongo Express.

### Testing and quality assurance
k6 and Locust (load), Selenium/Playwright/Cypress (UI), Testcontainers, Pact (contract), Postman/Newman, JMeter, SonarQube coverage import (JaCoCo, coverage.py, lcov).

### Documentation and developer experience
MkDocs / Docusaurus, Backstage (developer portal), Mermaid, Draw.io (self-hosted), Homepage or Heimdall (dashboard of all services), Task or Make (task runners), devcontainers.

### Backup and disaster recovery
restic, BorgBackup, Velero (Kubernetes), Duplicati, Kopia, Rclone.

### Automation of the stack itself
Renovate or Dependabot (dependency updates), Watchtower (image updates; use with care), Jenkins Job DSL and JCasC, Docker Compose profiles, GitHub CLI.

## Resource guidance

| Tool group | Rough extra memory |
|---|---|
| Trivy, Gitleaks | small, run on demand |
| Prometheus + Grafana + cAdvisor | ~1 GB |
| Loki + Promtail | ~0.5–1 GB |
| Nexus | 2–4 GB |
| Harbor | ~2–3 GB |
| Gitea | ~0.3 GB |
| GitLab CE | 4 GB+ |
| Vault | ~0.3 GB |
| kind / k3d cluster | 2–4 GB |

Figures are estimates, not measurements. Measure with cAdvisor once it is running.

## Port allocation

All bound to 127.0.0.1 unless noted.

| Port | Service |
|---|---|
| 3000 | Open WebUI |
| 3001 | StackPilot dashboard (web) |
| 3002 | Grafana |
| 3100 | Loki |
| 4000 | StackPilot API |
| 5432 | StackPilot dashboard Postgres |
| 5433 | General-purpose Postgres (`postgres/`) |
| 8080, 50000 | Jenkins (`JENKINS_BIND` to expose) |
| 8081 | cAdvisor |
| 9000 | SonarQube (`SONAR_BIND` to expose) |
| 9090 | Prometheus |
| 11434 | Ollama (host) |
| 27017 | MongoDB (`mongodb/`, Docker). Note the separate local `mongod` from `script.sh` uses 27018 |

Suggested for future services: Nexus 8082, Harbor 8083, Gitea 3003, Vault 8200, Traefik 80/443. Confirm each is free before use (`make doctor` checks the reserved ones).

## How to add a tool

1. Create `<tool>/` with `docker-compose.yml`, `.env.example` (placeholders only), `.gitignore` and `README.md`.
2. Join the `devops-network` network.
3. Keep data in gitignored bind-mounted folders.
4. Add start/stop/logs functions or Makefile targets, and add the image to the saved-image list.
5. Update this table's **Status** and the root `README.md`.
