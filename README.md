# DevOps Infrastructure Overview

This directory (`custom-devops-stack/`) contains the Docker configurations and control script for your complete local CI/CD infrastructure.

## 🧭 Workspace at a Glance

A local DevOps lab on one Mac. Each service lives in its own subfolder with its
own `docker-compose.yml`, README and bind-mounted data (no named volumes, so
`docker volume prune` cannot delete it).

```
custom-devops-stack/
├── Makefile         # `make help`: one entry point for the whole stack
├── scripts/         # stack.sh (up/down/status/logs/doctor/bootstrap), backup.sh, scan.sh
├── script.sh        # Legacy: Jenkins, SonarQube and the local mongod (kept for compatibility)
├── dashboard/       # StackPilot: web dashboard to run and watch the stack
├── jenkins/         # CI/CD server
├── sonarqube/       # Code quality (+ PostgreSQL)
├── open-webui/      # Chat UI for local Ollama models (own scripts + `webui` shell command)
├── postgres/        # General-purpose PostgreSQL
├── mongodb/         # MongoDB 7 in Docker
├── observability/   # Prometheus, Grafana, cAdvisor, Loki, Promtail
├── images/          # Saved image tars for offline reload (git-ignored)
├── backups/         # Output of `make backup` (git-ignored)
├── reports/         # Output of `make scan` (git-ignored)
└── docs/            # Tools and practices roadmaps
```

How to work here:

1. Start Docker Desktop (it does not start at login). Ollama must also be running for Open WebUI and the assistant.
2. First time on a machine: `make bootstrap`, then `make doctor`.
3. Start what you need: `make up` (dashboard DB, Jenkins, SonarQube), or pick: `make up S="open-webui mongodb"`.
4. `make status`, `make logs S=jenkins`, `make down` (everything) or `make down S=sonarqube`.
5. `make dashboard` runs StackPilot on http://localhost:3001.
6. `make backup` before upgrades; `make scan` for secrets and image vulnerabilities; `make observability-up` for Grafana.
7. Never commit secrets: real values go in gitignored `.env` files, with `.env.example` as the template. The pre-commit hooks (`pre-commit install`) block `.env` files and token-like strings.

Everything `make` does is a thin wrapper around `scripts/*.sh`, so `scripts/stack.sh up jenkins` works without make.
Services: `jenkins sonarqube open-webui postgres mongodb dashboard-db`. Jenkins and SonarQube now bind to
127.0.0.1; set `JENKINS_BIND=0.0.0.0` or `SONAR_BIND=0.0.0.0` in their `.env` to reach them from other machines.

### Open WebUI shell command (`webui`)

Add this line to `~/.zshrc` and open a new terminal:

```bash
source "$HOME/Other/02-DevOps-Lab/custom-devops-stack/open-webui/webui.zsh"
```

Then from any directory: `webui start | stop | restart | status | logs [-f] | open | update | cd | help`.
Full table in `open-webui/README.md`.

## 📦 Services

### 1. Jenkins (`./jenkins`)
- **Purpose**: CI/CD automation server
- **Port**: 8080 (UI), 50000 (Agents)
- **Data Location**: `./jenkins/jenkins_home`
- **Documentation**: See `jenkins/README.md`

### 2. SonarQube (`./sonarqube`)
- **Purpose**: Code quality and security analysis
- **Port**: 9000
- **Data Locations**:
  - `./sonarqube/data` (SonarQube data)
  - `./sonarqube/postgresql` (Database)
- **Documentation**: See `sonarqube/README.md`

### 3. Open WebUI (`./open-webui`)
- **Purpose**: Chat interface for local Ollama models
- **Port**: 3000 (bound to `127.0.0.1` only)
- **Data Location**: `./open-webui/data` (chats and settings)
- **Image backup**: `./open-webui/backup/open-webui-image.tar` (reloaded if a prune removes the image)
- **Requires**: Ollama running on the host (`http://localhost:11434`)
- **Documentation**: See `open-webui/README.md`
- **Not** on `devops-network`; it reaches Ollama through `host.docker.internal`

### 4. MongoDB (local manual install, outside this folder)
- **Purpose**: General-purpose database used by local projects
- **Port**: 27018 (default; override with `MONGO_PORT=xxxxx ./script.sh mongo-start`) — not 27017, because an unrelated project's `expense-tracker-db` Docker container already binds 27017 on this machine
- **Binary**: `../mongodb-macos-aarch64--8.2.3/bin/mongod`
- **Data Location**: `../mongodb-macos-aarch64--8.2.3/data/db`
- **Log**: `../mongodb-macos-aarch64--8.2.3/mongodb.log`
- **Managed by**: `./script.sh` (`mongo-start` / `mongo-stop`) — not containerized, runs as a local process

## 🌐 Network Architecture

Jenkins and SonarQube are connected via a shared Docker network: `devops-network`

```
┌─────────────────────────────────────────────┐
│         devops-network (bridge)             │
│                                             │
│  ┌──────────────┐      ┌─────────────────┐ │
│  │   Jenkins    │─────▶│   SonarQube     │ │
│  │  :8080       │      │   :9000         │ │
│  └──────────────┘      └─────────────────┘ │
│                              │              │
│                        ┌─────▼──────────┐   │
│                        │  PostgreSQL    │   │
│                        │  :5432         │   │
│                        └────────────────┘   │
└─────────────────────────────────────────────┘

MongoDB runs separately as a local process (not on devops-network).
```

## 🚀 Quick Start

### Using the control script (recommended)
```bash
cd /Users/sithumraigamage/Development/custom-devops-stack

./script.sh start         # Starts MongoDB, Jenkins, SonarQube
./script.sh stop          # Stops SonarQube, Jenkins, MongoDB
./script.sh mongo-start   # Starts only MongoDB
./script.sh mongo-stop    # Stops only MongoDB
```

### Manual start (per service)
```bash
# Start Jenkins
cd /Users/sithumraigamage/Development/custom-devops-stack/jenkins
docker compose up -d

# Start SonarQube
cd /Users/sithumraigamage/Development/custom-devops-stack/sonarqube
docker compose up -d
```

### Check Status
```bash
docker ps
pgrep -x mongod
```

### Access Services
- **Jenkins**: http://localhost:8080
- **SonarQube**: http://localhost:9000
- **Open WebUI**: http://localhost:3000
- **MongoDB**: mongodb://localhost:27018

## 🔗 Integration Guide

### Configure SonarQube in Jenkins

1. **Install SonarQube Scanner Plugin** in Jenkins
   - Manage Jenkins → Plugins → Available Plugins
   - Search for "SonarQube Scanner"
   - Install and restart

2. **Add SonarQube Server** in Jenkins
   - Manage Jenkins → System → SonarQube servers
   - Name: `SonarQube`
   - Server URL: `http://sonarqube:9000`
   - Server authentication token: (generate in SonarQube)

3. **Configure Scanner** in Jenkins
   - Manage Jenkins → Tools → SonarQube Scanner
   - Add SonarQube Scanner
   - Install automatically

### Example Jenkinsfile
```groovy
pipeline {
    agent any

    environment {
        SONAR_HOST_URL = 'http://sonarqube:9000'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('SonarQube Analysis') {
            steps {
                withSonarQubeEnv('SonarQube') {
                    sh '''
                        sonar-scanner \
                          -Dsonar.projectKey=my-project \
                          -Dsonar.sources=. \
                          -Dsonar.host.url=${SONAR_HOST_URL}
                    '''
                }
            }
        }

        stage('Quality Gate') {
            steps {
                timeout(time: 1, unit: 'HOURS') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }
    }
}
```

See `jenkins/PIPELINE_TEMPLATE.md` and `jenkins/CI.JenkinsFile` for a ready-made pipeline template.

## 💾 Data Persistence

All data is stored on your local machine:

| Service | Data Type | Location |
|---------|-----------|----------|
| Jenkins | All configurations, jobs, builds | `./jenkins/jenkins_home` |
| SonarQube | Application data | `./sonarqube/data` |
| SonarQube | Extensions/Plugins | `./sonarqube/extensions` |
| SonarQube | Logs | `./sonarqube/logs` |
| PostgreSQL | Database files | `./sonarqube/postgresql` |
| Open WebUI | Chats and settings | `./open-webui/data` |
| Open WebUI | Image backup tar | `./open-webui/backup` |
| MongoDB | Database files | `../mongodb-macos-aarch64--8.2.3/data/db` |

**Important**: Deleting Docker containers will NOT delete your data!

## 🔐 Security Checklist

- [x] Jenkins process runs as the unprivileged `jenkins` user (drops from root via `gosu` at entrypoint — see `jenkins/docker-entrypoint-wrapper.sh`)
- [x] Docker socket access is granted via matching group GID, not `chmod 666` (not world-writable)
- [x] SonarQube using PostgreSQL (production-ready)
- [x] SonarQube DB password lives in gitignored `sonarqube/.env`, not committed in `docker-compose.yml`
- [x] Services on isolated network
- [ ] Change SonarQube admin password (do on first login)
- [ ] Rotate the SonarQube DB password (see `sonarqube/.env.example` for the `ALTER USER` command needed since the DB is already initialized)
- [ ] Generate SonarQube token for Jenkins
- [ ] Enable HTTPS (if exposing to internet)
- [ ] Configure firewall rules
- [ ] Set a MongoDB auth user (currently unauthenticated local install)

## 📦 Backup Strategy

### Full Backup
```bash
#!/bin/bash
BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
STACK_DIR="/Users/sithumraigamage/Development/custom-devops-stack"
DEV_DIR="/Users/sithumraigamage/Development"
BACKUP_DIR="$DEV_DIR/backups"

mkdir -p "$BACKUP_DIR"

# Stop services
"$STACK_DIR/script.sh" stop

# Create backups
tar -czf "$BACKUP_DIR/jenkins-$BACKUP_DATE.tar.gz" -C "$STACK_DIR/jenkins" jenkins_home
tar -czf "$BACKUP_DIR/sonarqube-$BACKUP_DATE.tar.gz" -C "$STACK_DIR/sonarqube" data extensions logs postgresql
tar -czf "$BACKUP_DIR/mongodb-$BACKUP_DATE.tar.gz" -C "$DEV_DIR/mongodb-macos-aarch64--8.2.3" data

# Restart services
"$STACK_DIR/script.sh" start

echo "Backup completed: $BACKUP_DIR"
```

## 🧹 Maintenance

### Update Services
```bash
cd /Users/sithumraigamage/Development/custom-devops-stack/jenkins
docker compose pull
docker compose up -d

cd /Users/sithumraigamage/Development/custom-devops-stack/sonarqube
docker compose pull
docker compose up -d
```

### Clean Up
```bash
# Remove unused images
docker image prune -a

# Remove unused volumes (⚠️ Be careful!)
docker volume prune
```

### View Resource Usage
```bash
docker stats
```

## 🐛 Troubleshooting

### Services won't start
```bash
# Check logs
docker compose logs

# Check available resources
docker system df

# Restart Docker Desktop
```

### MongoDB won't start
```bash
# Check the log
tail -n 50 /Users/sithumraigamage/Development/mongodb-macos-aarch64--8.2.3/mongodb.log

# Check for a stale lock file
ls /Users/sithumraigamage/Development/mongodb-macos-aarch64--8.2.3/data/db/mongod.lock
```

### Network issues
```bash
# Inspect network
docker network inspect devops-network

# Recreate network
docker network rm devops-network
docker network create devops-network
```

### Port conflicts
```bash
# Check what's using the port
lsof -i :8080
lsof -i :9000
lsof -i :27018

# Change ports in docker-compose.yml (Jenkins/SonarQube) or via
# MONGO_PORT=xxxxx ./script.sh mongo-start (MongoDB) if needed
```

Note: port 27017 (Mongo's default) is already taken on this machine by an
unrelated project's `expense-tracker-db` Docker container — that's why this
stack's local `mongod` defaults to 27018 instead.

## ➕ Adding a New Service to the Stack

1. Create a new subfolder under `custom-devops-stack/` (e.g. `custom-devops-stack/registry/`) with its own `docker-compose.yml`.
2. Attach it to the shared network by adding to its compose file:
   ```yaml
   networks:
     - devops-network
   networks:
     devops-network:
       external: true
   ```
3. Add a line for it to `SERVICES` in `scripts/stack.sh` (and to `IMAGE_TARS` if you keep an offline tar), and to the port table in `docs/TOOLS-ROADMAP.md`.
4. Document the new service in the **Services** and **Data Persistence** sections above.

## 📝 TODO / Ideas for Later

- [x] `make status`
- [x] `make logs S=<service>`
- [x] `make restart`
- [ ] Wire up automated nightly backups (cron/launchd) using the backup script above
- [ ] Add MongoDB authentication + connection string env var
- [ ] Consider moving MongoDB into Docker Compose on `devops-network` for consistency

## 📚 Additional Resources

- [Tools roadmap](docs/TOOLS-ROADMAP.md) — tools to add to this stack, priorities and resource notes
- [Jenkins Documentation](https://www.jenkins.io/doc/)
- [SonarQube Documentation](https://docs.sonarqube.org/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [MongoDB Documentation](https://www.mongodb.com/docs/)

## ✅ What Was Fixed

### Jenkins
- ✅ Jenkins process no longer runs as root — entrypoint starts as root only to fix docker.sock group access, then drops to `jenkins` via `gosu`
- ✅ Docker socket is no longer `chmod 666`'d (was world-writable; now scoped to the matching group)
- ✅ Removed unused volume definitions
- ✅ Added `devops-network` for service communication
- ✅ Added resource limits (3GB RAM, 2 CPUs)
- ✅ Added JVM optimization flags
- ✅ All data persists in `./jenkins_home` on your machine

### SonarQube
- ✅ Running `sonarqube:26.1.0.118079-community`
- ✅ Added PostgreSQL database (production-ready)
- ✅ DB password moved out of the committed `docker-compose.yml` into gitignored `sonarqube/.env`
- ✅ Removed unused volume definitions
- ✅ Added `devops-network` for service communication
- ✅ Added resource limits (4GB RAM for SonarQube, 1GB for PostgreSQL)
- ✅ All data persists in `./data`, `./extensions`, `./logs`, `./postgresql` on your machine

### Data Persistence
- ✅ All services use bind mounts (not named volumes)
- ✅ Data stored directly on your machine
- ✅ Easy to backup (just copy directories)
- ✅ Survives container deletion

### Folder Structure
- ✅ Consolidated `jenkins/`, `sonarqube/`, and `script.sh` under `custom-devops-stack/`
- ✅ `script.sh` now resolves paths relative to its own location instead of hardcoded paths
