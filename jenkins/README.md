# Jenkins Docker Setup

## 📁 Data Persistence

All Jenkins data is stored on your local machine in the following directory:

- **Jenkins Home**: `./jenkins_home` - Contains all Jenkins configurations, jobs, plugins, and build history

## 🔧 Configuration Details

### Security Improvements

- ✅ Jenkins itself runs as the unprivileged `jenkins` user, not root
- ✅ Docker socket is mounted for Docker-in-Docker, but is **not** `chmod 666`'d (not world-writable)
- ✅ Access to the socket is granted by matching the container's `jenkins` user to the socket's actual host GID (see `docker-entrypoint-wrapper.sh`), which requires the container to start as root only briefly during entrypoint setup before dropping to `jenkins` via `gosu`
- ⚠️ The `jenkins` user still has effective access to the Docker socket (needed for Docker-in-Docker pipeline stages), which is equivalent to root on the host if that access is abused — this is a real, accepted trade-off of Docker-in-Docker via socket mounting, not a fully solved problem
- ℹ️ Verified 2026-08-09: with the new entrypoint, the actual Jenkins/`java` process runs as `jenkins`, confirmed via `docker exec ... ps aux` (previously it ran as root). One caveat: on Docker Desktop for Mac specifically, `/var/run/docker.sock` is already `srw-rw-rw-` (world-accessible) inside the Docker Desktop VM regardless of what this entrypoint does — that's a property of Docker Desktop's socket proxy on this single-user dev machine, not something introduced by our config. The GID-matching approach is still the correct, portable fix: on a real Linux Docker host the socket is normally `660 root:docker`, and this approach grants access without ever widening it to world-writable.

### Resource Management

- **Memory**: 3GB limit, 512MB reserved
- **CPU**: 2 cores maximum
- **JVM Options**: `-Xmx2048m -Xms512m` (optimized heap size)

### Network

- **Network Name**: `devops-network`
- **Purpose**: Allows communication with SonarQube and other services

### Ports

- **8080**: Jenkins Web UI
- **50000**: Jenkins Agent communication

## 🚀 Usage

### Start Jenkins

```bash
cd /Users/sithumraigamage/Development/custom-devops-stack/jenkins
docker compose up -d
```

### Stop Jenkins

```bash
docker compose down
```

### View Logs

```bash
docker-compose logs -f jenkins
```

### Access Jenkins

Open your browser and navigate to: `http://localhost:8080`

### Initial Setup

1. Get the initial admin password:

```bash
cat ./jenkins_home/secrets/initialAdminPassword
```

2. Install suggested plugins
3. Create your first admin user

## 🔗 Integration with SonarQube

Both Jenkins and SonarQube are on the same `devops-network`, allowing them to communicate.

**SonarQube URL from Jenkins**: `http://sonarqube:9000`

## 📦 Backup

To backup all Jenkins data, simply copy the `jenkins_home` directory:

```bash
tar -czf jenkins-backup-$(date +%Y%m%d).tar.gz jenkins_home/
```

## 🔄 Restore

To restore from backup:

```bash
tar -xzf jenkins-backup-YYYYMMDD.tar.gz
```

## ⚠️ Important Notes

- All data persists on your machine, not inside the container
- Deleting the container will NOT delete your data
- To completely reset Jenkins, delete the `jenkins_home` directory
