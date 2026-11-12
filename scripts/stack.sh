#!/usr/bin/env bash
# One entry point for the whole stack — no dependency on functions in ~/.zshrc.
#
#   scripts/stack.sh up [service...]       start (default: dashboard-db jenkins sonarqube)
#   scripts/stack.sh down [service...]     stop (default: everything)
#   scripts/stack.sh restart [service...]
#   scripts/stack.sh status                containers, health and ports
#   scripts/stack.sh logs <service> [-f]
#   scripts/stack.sh doctor                check prerequisites, ports and .env files
#   scripts/stack.sh bootstrap             first-time setup (env files, images, dashboard deps)
#   scripts/stack.sh list                  service names
#
# Services: jenkins sonarqube open-webui postgres mongodb dashboard-db
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGES_DIR="$ROOT/images"

# name | folder | compose service filter (empty = all) | host ports to check
SERVICES=(
  "jenkins|jenkins||8080 50000"
  "sonarqube|sonarqube||9000"
  "open-webui|open-webui||3000"
  "postgres|postgres||5433"
  "mongodb|mongodb||27017"
  "dashboard-db|dashboard|postgres|5432"
)
DEFAULT_UP=(dashboard-db jenkins sonarqube)

# image | tar in images/ (or a path relative to ROOT) — loaded when the image is missing,
# so a `docker system prune -a` doesn't force a re-download.
IMAGE_TARS=(
  "custom-jenkins:latest|images/custom-jenkins_latest.tar"
  "sonarqube:26.1.0.118079-community|images/sonarqube_26.1.0.118079-community.tar"
  "postgres:15-alpine|images/postgres_15-alpine.tar"
  "ghcr.io/open-webui/open-webui:main|open-webui/backup/open-webui-image.tar"
)

c_ok=$'\033[32m'; c_warn=$'\033[33m'; c_bad=$'\033[31m'; c_dim=$'\033[2m'; c_off=$'\033[0m'
[ -t 1 ] || { c_ok=""; c_warn=""; c_bad=""; c_dim=""; c_off=""; }
info() { printf '%s\n' "$*"; }
ok()   { printf '%s✔%s %s\n' "$c_ok" "$c_off" "$*"; }
warn() { printf '%s!%s %s\n' "$c_warn" "$c_off" "$*" >&2; }
die()  { printf '%s✘%s %s\n' "$c_bad" "$c_off" "$*" >&2; exit 1; }

field() { # field <service> <index>
  local entry
  for entry in "${SERVICES[@]}"; do
    IFS='|' read -r name folder filter ports <<<"$entry"
    if [ "$name" = "$1" ]; then
      case "$2" in folder) echo "$folder" ;; filter) echo "$filter" ;; ports) echo "$ports" ;; esac
      return 0
    fi
  done
  die "Unknown service '$1'. Known: $(names)"
}
names() { local e; for e in "${SERVICES[@]}"; do printf '%s ' "${e%%|*}"; done; }

require_docker() {
  command -v docker >/dev/null 2>&1 || die "docker is not installed"
  docker info >/dev/null 2>&1 || die "Docker is not running. Start Docker Desktop and retry."
}

compose() { # compose <service> <args...>
  local svc="$1"; shift
  local folder; folder="$(field "$svc" folder)"
  (cd "$ROOT/$folder" && docker compose "$@")
}

ensure_images() {
  local entry image tar
  for entry in "${IMAGE_TARS[@]}"; do
    IFS='|' read -r image tar <<<"$entry"
    docker image inspect "$image" >/dev/null 2>&1 && continue
    if [ -f "$ROOT/$tar" ]; then
      info "Loading $image from $tar"
      docker load -i "$ROOT/$tar" >/dev/null
    elif [ "$image" = "custom-jenkins:latest" ]; then
      info "Building $image from jenkins/Dockerfile"
      docker build -t "$image" "$ROOT/jenkins"
    fi
    # Anything else is pulled by docker compose on first start.
  done
}

ensure_env() { # copy .env.example → .env where a folder needs one
  local folder
  for folder in sonarqube postgres observability; do
    if [ -f "$ROOT/$folder/.env.example" ] && [ ! -f "$ROOT/$folder/.env" ]; then
      # Fresh .env: replace every `change-me` placeholder with its own random secret.
      # Only for new files; an existing database keeps the password it was created with.
      local line out=""
      while IFS= read -r line || [ -n "$line" ]; do
        if [[ "$line" == *=change-me ]]; then line="${line%change-me}$(openssl rand -hex 16)"; fi
        out+="$line"$'\n'
      done <"$ROOT/$folder/.env.example"
      printf '%s' "$out" >"$ROOT/$folder/.env"
      chmod 600 "$ROOT/$folder/.env"
      ok "Created $folder/.env with generated passwords"
      if [ "$folder" = "sonarqube" ]; then
        warn "Add a SonarQube user token to sonarqube/.env (SONAR_TOKEN) after first login."
      fi
    fi
  done
}

cmd_up() {
  require_docker
  local targets=("$@"); [ ${#targets[@]} -gt 0 ] || targets=("${DEFAULT_UP[@]}")
  ensure_images
  local svc filter
  for svc in "${targets[@]}"; do
    filter="$(field "$svc" filter)"
    info "Starting $svc"
    if [ "$svc" = "open-webui" ]; then mkdir -p "$ROOT/open-webui/data"; fi
    # shellcheck disable=SC2086
    compose "$svc" up -d $filter
    ok "$svc started"
  done
}

cmd_down() {
  require_docker
  local targets=("$@")
  if [ ${#targets[@]} -eq 0 ]; then
    # Stop in reverse dependency order; dashboard-db last so the UI sees the others stop.
    targets=(open-webui sonarqube jenkins mongodb postgres dashboard-db)
  fi
  local svc filter
  for svc in "${targets[@]}"; do
    filter="$(field "$svc" filter)"
    info "Stopping $svc"
    if [ -n "$filter" ]; then compose "$svc" stop "$filter"; else compose "$svc" down; fi
    ok "$svc stopped"
  done
}

cmd_status() {
  require_docker
  local entry name folder
  printf '%-14s %s\n' "SERVICE" "CONTAINERS"
  for entry in "${SERVICES[@]}"; do
    IFS='|' read -r name folder _ _ <<<"$entry"
    local out
    out="$(cd "$ROOT/$folder" && docker compose ps --format '{{.Name}} {{.State}} {{.Health}}' 2>/dev/null || true)"
    if [ -z "$out" ]; then
      printf '%-14s %sstopped%s\n' "$name" "$c_dim" "$c_off"
    else
      printf '%-14s %s\n' "$name" "$(echo "$out" | paste -sd ';' - | sed 's/;/; /g')"
    fi
  done
}

cmd_logs() {
  [ $# -ge 1 ] || die "Usage: stack.sh logs <service> [-f]"
  require_docker
  local svc="$1"; shift
  compose "$svc" logs --tail 200 "$@"
}

port_in_use() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

cmd_doctor() {
  local failed=0
  command -v docker >/dev/null 2>&1 && ok "docker installed" || { warn "docker missing"; failed=1; }
  if docker info >/dev/null 2>&1; then ok "Docker daemon running"; else warn "Docker daemon not running"; failed=1; fi
  docker compose version >/dev/null 2>&1 && ok "docker compose available" || { warn "docker compose missing"; failed=1; }
  command -v node >/dev/null 2>&1 && ok "node $(node -v)" || warn "node missing (needed for the dashboard)"
  command -v pnpm >/dev/null 2>&1 && ok "pnpm $(pnpm -v)" || warn "pnpm missing (run: corepack enable)"
  command -v ollama >/dev/null 2>&1 && ok "ollama installed" || warn "ollama missing (assistant and Open WebUI need it)"

  local folder
  for folder in sonarqube postgres; do
    if [ -f "$ROOT/$folder/.env" ]; then
      if grep -q 'change-me' "$ROOT/$folder/.env"; then warn "$folder/.env still contains 'change-me'"; failed=1
      else ok "$folder/.env present"; fi
    else
      warn "$folder/.env missing (run: make bootstrap)"; failed=1
    fi
  done
  if [ -f "$ROOT/dashboard/apps/api/.env" ]; then ok "dashboard/apps/api/.env present"
  else warn "dashboard/apps/api/.env missing (run: make bootstrap)"; failed=1; fi

  # Ports: only a problem when something other than our containers holds them.
  local entry name ports port running
  for entry in "${SERVICES[@]}"; do
    IFS='|' read -r name _ _ ports <<<"$entry"
    running="$( (cd "$ROOT/$(field "$name" folder)" && docker compose ps -q 2>/dev/null) || true)"
    [ -n "$running" ] && continue
    for port in $ports; do
      if port_in_use "$port"; then warn "port $port ($name) is already in use by another process"; failed=1; fi
    done
  done

  local entry2 image tar
  for entry2 in "${IMAGE_TARS[@]}"; do
    IFS='|' read -r image tar <<<"$entry2"
    if docker image inspect "$image" >/dev/null 2>&1; then ok "image $image"
    elif [ -f "$ROOT/$tar" ]; then ok "image $image (will load from $tar)"
    else warn "image $image not present and no tar at $tar"; fi
  done

  [ $failed -eq 0 ] && ok "All checks passed" || { warn "Some checks need attention"; return 1; }
}

cmd_bootstrap() {
  ensure_env
  local api_env="$ROOT/dashboard/apps/api/.env"
  if [ ! -f "$api_env" ] && [ -f "$ROOT/dashboard/apps/api/.env.example" ]; then
    cp "$ROOT/dashboard/apps/api/.env.example" "$api_env"
    local secret; secret="$(openssl rand -hex 32)"
    if grep -q '^SESSION_SECRET=' "$api_env"; then
      sed -i.bak "s|^SESSION_SECRET=.*|SESSION_SECRET=$secret|" "$api_env" && rm -f "$api_env.bak"
    else
      echo "SESSION_SECRET=$secret" >>"$api_env"
    fi
    chmod 600 "$api_env"
    ok "Created dashboard/apps/api/.env with a fresh SESSION_SECRET"
  fi
  if docker info >/dev/null 2>&1; then ensure_images; else warn "Docker not running; skipped image loading"; fi
  if command -v pnpm >/dev/null 2>&1; then
    (cd "$ROOT/dashboard" && pnpm install --frozen-lockfile)
  else
    warn "pnpm not found; run 'corepack enable' then 'make bootstrap' again"
  fi
  if [ -f "$ROOT/.pre-commit-config.yaml" ] && command -v pre-commit >/dev/null 2>&1; then
    (cd "$ROOT" && pre-commit install >/dev/null) && ok "pre-commit hooks installed"
  fi
  ok "Bootstrap done. Next: make doctor, then make up"
}

main() {
  local cmd="${1:-help}"; shift || true
  case "$cmd" in
    up|start) cmd_up "$@" ;;
    down|stop) cmd_down "$@" ;;
    restart) cmd_down "$@"; cmd_up "$@" ;;
    status|ps) cmd_status ;;
    logs) cmd_logs "$@" ;;
    doctor) cmd_doctor ;;
    bootstrap) cmd_bootstrap ;;
    list) names; echo ;;
    help|-h|--help) sed -n '2,13p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' ;;
    *) die "Unknown command '$cmd'. Run: scripts/stack.sh help" ;;
  esac
}

main "$@"
