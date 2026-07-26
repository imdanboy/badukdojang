#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# start KataGo bridge in background
bun run start:engine &
ENGINE_PID=$!

cleanup() {
  echo "[dev.sh] stopping engine (pid $ENGINE_PID)..."
  kill "$ENGINE_PID" 2>/dev/null || true
  wait "$ENGINE_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# wait for bridge to be ready
echo "[dev.sh] waiting for KataGo bridge..."
PORT="${PORT:-8787}"
for i in $(seq 1 30); do
  if curl -s "http://localhost:$PORT/api/gtp/health" >/dev/null 2>&1; then
    echo "[dev.sh] bridge is ready on http://localhost:$PORT"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "[dev.sh] ERROR: bridge did not start within 30s" >&2
    exit 1
  fi
  sleep 1
done

# start Vite dev server
echo "[dev.sh] starting Vite dev server..."
exec bun run dev
