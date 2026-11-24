# Design — P2-02: SonarQube → Jenkins webhook (J12), Hello-World Sonar URL (#16), memory limits (#32)

## J12 — SonarQube → Jenkins webhook

### What will change
- Add one **global** SonarQube webhook (Administration → Configuration → Webhooks)
  named `Jenkins`, URL `http://jenkins:8080/sonarqube-webhook/`, created through
  `POST /api/webhooks/create` with the token from gitignored `sonarqube/.env`.
- Global rather than per-project so every analysed project (JobTrigger,
  Hello-World-Node-JS, Demon-slayer) reports its gate to Jenkins.
- The URL uses the container name on `devops-network`, the same way Jenkins
  reaches `http://sonarqube:9000`. No port or binding changes.
- No webhook secret for now: both services are on the local Docker network. Signing
  the payload (a secret in SonarQube plus a Jenkins credential) is part of #14.

### Files touched
- SonarQube runtime config only (stored in the `sonarqube-db` database).
- `jenkins/PIPELINE_TEMPLATE.md` (drop "still needed"), `docs/backlog.md`, `docs/CHANGELOG.md`.

### Verification
- `GET /api/webhooks/list` shows the webhook; nothing secret is printed.
- From the `sonarqube` container, `http://jenkins:8080/sonarqube-webhook/` is reachable.
- Run a backend build with `SONARQUBE_SCAN=true`: `waitForQualityGate()` returns
  without the 5-minute poll timeout, and `GET /api/webhooks/deliveries` shows a
  delivery with HTTP 200.

## #16 — Hello-World-Node-JS SonarQube URL

Inspection on 2026-11-24 found nothing to change.
`Projects/Hello-World-Node-JS/CI/CI-Pipleine` (inline pipeline) already sets
`SONAR_SERVER_URL = 'http://sonarqube:9000'`. Its latest build, #40, ran with
`sonar.host.url=http://sonarqube:9000` and has no `host.docker.internal` hits, and no
job config still references `host.docker.internal`. Close the item as already done.

## #32 — Memory limits on the remaining services

### What will change
- Add `deploy.resources.limits.memory` to the compose services that `make doctor`
  reports as unlimited: dashboard-db, Open WebUI, Postgres, MongoDB.
- Base each limit on measured usage (`docker stats` at idle and under a light load),
  with headroom of about 2× the observed peak, rounded. Grafana history is used
  where it exists.

### Verification
- `make up S=<svc>` for each service, then `make doctor` shows a limit and no
  warning, `make status` shows it healthy, and `docker stats` usage is under the limit.

## Final outcome (2026-11-24)

### J12
- `POST /api/webhooks/create` was refused: SonarQube 26.x blocks webhooks to private
  addresses, and `jenkins` resolves to a `devops-network` IP. With user approval,
  `sonar.validateWebhooks` was set to `false` and the webhook was created with an HMAC
  secret (`hasSecret=true`). The secret is in gitignored `sonarqube/.env` as
  `SONAR_WEBHOOK_SECRET` (placeholder in `.env.example`).
- The Chrome extension wasn't connected, so Jenkins was configured with a one-shot
  `init.groovy.d` script and a restart. It added the credential `sonarqube-webhook-secret`
  and set it as `SonarServer`'s `webhookSecretId`. The secret reached the container through
  stdin into a mode-600 file. The script, the temp files (container and host) and the result
  files were removed afterwards and their absence checked. No value was printed.
- Verified: backend #8 → `waitForQualityGate()` answered in about 1 s (task `SUCCESS` → gate
  result). `GET /api/webhooks/deliveries` shows `JobTrigger http 200 success 26ms`.
- The gate itself is `ERROR` on `develop` (reliability C, security D, 20 new issues).
  Coverage and duplication pass, and the build ends UNSTABLE. This is a JobTrigger code
  issue, tracked as backlog J13.

### J10 (found while verifying)
- The first verification build (#7) failed: `docs/product-proposals-phase-26` no longer
  exists on the remote, because PR #149 was merged into `develop` on 2026-11-21 and the
  branch deleted. `develop` has all six `Jenkins/<component>/Jenkinsfile`s. Following the
  approved J10 plan, the six job configs were backed up to
  `backups/jenkins-job-configs-pre-J10-20261124-184959/` and switched to `*/develop` through
  Jenkins' API (init script, `job.save()`). Backend #8 ran from `develop` (`a93130d`).

### #16
- Already done, as found at inspection; no change.

### #32
- Limits from measured cgroup `memory.peak`: dashboard-db 512M (peak 82 MiB), postgres
  512M (72 MiB), mongodb 1G (247 MiB), open-webui 2G (789 MiB). After `make up`, all four
  were recreated and healthy, `docker stats` shows the limits, and
  `scripts/stack.sh doctor <all>` no longer lists unlimited containers.
- With every service counted, limits total 13.1 GiB against Docker's 10.6 GiB, so doctor
  warns for an all-services start. This is recorded as a caveat; the limits are caps, not
  reservations.
