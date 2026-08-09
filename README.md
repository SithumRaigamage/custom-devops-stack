# DevOps Infrastructure Overview

This directory (`custom-devops-stack/`) contains the Docker configurations and control script for your complete local CI/CD infrastructure.

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

### 3. MongoDB (local manual install, outside this folder)
- **Purpose**: General-purpose database used by local projects
- **Port**: 27017 (default)
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
- **MongoDB**: mongodb://localhost:27017

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
| MongoDB | Database files | `../mongodb-macos-aarch64--8.2.3/data/db` |

**Important**: Deleting Docker containers will NOT delete your data!

## 🔐 Security Checklist

- [x] Jenkins not running as root
- [x] SonarQube using PostgreSQL (production-ready)
- [x] Services on isolated network
- [ ] Change SonarQube admin password (do on first login)
- [ ] Change PostgreSQL password in `sonarqube/docker-compose.yml`
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
lsof -i :27017

# Change ports in docker-compose.yml if needed
```

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
3. Add a `start_<service>` / `stop_<service>` function pair in `script.sh`, and call them from `start_services` / `stop_services`.
4. Document the new service in the **Services** and **Data Persistence** sections above.

## 📝 TODO / Ideas for Later

- [ ] Add `status` command to `script.sh` that checks all services at once (docker ps + pgrep mongod)
- [ ] Add `logs` command to `script.sh` for quick `docker compose logs -f` per service
- [ ] Add a `restart` command
- [ ] Wire up automated nightly backups (cron/launchd) using the backup script above
- [ ] Add MongoDB authentication + connection string env var
- [ ] Consider moving MongoDB into Docker Compose on `devops-network` for consistency

## 📚 Additional Resources

- [Jenkins Documentation](https://www.jenkins.io/doc/)
- [SonarQube Documentation](https://docs.sonarqube.org/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [MongoDB Documentation](https://www.mongodb.com/docs/)

## ✅ What Was Fixed

### Jenkins
- ✅ Removed `user: root` security vulnerability
- ✅ Removed unused volume definitions
- ✅ Added `devops-network` for service communication
- ✅ Added resource limits (3GB RAM, 2 CPUs)
- ✅ Added JVM optimization flags
- ✅ All data persists in `./jenkins_home` on your machine

### SonarQube
- ✅ Fixed version (was 26.x, now 10.8.0-community)
- ✅ Added PostgreSQL database (production-ready)
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
