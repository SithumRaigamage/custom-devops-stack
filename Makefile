# Custom DevOps stack. Run `make help` for the targets.
# Every target wraps a script in scripts/, so they also work without make.

SHELL := /bin/bash
STACK := scripts/stack.sh
S ?=

.DEFAULT_GOAL := help
.PHONY: help bootstrap doctor up down restart status logs dashboard backup restore-help scan-secrets scan-images scan observability-up observability-down test typecheck

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo; echo '  Pick services with S, e.g.  make up S="jenkins sonarqube"   make logs S=jenkins'

bootstrap: ## First-time setup: .env files, images, dashboard deps, git hooks
	@$(STACK) bootstrap

doctor: ## Check Docker, tools, ports and .env files
	@$(STACK) doctor

up: ## Start services (default: dashboard-db jenkins sonarqube)
	@$(STACK) up $(S)

down: ## Stop services (default: everything)
	@$(STACK) down $(S)

restart: ## Restart services
	@$(STACK) restart $(S)

status: ## Show container state and health
	@$(STACK) status

logs: ## Follow logs of one service: make logs S=jenkins
	@$(STACK) logs $(S) -f

dashboard: ## Run the StackPilot dashboard (API + web) in dev mode
	@$(STACK) up dashboard-db
	@cd dashboard && pnpm dev

backup: ## Back up Jenkins, SonarQube DB, Postgres, MongoDB, Open WebUI and the dashboard DB
	@scripts/backup.sh

restore-help: ## Print restore steps for a backup
	@scripts/backup.sh --restore-help

scan-secrets: ## Gitleaks: scan files and git history for secrets
	@scripts/scan.sh secrets

scan-images: ## Trivy: scan stack images for fixable HIGH/CRITICAL vulnerabilities
	@scripts/scan.sh images

scan: ## Run all security scans
	@scripts/scan.sh all

observability-up: ## Start Prometheus, Grafana, cAdvisor, Loki and Promtail
	@cd observability && docker compose up -d
	@echo 'Grafana: http://localhost:3002  Prometheus: http://localhost:9090'

observability-down: ## Stop the observability stack
	@cd observability && docker compose down

test: ## Run dashboard API tests
	@cd dashboard && pnpm test

typecheck: ## Typecheck dashboard API and web
	@cd dashboard && pnpm typecheck
