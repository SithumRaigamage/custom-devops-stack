#!/bin/bash
set -euo pipefail

# Grant the jenkins user access to the bind-mounted Docker socket without
# making it world-writable (no `chmod 666`). The socket's GID varies by
# host, so this matches it dynamically instead of hardcoding one.
if [ -S /var/run/docker.sock ]; then
  DOCKER_GID="$(stat -c '%g' /var/run/docker.sock)"
  if ! getent group "$DOCKER_GID" > /dev/null 2>&1; then
    groupadd -g "$DOCKER_GID" docker-host
  fi
  DOCKER_GROUP="$(getent group "$DOCKER_GID" | cut -d: -f1)"
  usermod -aG "$DOCKER_GROUP" jenkins
fi

# Drop from root to the unprivileged jenkins user for the actual process.
exec gosu jenkins /usr/bin/tini -- /usr/local/bin/jenkins.sh "$@"
