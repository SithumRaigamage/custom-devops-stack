#!/usr/bin/env bash
# Security scans for the stack. Uses local binaries when installed, otherwise the
# official Docker images, so nothing has to be installed on the host.
#
#   scripts/scan.sh secrets   Gitleaks: working tree + full git history
#   scripts/scan.sh images    Trivy: HIGH/CRITICAL vulnerabilities in the stack images
#   scripts/scan.sh all       both
#
# Reports are written to reports/ (git-ignored). Exit code is non-zero when findings exist,
# so the same script can gate a Jenkins stage or a pre-push hook.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORTS="$ROOT/reports"
mkdir -p "$REPORTS"

# Pin scanner versions so results are reproducible; bump deliberately.
GITLEAKS_IMAGE="${GITLEAKS_IMAGE:-zricethezav/gitleaks:v8.21.2}"
TRIVY_IMAGE="${TRIVY_IMAGE:-aquasec/trivy:0.57.0}"
SEVERITY="${SEVERITY:-HIGH,CRITICAL}"

# Images that make up the stack (kept in sync with scripts/stack.sh).
STACK_IMAGES=(
  "custom-jenkins:latest"
  "sonarqube:26.1.0.118079-community"
  "postgres:15-alpine"
  "postgres:16-alpine"
  "mongo:7"
  "ghcr.io/open-webui/open-webui:main"
)

scan_secrets() {
  echo "== Gitleaks: secrets in files and git history"
  local report="$REPORTS/gitleaks.json"
  local rc=0
  if command -v gitleaks >/dev/null 2>&1; then
    gitleaks git "$ROOT" --config "$ROOT/.gitleaks.toml" --gitleaks-ignore-path "$ROOT/.gitleaksignore" --redact \
      --report-format json --report-path "$report" || rc=$?
  else
    # The repo is owned by a different uid inside the container, so mark it safe for git.
    docker run --rm -v "$ROOT:/repo:ro" -v "$REPORTS:/reports" --entrypoint sh "$GITLEAKS_IMAGE" -c \
      'git config --global --add safe.directory /repo && gitleaks git /repo --config /repo/.gitleaks.toml --gitleaks-ignore-path /repo/.gitleaksignore --redact --report-format json --report-path /reports/gitleaks.json' \
      || rc=$?
  fi
  if [ $rc -eq 0 ]; then
    echo "✔ No secrets found"
  else
    echo "✘ Gitleaks found possible secrets (redacted report: reports/gitleaks.json)"
    echo "  A secret that reached git history must be rotated, not just deleted."
  fi
  return $rc
}

scan_images() {
  echo "== Trivy: $SEVERITY vulnerabilities in stack images"
  local rc=0 image safe
  for image in "${STACK_IMAGES[@]}"; do
    if ! docker image inspect "$image" >/dev/null 2>&1; then
      echo "– skipping $image (not present locally)"
      continue
    fi
    safe="$(echo "$image" | tr '/:' '__')"
    echo "→ $image"
    if command -v trivy >/dev/null 2>&1; then
      trivy image --quiet --severity "$SEVERITY" --ignore-unfixed --exit-code 1 \
        --format table --output "$REPORTS/trivy-$safe.txt" "$image" || rc=1
    else
      docker run --rm \
        -v /var/run/docker.sock:/var/run/docker.sock:ro \
        -v trivy-cache:/root/.cache/trivy \
        -v "$REPORTS:/reports" \
        "$TRIVY_IMAGE" image --quiet --severity "$SEVERITY" --ignore-unfixed --exit-code 1 \
        --format table --output "/reports/trivy-$safe.txt" "$image" || rc=1
    fi
    if [ -s "$REPORTS/trivy-$safe.txt" ]; then
      # Trivy prints one "Total:" per target (OS packages, each jar, each lockfile); sum them.
      grep -E '^Total:' "$REPORTS/trivy-$safe.txt" | awk '
        { for (i = 1; i <= NF; i++) { if ($i == "(HIGH:") high += $(i+1); if ($i == "CRITICAL:") crit += $(i+1) } targets++ }
        END { if (targets) printf "   %d CRITICAL, %d HIGH across %d targets\n", crit, high, targets }'
    fi
  done
  [ $rc -eq 0 ] && echo "✔ No fixable $SEVERITY vulnerabilities" \
    || echo "✘ Findings in reports/trivy-*.txt (only issues with a fix available are counted)"
  return $rc
}

case "${1:-all}" in
  secrets) scan_secrets ;;
  images) scan_images ;;
  all)
    status=0
    scan_secrets || status=1
    echo
    scan_images || status=1
    exit $status
    ;;
  *) echo "Usage: scripts/scan.sh {secrets|images|all}" >&2; exit 2 ;;
esac
