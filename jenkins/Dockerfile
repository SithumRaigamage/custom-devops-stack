FROM jenkins/jenkins:lts-jdk21

USER root

# Install basic dependencies
RUN apt-get update && \
    apt-get install -y wget ca-certificates libatomic1 python3 python3-venv && \
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

# Scanners used by CI.JenkinsFile and the JobTrigger pipelines. Pinned release
# binaries, checksum-verified against the upstream checksum file, arm64 + amd64.
ARG GITLEAKS_VERSION=8.30.1
RUN set -eux; \
    case "$(dpkg --print-architecture)" in \
        amd64) glArch='x64' ;; \
        arm64) glArch='arm64' ;; \
        *) echo "unsupported architecture" >&2; exit 1 ;; \
    esac; \
    base="https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}"; \
    file="gitleaks_${GITLEAKS_VERSION}_linux_${glArch}.tar.gz"; \
    cd /tmp; \
    wget -q "${base}/${file}" "${base}/gitleaks_${GITLEAKS_VERSION}_checksums.txt"; \
    grep " ${file}\$" "gitleaks_${GITLEAKS_VERSION}_checksums.txt" | sha256sum -c -; \
    tar -xzf "${file}" -C /usr/local/bin gitleaks; \
    rm -f "${file}" "gitleaks_${GITLEAKS_VERSION}_checksums.txt"; \
    gitleaks version

ARG OSV_SCANNER_VERSION=2.7.0
RUN set -eux; \
    case "$(dpkg --print-architecture)" in \
        amd64) osvArch='amd64' ;; \
        arm64) osvArch='arm64' ;; \
        *) echo "unsupported architecture" >&2; exit 1 ;; \
    esac; \
    base="https://github.com/google/osv-scanner/releases/download/v${OSV_SCANNER_VERSION}"; \
    file="osv-scanner_linux_${osvArch}"; \
    cd /tmp; \
    wget -q "${base}/${file}" "${base}/osv-scanner_SHA256SUMS"; \
    grep " ${file}\$" osv-scanner_SHA256SUMS | sha256sum -c -; \
    install -m 0755 "${file}" /usr/local/bin/osv-scanner; \
    rm -f "${file}" osv-scanner_SHA256SUMS; \
    osv-scanner --version

ARG SYFT_VERSION=1.4.1
RUN set -eux; \
    case "$(dpkg --print-architecture)" in \
        amd64) syftArch='amd64' ;; \
        arm64) syftArch='arm64' ;; \
        *) echo "unsupported architecture" >&2; exit 1 ;; \
    esac; \
    base="https://github.com/anchore/syft/releases/download/v${SYFT_VERSION}"; \
    file="syft_${SYFT_VERSION}_linux_${syftArch}.tar.gz"; \
    cd /tmp; \
    wget -q "${base}/${file}" "${base}/syft_${SYFT_VERSION}_checksums.txt"; \
    grep " ${file}\$" "syft_${SYFT_VERSION}_checksums.txt" | sha256sum -c -; \
    tar -xzf "${file}" -C /usr/local/bin syft; \
    rm -f "${file}" "syft_${SYFT_VERSION}_checksums.txt"; \
    syft --version

ARG HADOLINT_VERSION=2.12.0
RUN set -eux; \
    case "$(dpkg --print-architecture)" in \
        amd64) hlArch='x86_64' ;; \
        arm64) hlArch='arm64' ;; \
        *) echo "unsupported architecture" >&2; exit 1 ;; \
    esac; \
    base="https://github.com/hadolint/hadolint/releases/download/v${HADOLINT_VERSION}"; \
    file="hadolint-Linux-${hlArch}"; \
    cd /tmp; \
    wget -q "${base}/${file}" "${base}/${file}.sha256"; \
    sha256sum -c "${file}.sha256"; \
    install -m 0755 "${file}" /usr/local/bin/hadolint; \
    rm -f "${file}" "${file}.sha256"; \
    hadolint --version

# Semgrep has no upstream checksum file; pin the exact version in its own venv.
ARG SEMGREP_VERSION=1.185.0
RUN set -eux; \
    python3 -m venv /opt/semgrep; \
    /opt/semgrep/bin/pip install --no-cache-dir --disable-pip-version-check "semgrep==${SEMGREP_VERSION}"; \
    ln -s /opt/semgrep/bin/semgrep /usr/local/bin/semgrep; \
    semgrep --version

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
