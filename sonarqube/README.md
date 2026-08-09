# SonarQube Docker Setup

## 📁 Data Persistence

All SonarQube data is stored on your local machine in the following directories:
- **Data**: `./data` - SonarQube application data and embedded Elasticsearch indices
- **Extensions**: `./extensions` - Plugins and custom extensions
- **Logs**: `./logs` - Application logs
- **PostgreSQL**: `./postgresql` - Database files (all analysis results, projects, users, settings)

## 🔧 Configuration Details

### Production-Ready Setup
- ✅ PostgreSQL database (instead of embedded H2)
- ✅ Removed unused volume definitions
- ✅ Added resource limits
- ✅ Network configuration for Jenkins integration

### Services

#### SonarQube Server
- **Image**: `sonarqube:10.8.0-community`
- **Memory**: 4GB limit, 1GB reserved
- **CPU**: 2 cores maximum
- **Port**: 9000

#### PostgreSQL Database
- **Image**: `postgres:15-alpine`
- **Memory**: 1GB limit
- **CPU**: 1 core maximum
- **Database Name**: `sonar`
- **Username**: `sonar`
- **Password**: `sonar_secure_password` (⚠️ Change this in production!)

### Network
- **Network Name**: `devops-network`
- **Purpose**: Allows communication with Jenkins and other services

## 🚀 Usage

### First Time Setup
```bash
cd /Users/sithumraigamage/Development/sonarqube

# Create required directories if they don't exist
mkdir -p data extensions logs postgresql

# Set proper permissions (SonarQube runs as UID 1000)
sudo chown -R 1000:1000 data extensions logs
```

### Start SonarQube
```bash
docker-compose up -d
```

### Stop SonarQube
```bash
docker-compose down
```

### View Logs
```bash
# SonarQube logs
docker-compose logs -f sonarqube

# Database logs
docker-compose logs -f sonarqube-db
```

### Access SonarQube
Open your browser and navigate to: `http://localhost:9000`

**Default Credentials**:
- Username: `admin`
- Password: `admin` (you'll be prompted to change this on first login)

## 🔗 Integration with Jenkins

Both Jenkins and SonarQube are on the same `devops-network`.

**From Jenkins Pipeline**:
```groovy
environment {
    SONAR_HOST_URL = 'http://sonarqube:9000'
}
```

**From your local machine**:
```
http://localhost:9000
```

## 🔐 Security Recommendations

### Change Default Passwords
1. **SonarQube Admin**: Change on first login
2. **PostgreSQL Password**: Update in `docker-compose.yml`:
   ```yaml
   POSTGRES_PASSWORD: your_secure_password_here
   SONAR_JDBC_PASSWORD: your_secure_password_here
   ```

### Generate Authentication Token
For Jenkins integration:
1. Login to SonarQube
2. Go to: User → My Account → Security
3. Generate a token
4. Use this token in Jenkins credentials

## 📦 Backup

To backup all SonarQube data:
```bash
cd /Users/sithumraigamage/Development/sonarqube

# Stop services first
docker-compose down

# Create backup
tar -czf sonarqube-backup-$(date +%Y%m%d).tar.gz data/ extensions/ logs/ postgresql/

# Restart services
docker-compose up -d
```

## 🔄 Restore

To restore from backup:
```bash
# Stop services
docker-compose down

# Remove current data
rm -rf data/ extensions/ logs/ postgresql/

# Extract backup
tar -xzf sonarqube-backup-YYYYMMDD.tar.gz

# Restart services
docker-compose up -d
```

## 🧹 Complete Reset

To completely reset SonarQube (⚠️ This will delete all data):
```bash
docker-compose down
rm -rf data/ extensions/ logs/ postgresql/
docker-compose up -d
```

## ⚠️ Important Notes

- All data persists on your machine, not inside containers
- Deleting containers will NOT delete your data
- PostgreSQL database contains all your analysis history
- First startup may take 2-3 minutes while database initializes
- Ensure you have at least 6GB of free RAM for optimal performance

## 🐛 Troubleshooting

### SonarQube won't start
1. Check logs: `docker-compose logs sonarqube`
2. Verify permissions: `ls -la data/ extensions/ logs/`
3. Ensure PostgreSQL is running: `docker-compose ps`

### Database connection issues
1. Check database logs: `docker-compose logs sonarqube-db`
2. Verify network: `docker network inspect devops-network`
3. Ensure passwords match in environment variables

### Out of memory errors
1. Increase Docker Desktop memory allocation (Settings → Resources)
2. Adjust resource limits in `docker-compose.yml`
