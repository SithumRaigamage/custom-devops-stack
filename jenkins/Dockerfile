FROM jenkins/jenkins:lts-jdk21

USER root

# Install basic dependencies
RUN apt-get update && \
    apt-get install -y wget ca-certificates libatomic1 && \
    rm -rf /var/lib/apt/lists/*

# Docker CLI only (the engine runs on the host via docker.sock)
RUN apt-get update && \
    apt-get install -y --no-install-recommends docker-cli && \
    rm -rf /var/lib/apt/lists/*

# Trivy from the pinned GitHub release, checksum-verified. The aquasecurity apt repo
# can't be verified on Debian trixie (its signing key is rejected by apt's sqv), so
# the .deb repo is no longer used.
ARG TRIVY_VERSION=0.76.2
RUN set -eux; \
    case "$(dpkg --print-architecture)" in \
        amd64) trivyArch='64bit' ;; \
        arm64) trivyArch='ARM64' ;; \
        *) echo "unsupported architecture" >&2; exit 1 ;; \
    esac; \
    base="https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}"; \
    file="trivy_${TRIVY_VERSION}_Linux-${trivyArch}.tar.gz"; \
    cd /tmp; \
    wget -q "${base}/${file}" "${base}/trivy_${TRIVY_VERSION}_checksums.txt"; \
    grep " ${file}\$" "trivy_${TRIVY_VERSION}_checksums.txt" | sha256sum -c -; \
    tar -xzf "${file}" -C /usr/local/bin trivy; \
    rm -f "${file}" "trivy_${TRIVY_VERSION}_checksums.txt"; \
    trivy --version

# gosu lets the entrypoint start as root just long enough to fix docker.sock
# group access, then drop to the unprivileged jenkins user for the real process.
ARG GOSU_VERSION=1.19
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
