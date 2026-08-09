FROM jenkins/jenkins:latest

USER root

# Install basic dependencies
RUN apt-get update && \
    apt-get install -y wget apt-transport-https gnupg lsb-release libatomic1 && \
    rm -rf /var/lib/apt/lists/*

# Add Trivy repository (using bookworm as trixie is not yet supported)
RUN wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key | gpg --dearmor | tee /usr/share/keyrings/trivy.gpg > /dev/null && \
    echo "deb [signed-by=/usr/share/keyrings/trivy.gpg] https://aquasecurity.github.io/trivy-repo/deb bookworm main" | tee -a /etc/apt/sources.list.d/trivy.list

# Install Trivy and Docker CLI
RUN apt-get update && \
    apt-get install -y trivy docker.io && \
    rm -rf /var/lib/apt/lists/*

USER jenkins

