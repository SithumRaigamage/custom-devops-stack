#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$SCRIPT_DIR"
DEV_DIR="$(dirname "$SCRIPT_DIR")"

# MongoDB paths (local manual install, lives outside the stack folder)
MONGO_BIN="$DEV_DIR/mongodb-macos-aarch64--8.2.3/bin/mongod"
MONGO_DATA="$DEV_DIR/mongodb-macos-aarch64--8.2.3/data/db"
MONGO_LOG="$DEV_DIR/mongodb-macos-aarch64--8.2.3/mongodb.log"

# 27017 (Mongo's default) is already taken by an unrelated project's
# `expense-tracker-db` Docker container on this machine. Use a different
# port for this stack's local mongod; override with MONGO_PORT=xxxxx if needed.
MONGO_PORT="${MONGO_PORT:-27018}"

start_mongodb() {
  if pgrep -x "mongod" > /dev/null; then
    echo "ℹ️ MongoDB already running"
  else
    if lsof -iTCP:"$MONGO_PORT" -sTCP:LISTEN > /dev/null 2>&1; then
      echo "❌ Port $MONGO_PORT is already in use by another process:"
      lsof -iTCP:"$MONGO_PORT" -sTCP:LISTEN
      echo "   Set MONGO_PORT to a free port and retry, e.g.: MONGO_PORT=27019 ./script.sh mongo-start"
      return 1
    fi

    echo "➡️ Starting MongoDB on port $MONGO_PORT..."
    nohup "$MONGO_BIN" \
      --port "$MONGO_PORT" \
      --dbpath "$MONGO_DATA" \
      > "$MONGO_LOG" 2>&1 &

    sleep 2

    if pgrep -x "mongod" > /dev/null; then
      echo "✅ MongoDB started on port $MONGO_PORT"
    else
      echo "❌ MongoDB failed to start. Check log:"
      echo "   $MONGO_LOG"
    fi
  fi
}

stop_mongodb() {
  if pgrep -x "mongod" > /dev/null; then
    echo "➡️ Stopping MongoDB..."
    pkill mongod
    sleep 1
    echo "✅ MongoDB stopped"
  else
    echo "ℹ️ MongoDB is not running"
  fi
}


start_services() {
  echo "🚀 Starting all services..."

  echo "➡️ Starting MongoDB..."
  start_mongodb

  echo "➡️ Starting Jenkins..."
  cd "$BASE_DIR/jenkins" || exit 1

  if ! docker image inspect custom-jenkins:latest > /dev/null 2>&1; then
    echo "ℹ️ custom-jenkins:latest not found locally, building..."
    docker build -t custom-jenkins:latest .
  fi

  docker compose up -d

  echo "➡️ Starting SonarQube..."
  cd "$BASE_DIR/sonarqube" || exit 1
  docker compose up -d

  echo "✅ All services started"
}

stop_services() {
  echo "🛑 Stopping all services..."

  echo "➡️ Stopping SonarQube..."
  cd "$BASE_DIR/sonarqube" || exit 1
  docker compose down

  echo "➡️ Stopping Jenkins..."
  cd "$BASE_DIR/jenkins" || exit 1
  docker compose down

  echo "➡️ Stopping MonoDb..."
  stop_mongodb

  echo "✅ All services stopped"
}

case "$1" in
  start)
    start_services
    ;;
  stop)
    stop_services
    ;;
  mongo-start)
    start_mongodb
    ;;
  mongo-stop)
    stop_mongodb
    ;;
  *)
    echo "Usage: ./script.sh {start|stop|mongo-start|mongo-stop}"
    exit 1
    ;;
esac

