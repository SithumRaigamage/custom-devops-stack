# Observability

Container metrics and central logs for the stack. All ports bind to `127.0.0.1`.

| Service | URL | Purpose |
|---|---|---|
| Grafana | http://localhost:3002 | Dashboards. The provisioned **Stack → Stack containers** dashboard shows CPU, memory, memory vs limit, network and logs per container |
| Prometheus | http://localhost:9090 | Metrics store (15 days by default) |
| cAdvisor | http://localhost:8081 | Per-container metrics exporter |
| Loki | http://localhost:3100 | Log store (7 days) |
| Promtail | (internal) | Ships every container's logs to Loki, labelled `container`, `project`, `service` |

## Start

```bash
cp observability/.env.example observability/.env   # set GRAFANA_ADMIN_PASSWORD
make up S=jenkins        # creates the shared devops-network if it doesn't exist yet
make observability-up
```

Useful log queries in Grafana → Explore → Loki:

- `{project="jenkins"}`: all Jenkins logs
- `{project="sonarqube"} |= "ERROR"`: SonarQube errors
- `{container=~".+"} |~ "(?i)out of memory|oom"`: OOM anywhere

## Jenkins and SonarQube metrics

- **Jenkins:** install the *Prometheus metrics* plugin. Prometheus already scrapes `jenkins:8080/prometheus` and shows the target as down until the plugin is installed.
- **SonarQube:** its monitoring endpoint needs a system passcode. See the comment in `prometheus/prometheus.yml`.

Resource cost: about 1.5 GB RAM in total with the limits set in `docker-compose.yml`.
