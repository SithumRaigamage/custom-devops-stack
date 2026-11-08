#!/usr/bin/env bash
# Idempotently create the "Industry Standard" quality gate and "Company Way"
# quality profiles in SonarQube, and make them the defaults.
# Requires SONAR_TOKEN (a USER token with admin rights) in sonarqube/.env.
set -euo pipefail

cd "$(dirname "$0")/.."
set -a; [[ -f .env ]] && . ./.env; set +a
: "${SONAR_TOKEN:?Set SONAR_TOKEN (User Token) in sonarqube/.env}"
HOST="${SONAR_HOST_URL:-http://localhost:9000}"
GATE="Industry Standard"
PROFILE="Company Way"
# Languages that also get every VULNERABILITY and BUG rule activated.
STRICT_LANGS="java,js,ts,py,go,php,cs,kotlin,ruby,scala"

api() { # api <path> [curl --data-urlencode args...]; prints body, fails on HTTP error
  local path="$1"; shift
  curl -sS -f -u "$SONAR_TOKEN:" -X POST "$HOST/api/$path" "$@"
}
get() { curl -sS -f -u "$SONAR_TOKEN:" -G "$HOST/api/$1" "${@:2}"; }

# ---- Quality gate (Clean as You Code: conditions on new code) ----
if get qualitygates/list | python3 -c "import sys,json;sys.exit(0 if any(g['name']=='$GATE' for g in json.load(sys.stdin)['qualitygates']) else 1)"; then
  echo "Gate '$GATE' exists; leaving conditions as-is"
else
  echo "Creating gate '$GATE'"
  api qualitygates/create --data-urlencode "name=$GATE" >/dev/null
  # New gates ship with some default conditions, so "already exists" is fine.
  cond() { api qualitygates/create_condition --data-urlencode "gateName=$GATE" \
           --data-urlencode "metric=$1" --data-urlencode "op=$2" --data-urlencode "error=$3" >/dev/null 2>&1 \
           || echo "  condition $1 already present"; }
  cond new_coverage                    LT 80
  cond new_duplicated_lines_density    GT 3
  cond new_reliability_rating          GT 1
  cond new_security_rating             GT 1
  cond new_maintainability_rating      GT 1
  cond new_security_hotspots_reviewed  LT 100
fi
api qualitygates/set_as_default --data-urlencode "name=$GATE" >/dev/null
echo "Default gate: $GATE"

# ---- Quality profiles ----
get qualityprofiles/search | python3 -c '
import sys,json
for p in json.load(sys.stdin)["profiles"]:
    if p["isBuiltIn"] and p["name"]=="Sonar way": print(p["language"], p["key"])
' | while read -r lang key; do
  exists=$(get qualityprofiles/search --data-urlencode "language=$lang" --data-urlencode "qualityProfile=$PROFILE" \
           | python3 -c 'import sys,json;p=json.load(sys.stdin)["profiles"];print(p[0]["key"] if p else "")')
  if [[ -z "$exists" ]]; then
    api qualityprofiles/copy --data-urlencode "fromKey=$key" --data-urlencode "toName=$PROFILE" >/dev/null
    exists=$(get qualityprofiles/search --data-urlencode "language=$lang" --data-urlencode "qualityProfile=$PROFILE" \
             | python3 -c 'import sys,json;print(json.load(sys.stdin)["profiles"][0]["key"])')
    echo "Created $lang/$PROFILE"
  fi
  if [[ ",$STRICT_LANGS," == *",$lang,"* ]]; then
    api qualityprofiles/activate_rules --data-urlencode "targetKey=$exists" \
      --data-urlencode "languages=$lang" --data-urlencode "types=VULNERABILITY,BUG" >/dev/null \
      || echo "  (could not bulk-activate rules for $lang)"
  fi
  api qualityprofiles/set_default --data-urlencode "language=$lang" --data-urlencode "qualityProfile=$PROFILE" >/dev/null
  echo "Default $lang: $PROFILE"
done

# ---- Access control ----
TEMPLATE="Standard Project"
api settings/set --data-urlencode "key=sonar.forceAuthentication" --data-urlencode "value=true" >/dev/null
echo "Anonymous access disabled (forceAuthentication=true)"
if get permissions/search_templates | python3 -c "import sys,json;sys.exit(0 if any(t['name']=='$TEMPLATE' for t in json.load(sys.stdin)['permissionTemplates']) else 1)"; then
  echo "Template '$TEMPLATE' exists; leaving permissions as-is"
else
  api permissions/create_template --data-urlencode "name=$TEMPLATE" \
    --data-urlencode "description=Users view and triage issues; administrators manage everything" >/dev/null
  grant() { api permissions/add_group_to_template --data-urlencode "templateName=$TEMPLATE" \
            --data-urlencode "groupName=$1" --data-urlencode "permission=$2" >/dev/null; }
  for p in user codeviewer issueadmin; do grant sonar-users "$p"; done
  for p in user codeviewer issueadmin securityhotspotadmin scan admin; do grant sonar-administrators "$p"; done
  echo "Created template '$TEMPLATE'"
fi
api permissions/set_default_template --data-urlencode "templateName=$TEMPLATE" --data-urlencode "qualifier=TRK" >/dev/null
echo "Default permission template: $TEMPLATE"
