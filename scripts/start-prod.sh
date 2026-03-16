#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# GarminCoach production start script
# Usage: ./scripts/start-prod.sh [--stop]

set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${GARMINCOACH_PORT:-3000}"
PID_FILE="${APP_DIR}/.next/garmincoach.pid"
LOG_FILE="${APP_DIR}/logs/garmincoach.log"

mkdir -p "${APP_DIR}/logs"

stop_app() {
  if [ -f "$PID_FILE" ]; then
    pid=$(cat "$PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      echo "Stopping GarminCoach (PID $pid)..."
      kill "$pid"
      rm -f "$PID_FILE"
      echo "Stopped."
    else
      echo "PID $pid not running, cleaning up."
      rm -f "$PID_FILE"
    fi
  else
    echo "No PID file found."
  fi
}

if [ "${1:-}" = "--stop" ]; then
  stop_app
  exit 0
fi

cd "$APP_DIR"

# Ensure Docker containers are running
echo "Starting Docker services..."
docker compose up -d

# Wait for Postgres
echo "Waiting for PostgreSQL..."
for i in $(seq 1 30); do
  if docker exec garmin-coach-postgres-1 pg_isready -U dev -d garmincoach -q 2>/dev/null; then
    echo "PostgreSQL ready."
    break
  fi
  sleep 1
done

# Stop any existing instance
stop_app

# Start Next.js in production mode
echo "Starting GarminCoach on port ${PORT}..."
PORT=$PORT nohup node_modules/.bin/next start --hostname 0.0.0.0 --port "$PORT" \
  >> "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

echo "GarminCoach started (PID $(cat "$PID_FILE"))"
echo "  Local:   http://localhost:${PORT}"
echo "  LAN:     http://192.168.1.77:${PORT}"
echo "  Logs:    ${LOG_FILE}"
