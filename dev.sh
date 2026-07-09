#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# dev.sh — Hydra development environment (Linux/macOS).
# For Windows, use: .\dev.ps1
#
# DB cluster runs in Docker, all services run locally with
# hot reload. For full Docker setup, use prod.sh instead.
#
# Usage:
#   bash dev.sh              Start dev environment
#   bash dev.sh stop         Stop local services (DB keeps running)
#   bash dev.sh stop all     Stop everything including DB
#   bash dev.sh status       Show what's running
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
  echo "Stopping local services..."
  free_port 4114
  free_port 5173
  free_port 5179
  if [ "${2:-}" = "all" ]; then
    stop_dev
    echo "Dev environment fully stopped (DB + services)."
  else
    echo "Local services stopped. DB still running."
    echo "  To stop DB too: bash dev.sh stop all"
  fi
  exit 0
fi

# ── start ─────────────────────────────────────────────────────
print_status

# ── Prerequisites ─────────────────────────────────────────────
check_certs
check_node_modules "$SCRIPT_DIR/gate" "gate"
check_node_modules "$SCRIPT_DIR/web" "frontend"
check_node_modules "$SCRIPT_DIR/image" "image"

if [ ! -f "$SCRIPT_DIR/web/.env" ]; then
  if [ -f "$SCRIPT_DIR/web/.env.example" ]; then
    echo "Creating web/.env from .env.example..."
    cp "$SCRIPT_DIR/web/.env.example" "$SCRIPT_DIR/web/.env"
  else
    echo -e "${YELLOW}Warning: web/.env not found. Frontend may not connect to gate.${NC}"
  fi
fi

# ── Free ports from orphaned processes ────────────────────────
free_port 4114
free_port 5173
free_port 5179

# ── Ensure dev DB is running ─────────────────────────────────
COMPOSE_FILE="$DEV_COMPOSE_FILE"
COMPOSE_PROJECT="$DEV_PROJECT"

if $DEV_RUNNING; then
  echo "Dev DB already running. Checking replica set..."
else
  echo "Starting dev DB cluster..."
  docker compose -p "$DEV_PROJECT" -f "$DEV_COMPOSE_FILE" up -d
  wait_for_mongo hydra-dev-mongo1 "MongoDB" 60
  wait_for_mongo hydra-dev-image-mongo "Image MongoDB" 30
fi

wait_for_replica_set hydra-dev-mongo1 90

# ── Kill anything that grabbed ports during DB init wait ──────
free_port 4114
free_port 5173
free_port 5179

# ── Start local services ─────────────────────────────────────
PIDS=()

cleanup() {
  set +e
  echo ""
  echo "Shutting down local services..."
  for pid in "${PIDS[@]}"; do
    kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null
  done
  free_port 4114
  free_port 5173
  free_port 5179
  wait "${PIDS[@]}" 2>/dev/null
  echo "Done. DB still running. Stop with: bash dev.sh stop all"
}
trap cleanup EXIT INT TERM

echo "Starting gate..."
cd "$SCRIPT_DIR/gate"
npm start &
PIDS+=($!)

echo "Starting frontend..."
cd "$SCRIPT_DIR/web"
npm run dev &
PIDS+=($!)

echo "Starting image service..."
cd "$SCRIPT_DIR/image"
npm run dev &
PIDS+=($!)

cd "$SCRIPT_DIR"

# ── Summary ───────────────────────────────────────────────────
print_banner \
  "Hydra DEV environment is running" \
  "" \
  "Frontend:  http://localhost:5173  (local, hot reload)" \
  "Gate API:  https://localhost:4114  (local)" \
  "Image:     http://localhost:5179  (local)" \
  "MongoDB:   mongodb://localhost:27020  (docker)" \
  "Image DB:  mongodb://localhost:27033  (docker)" \
  "" \
  "Ctrl+C to stop services (DB keeps running)"

wait "${PIDS[@]}"
