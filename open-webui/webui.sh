#!/usr/bin/env bash
# Start Open WebUI, loading the image from a local tar backup when possible.
set -euo pipefail

cd "$(dirname "$0")"

IMAGE="ghcr.io/open-webui/open-webui:main"
BACKUP_DIR="./backup"
BACKUP_TAR="$BACKUP_DIR/open-webui-image.tar"

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  if [ -f "$BACKUP_TAR" ]; then
    echo "Image missing; loading from $BACKUP_TAR"
    docker load -i "$BACKUP_TAR"
  else
    echo "Image missing and no backup tar; pulling $IMAGE"
    docker pull "$IMAGE"
  fi
fi

if [ ! -f "$BACKUP_TAR" ]; then
  echo "No backup tar yet; saving image to $BACKUP_TAR"
  mkdir -p "$BACKUP_DIR"
  docker save -o "$BACKUP_TAR" "$IMAGE"
fi

mkdir -p ./data
docker compose up -d

echo "Open WebUI: http://localhost:3000"
