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

## Login

Grafana user is `admin`. The password is `GRAFANA_ADMIN_PASSWORD` from `observability/.env` **at the first start only**; Grafana stores it in its volume, so editing `.env` later changes nothing. To change it:

```bash
docker exec -it obs-grafana grafana cli admin reset-admin-password 'new-password'
```

Then put the same value in `.env` so the file stays truthful.

## cAdvisor on Docker Desktop

Recent Docker Desktop stores images with containerd. cAdvisor needs three things to see containers there, all set in `docker-compose.yml`:

1. **v0.54 or newer** (`ghcr.io/google/cadvisor`). Older versions log `failed to identify the read-write layer ID` and report no containers.
2. **The Docker socket mounted as a file** (`/var/run/docker.sock`). Mounting the whole `/var/run` folder does not pass it through.
3. **The containerd socket** (`/run/containerd/containerd.sock`).

Check it works: Prometheus → query `container_memory_working_set_bytes{name!=""}` should return one series per running container. cAdvisor's own logs are in Loki: `{container="obs-cadvisor"}`.

## Resource cost

Measured on 12 Nov 2026: about 300 MB RAM for all five containers (Grafana ~90 MB, Loki ~70 MB, Prometheus ~55 MB, Promtail ~40 MB, cAdvisor ~20 MB). Limits in `docker-compose.yml` cap the total at about 1.6 GB.
