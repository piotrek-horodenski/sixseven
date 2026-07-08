#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# prod.sh — Hydra production environment.
#
# Everything runs in Docker (builds images). Used for e2e
# testing and verifying the full stack. For development with
# hot reload, use dev.sh instead.
#
# Usage:
#   bash prod.sh             Start prod environment
#   bash prod.sh stop        Stop prod environment
#   bash prod.sh status      Show what's running
# ──────────────────────────────────────────────────────────────

source "$(cd "$(dirname "$0")" && pwd)/operate.sh"

parse_command "$1"
check_docker
detect_mode

# ── status ────────────────────────────────────────────────────
if [ "$COMMAND" = "status" ]; then
  live_status
fi

# ── stop ──────────────────────────────────────────────────────
if [ "$COMMAND" = "stop" ]; then
  if $PROD_RUNNING; then
    stop_prod
    echo "Prod environment stopped."
  else
    echo "Prod environment is not running."
  fi
  exit 0
fi

# ── start ─────────────────────────────────────────────────────
print_status

if $PROD_RUNNING; then
  if prompt_restart "Prod"; then
    stop_prod
  else
    echo "Leaving prod environment as-is."
    exit 0
  fi
fi

# ── Prerequisites ─────────────────────────────────────────────
check_certs

# ── Build images first ────────────────────────────────────────
echo "Building images..."
docker compose -p "$PROD_PROJECT" -f "$PROD_COMPOSE_FILE" build

# ── Start full stack ─────────────────────────────────────────
echo "Starting prod environment..."
docker compose -p "$PROD_PROJECT" -f "$PROD_COMPOSE_FILE" up -d

COMPOSE_FILE="$PROD_COMPOSE_FILE"
COMPOSE_PROJECT="$PROD_PROJECT"
wait_for_mongo hydra-mongo1 "MongoDB" 60
wait_for_replica_set hydra-mongo1 90

# ── Summary ───────────────────────────────────────────────────
print_banner \
  "Hydra PROD environment is running" \
  "" \
  "Frontend:  http://localhost:5273  (docker, nginx)" \
  "Gate API:  https://localhost:4214  (docker)" \
  "Image:     http://localhost:5279  (docker)" \
  "MongoDB:   mongodb://localhost:27117  (docker)" \
  "Image DB:  mongodb://localhost:27133  (docker)" \
  "" \
  "Stop with: bash prod.sh stop"

echo ""
echo "Tailing logs... Press Ctrl+C to stop tailing (containers keep running)."
docker compose -p "$PROD_PROJECT" -f "$PROD_COMPOSE_FILE" logs -f
