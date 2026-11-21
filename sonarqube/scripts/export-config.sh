#!/usr/bin/env bash
# Export the SonarQube quality gate and quality profiles that setup-quality.sh creates,
# so they can be committed and survive a lost volume. No secrets are written.
#
#   sonarqube/scripts/export-config.sh        writes sonarqube/config/
#
# Requires SONAR_TOKEN (a USER token with admin rights) in sonarqube/.env.
# Restore a profile: Quality Profiles → Restore (or POST api/qualityprofiles/restore).
# Recreate the gate: run setup-quality.sh; quality-gate.json records its conditions.
set -euo pipefail

cd "$(dirname "$0")/.."
set -a; [[ -f .env ]] && . ./.env; set +a
: "${SONAR_TOKEN:?Set SONAR_TOKEN (User Token) in sonarqube/.env}"
HOST="${SONAR_HOST_URL:-http://localhost:9000}"
GATE="Industry Standard"
PROFILE="Company Way"
OUT="config"

get() { curl -sS -f -u "$SONAR_TOKEN:" -G "$HOST/api/$1" "${@:2}"; }  # gitleaks:allow (env var, not a literal)

get system/status >/dev/null 2>&1 || { echo "SonarQube is not reachable at $HOST (start it: make up S=sonarqube)" >&2; exit 1; }

# Write to a temp dir and swap in only when everything exported, so a failure
# never leaves half-written files.
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/quality-profiles"

# Gate: keep only the stable parts (name and conditions), not server-generated IDs.
get qualitygates/show --data-urlencode "name=$GATE" | python3 -c '
import json, sys
g = json.load(sys.stdin)
conds = sorted(({"metric": c["metric"], "op": c["op"], "error": c["error"]}
                for c in g.get("conditions", [])), key=lambda c: c["metric"])
json.dump({"name": g["name"], "conditions": conds}, sys.stdout, indent=2)
print()' >"$TMP/quality-gate.json"

langs="$(get qualityprofiles/search --data-urlencode "qualityProfile=$PROFILE" | python3 -c '
import json, sys
print(" ".join(sorted(p["language"] for p in json.load(sys.stdin)["profiles"])))')"
[[ -n "$langs" ]] || { echo "No '$PROFILE' profiles found; run setup-quality.sh first" >&2; exit 1; }
for lang in $langs; do
  get qualityprofiles/backup --data-urlencode "language=$lang" \
    --data-urlencode "qualityProfile=$PROFILE" >"$TMP/quality-profiles/$lang.xml"
  echo >>"$TMP/quality-profiles/$lang.xml"  # end with a newline, as the pre-commit hook requires
done
rm -rf "$OUT"; mv "$TMP" "$OUT"; chmod 755 "$OUT"; trap - EXIT
echo "Exported gate '$GATE' → $OUT/quality-gate.json"
echo "Exported '$PROFILE' for: $langs → $OUT/quality-profiles/"
