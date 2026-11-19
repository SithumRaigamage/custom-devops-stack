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
cd ~/Other/02-DevOps-Lab/custom-devops-stack/jenkins
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

## 🧰 What pipelines can use on the agent

Builds run on the built-in node (2 executors) inside the `custom-jenkins` container,
which is **Debian 13 on arm64** on this Mac.

| Available | Name / ID in Jenkins |
| --- | --- |
| Docker CLI (host daemon via `docker.sock`) | — |
| Trivy 0.76.2 | on `PATH` (`TRIVY_VERSION` in `Dockerfile`) |
| Node.js 25.4.0 | tool `NODEJS` |
| SonarScanner | tool `SonarScanner`, server `SonarServer` (`http://sonarqube:9000`) |
| Credentials | `github-ssh-key`, `sonarqube-token`, `gmail-smtp-creds`, `github-token` |

Not on the agent: `python3`, a macOS agent (no `macos` label), a `codecov-token`
credential. Run anything else in a container (below).

### Running tools in containers (Docker-in-Docker)

Jenkins talks to the **host's** Docker daemon, so a `-v "$WORKSPACE:/repo"` mount
resolves `$WORKSPACE` on the host, where it doesn't exist: the container silently
gets an **empty** folder. Share the agent's real mount instead; the workspace keeps
the same path:

```bash
docker run --rm --volumes-from "$(hostname)" -w "$WORKSPACE" \
  -u "$(id -u):$(id -g)" -e HOME=/tmp <image> <command>
```

`-u` keeps files in the workspace owned by `jenkins`. Prefer multi-arch images:
x86-only binaries and the Linux Android build tools need `--platform linux/amd64`
(emulated, slower). `CI.JenkinsFile` already uses this pattern.

### Email recipients

The template's emails can take the sender from the `gmail-smtp-creds` credential's
username. Pipelines in public repositories should do that rather than hardcode
addresses; they read the receiver from a `CI_RECEIVER_EMAIL` global property
(Manage Jenkins → System → Global properties) when one is set.

## 🗂️ Job layout

Jobs live in `jenkins_home/jobs` (git-ignored). Convention:

```text
Projects/<Project>/<Project>-<component>/CI-Pipeline/<Project>-<component>-CI
Projects/<Project>/<Project>-<component>/CD-Pipeline/<Project>-<component>-CD
```

Each job is "Pipeline script from SCM" over SSH (`github-ssh-key`), lightweight
checkout, no concurrent builds, last 30 builds kept. Example: `Projects/JobTrigger`
(backend, frontend, website, security, tools CI; release CD), whose Jenkinsfiles
live in that repository under `Jenkins/<component>/Jenkinsfile`.

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
