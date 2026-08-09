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

# gosu lets the entrypoint start as root just long enough to fix docker.sock
# group access, then drop to the unprivileged jenkins user for the real process.
ARG GOSU_VERSION=1.17
RUN set -eux; \
    arch="$(dpkg --print-architecture)"; \
    case "$arch" in \
        amd64) gosuArch='amd64' ;; \
        arm64) gosuArch='arm64' ;; \
        *) echo "unsupported architecture: $arch" >&2; exit 1 ;; \
    esac; \
    wget -O /usr/local/bin/gosu "https://github.com/tianon/gosu/releases/download/${GOSU_VERSION}/gosu-${gosuArch}" && \
    chmod +x /usr/local/bin/gosu && \
    gosu nobody true

COPY docker-entrypoint-wrapper.sh /usr/local/bin/docker-entrypoint-wrapper.sh
RUN chmod +x /usr/local/bin/docker-entrypoint-wrapper.sh

ENTRYPOINT ["/usr/local/bin/docker-entrypoint-wrapper.sh"]

