# Jenkins Docker Setup

## 📁 Data Persistence

All Jenkins data is stored on your local machine in the following directory:

- **Jenkins Home**: `./jenkins_home` - Contains all Jenkins configurations, jobs, plugins, and build history

## 🔧 Configuration Details

### Security Improvements

- ✅ Removed `user: root` (security risk eliminated)
- ✅ Running as default `jenkins` user
- ✅ Docker socket mounted for Docker-in-Docker capabilities

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
cd /Users/sithumraigamage/Development/jenkins
docker-compose up -d
```

### Stop Jenkins

```bash
docker-compose down
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
