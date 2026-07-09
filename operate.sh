#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# operate.sh — Shared library for dev.sh and prod.sh
# Source this file, do not execute it directly.
# ──────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DEV_PROJECT="hydra-dev"
PROD_PROJECT="hydra"
DEV_COMPOSE_FILE="$SCRIPT_DIR/db/docker-compose.yml"
PROD_COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"

# ── Colors ─────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ── Check Docker is running ────────────────────────────────────
check_docker() {
  if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Docker is not running.${NC} Please start Docker and try again."
    exit 1
  fi
}

# ── Detect running environments ────────────────────────────────
# Sets DEV_RUNNING and PROD_RUNNING to true/false
detect_mode() {
  DEV_RUNNING=false
  PROD_RUNNING=false

  if docker compose -p "$DEV_PROJECT" -f "$DEV_COMPOSE_FILE" ps --status running -q 2>/dev/null | grep -q .; then
    DEV_RUNNING=true
  fi

  if docker compose -p "$PROD_PROJECT" -f "$PROD_COMPOSE_FILE" ps --status running -q 2>/dev/null | grep -q .; then
    PROD_RUNNING=true
  fi
}

# ── Print current status ──────────────────────────────────────
print_status() {
  echo ""
  echo "  Current status:"
  if $DEV_RUNNING; then
    echo -e "    DEV  — ${GREEN}running${NC} (DB on :27020-27022, :27033)"
  else
    echo -e "    DEV  — ${RED}not running${NC}"
  fi
  if $PROD_RUNNING; then
    echo -e "    PROD — ${GREEN}running${NC} (stack on :5273, :4214, :5279, :27117-27119, :27133)"
  else
    echo -e "    PROD — ${RED}not running${NC}"
  fi
  echo ""
}

# ── Ask user: restart or leave as-is ──────────────────────────
# Returns 0 if user wants to restart, 1 to leave as-is
prompt_restart() {
  local mode="$1"
  echo -e "${YELLOW}$mode environment is already running.${NC}"
  read -rp "  Restart it? [y/N] " answer
  case "$answer" in
    [yY]*) return 0 ;;
    *)     return 1 ;;
  esac
}

# ── Stop environments ─────────────────────────────────────────
stop_dev() {
  echo "Stopping dev environment..."
  docker compose -p "$DEV_PROJECT" -f "$DEV_COMPOSE_FILE" down
}

stop_prod() {
  echo "Stopping prod environment..."
  docker compose -p "$PROD_PROJECT" -f "$PROD_COMPOSE_FILE" down
}

# ── Kill all node processes belonging to this project ─────────
# Finds node.exe processes whose command line contains the project dir
kill_hydra_nodes() {
  if command -v taskkill > /dev/null 2>&1; then
    local pids
    pids=$(wmic process where "Name='node.exe'" get ProcessId,CommandLine 2>/dev/null \
      | grep -i "new-hydra" \
      | awk '{print $(NF)}' \
      | grep -E '^[0-9]+$')
    for pid in $pids; do
      echo -e "  ${YELLOW}Killing node process (PID $pid)${NC}"
      taskkill //F //PID "$pid" > /dev/null 2>&1
    done
  fi
}

# ── Kill a process and its entire tree ─────────────────────────
# On Windows (Git Bash), kill only stops the parent; children survive.
kill_tree() {
  local pid="$1"
  if command -v taskkill > /dev/null 2>&1; then
    # Windows: taskkill /T kills the process tree
    taskkill //F //T //PID "$pid" > /dev/null 2>&1
  else
    # Unix: kill the process group
    kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null
  fi
}

# ── Kill all processes listening on a port ─────────────────────
# Usage: free_port <port>
free_port() {
  local port="$1"
  if command -v taskkill > /dev/null 2>&1; then
    # Windows: find all PIDs from netstat (IPv4 and IPv6) and kill their trees.
    # Loop twice — nodemon child processes may re-grab the port after the first kill.
    for attempt in 1 2; do
      local pids
      pids=$(netstat -ano 2>/dev/null | grep ":$port " | grep LISTENING | awk '{print $NF}' | sort -u)
      if [ -z "$pids" ]; then break; fi
      for pid in $pids; do
        if [ -n "$pid" ] && [ "$pid" != "0" ]; then
          echo -e "  ${YELLOW}Killing process on port $port (PID $pid)${NC}"
          taskkill //F //T //PID "$pid" > /dev/null 2>&1
        fi
      done
      if [ "$attempt" -eq 1 ]; then sleep 0.5; fi
    done
  else
    # Unix: use fuser
    fuser -k "$port/tcp" 2>/dev/null
  fi
}

# ── Wait for a MongoDB container to be ready ──────────────────
# Usage: wait_for_mongo <container_name> <label> [timeout_seconds]
# Uses docker exec to check inside the container (avoids host mongosh/PATH issues)
wait_for_mongo() {
  local container="$1"
  local label="$2"
  local timeout="${3:-60}"

  echo -n "  Waiting for $label..."
  for i in $(seq 1 "$timeout"); do
    if docker exec "$container" mongosh --quiet --eval "db.adminCommand('ping').ok" > /dev/null 2>&1; then
      echo -e " ${GREEN}ready${NC}"
      return 0
    fi
    sleep 1
  done
  echo -e " ${YELLOW}timeout after ${timeout}s, continuing${NC}"
}

# ── Wait for replica set to have a PRIMARY ────────────────────
# Usage: wait_for_replica_set <container_name> [timeout_seconds]
# Auto-reinitializes if replica set config is missing.
wait_for_replica_set() {
  local container="$1"
  local timeout="${2:-90}"
  local reinit_attempted=false

  echo -n "  Waiting for replica set PRIMARY..."
  for i in $(seq 1 "$timeout"); do
    local state
    state=$(docker exec "$container" mongosh --quiet --eval "
      try {
        const s = rs.status();
        s.members.find(m => m.stateStr === 'PRIMARY') ? print('ok') : print('waiting');
      } catch(e) {
        if (e.message.includes('no replset config')) { print('no_config'); }
        else { print('waiting'); }
      }
    " 2>/dev/null)

    if [ "$state" = "ok" ]; then
      echo -e " ${GREEN}ready${NC}"
      return 0
    fi

    # No replica set config — re-run the init container
    if [ "$state" = "no_config" ] && ! $reinit_attempted; then
      reinit_attempted=true
      echo ""
      echo -e "  ${YELLOW}Replica set not configured. Re-running init...${NC}"
      local compose_file="${COMPOSE_FILE:-$DEV_COMPOSE_FILE}"
      local project="${COMPOSE_PROJECT:-$DEV_PROJECT}"
      docker compose -p "$project" -f "$compose_file" run --rm mongo-init 2>&1 | sed 's/^/    /'
      echo -n "  Waiting for replica set PRIMARY..."
    fi

    sleep 2
  done
  echo -e " ${RED}timeout after ${timeout}s — replica set not ready${NC}"
  return 1
}

# ── Wait for an HTTP port to become available ─────────────────
# Usage: wait_for_http <port> <label> [timeout_seconds]
wait_for_http() {
  local port="$1"
  local label="$2"
  local timeout="${3:-30}"

  echo -n "  Waiting for $label (:$port)..."
  for i in $(seq 1 "$timeout"); do
    if curl -sfk --max-time 1 "https://127.0.0.1:$port" > /dev/null 2>&1 || \
       curl -sf --max-time 1 "http://127.0.0.1:$port" > /dev/null 2>&1; then
      echo -e " ${GREEN}ready${NC}"
      return 0
    fi
    sleep 1
  done
  echo -e " ${YELLOW}timeout after ${timeout}s, continuing${NC}"
}

# ── Check npm dependencies ────────────────────────────────────
check_node_modules() {
  local dir="$1"
  local name="$2"
  if [ ! -d "$dir/node_modules" ]; then
    echo -e "${YELLOW}Installing $name dependencies...${NC}"
    (cd "$dir" && npm install)
  fi
}

# ── Check certificates ────────────────────────────────────────
check_certs() {
  if [ ! -f "$SCRIPT_DIR/cfg/cert/key.pem" ] || [ ! -f "$SCRIPT_DIR/cfg/cert/cert.pem" ]; then
    echo -e "${YELLOW}Certificates not found in cfg/cert/. Generating self-signed...${NC}"
    mkdir -p "$SCRIPT_DIR/cfg/cert"
    openssl req -x509 -newkey rsa:2048 -nodes \
      -keyout "$SCRIPT_DIR/cfg/cert/key.pem" \
      -out "$SCRIPT_DIR/cfg/cert/cert.pem" \
      -days 365 -subj "/CN=localhost" 2>/dev/null
    echo "  Self-signed certificates generated."
  fi
}

# ── Print a banner ────────────────────────────────────────────
print_banner() {
  echo ""
  echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
  while [ $# -gt 0 ]; do
    echo "  $1"
    shift
  done
  echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
  echo ""
}

# ── Check if a port is listening ───────────────────────────────
# Returns 0 if listening, 1 if not
port_open() {
  netstat -ano 2>/dev/null | grep ":$1 " | grep -q LISTENING
}

# ── Check container status ────────────────────────────────────
# Returns: "up", "healthy", "unhealthy", "restarting", "exited", "missing"
container_status() {
  local name="$1"
  local raw
  raw=$(docker inspect --format '{{.State.Status}}{{if .State.Health}} ({{.State.Health.Status}}){{end}}' "$name" 2>/dev/null)
  if [ -z "$raw" ]; then
    echo "missing"
  elif echo "$raw" | grep -q "restarting"; then
    echo "restarting"
  elif echo "$raw" | grep -q "healthy"; then
    echo "healthy"
  elif echo "$raw" | grep -q "running"; then
    echo "up"
  else
    echo "$raw"
  fi
}

# ── Format status with color ─────────────────────────────────
fmt_status() {
  case "$1" in
    healthy|up|ok|ready)    echo -e "${GREEN}$1${NC}" ;;
    restarting|starting)    echo -e "${YELLOW}$1${NC}" ;;
    *)                      echo -e "${RED}$1${NC}" ;;
  esac
}

# ── Check replica set PRIMARY ─────────────────────────────────
# Usage: check_rs_primary <container_name>
# Returns "ready" or "no primary"
check_rs_primary() {
  local container="$1"
  local result
  result=$(docker exec "$container" mongosh --quiet --eval "
    try { rs.status().members.find(m => m.stateStr === 'PRIMARY') ? print('ready') : print('no primary') }
    catch(e) { print('error') }
  " 2>/dev/null)
  echo "${result:-error}"
}

# ── Check .env file for expected value ─────────────────────────
# Usage: check_env_value <file> <key> <expected>
# Returns "ok" or "mismatch:<actual>"
check_env_value() {
  local file="$1" key="$2" expected="$3"
  if [ ! -f "$file" ]; then
    echo "missing"
    return
  fi
  local actual
  actual=$(grep "^${key}=" "$file" 2>/dev/null | head -1 | cut -d= -f2-)
  if [ -z "$actual" ]; then
    echo "not set"
  elif [ "$actual" = "$expected" ]; then
    echo "ok"
  else
    echo "mismatch:$actual"
  fi
}

# ── Check if directory exists and is non-empty ────────────────
dir_status() {
  if [ ! -d "$1" ]; then
    echo "missing"
  elif [ -z "$(ls -A "$1" 2>/dev/null)" ]; then
    echo "empty"
  else
    echo "ok"
  fi
}

# ── Get last error from container logs ────────────────────────
last_container_error() {
  local name="$1"
  docker logs "$name" --tail 50 2>&1 | grep -iE '"level":50|"level":60|FATAL|ERROR|EADDRINUSE|ECONNREFUSED' | tail -1 | sed 's/.*"msg":"\([^"]*\)".*/\1/' | head -c 60
}

# ── Live status monitor ───────────────────────────────────────
# Refreshes every 3 seconds until Ctrl+C
live_status() {
  trap 'printf "\033[?25h"; exit 0' INT TERM

  while true; do
    printf "\033[2J\033[H"

    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "  Hydra Environment Status"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"

    # ── DEV ──────────────────────────────────────────────
    echo ""
    echo -e "  ${CYAN}DEV${NC} (DB in Docker, services local)"
    echo -e "  ${CYAN}───────────────────────────────────────────────────────────${NC}"

    # Dev DB containers
    local dev_m1=$(container_status hydra-dev-mongo1)
    local dev_m2=$(container_status hydra-dev-mongo2)
    local dev_m3=$(container_status hydra-dev-mongo3)
    local dev_img_db=$(container_status hydra-dev-image-mongo)

    echo -e "    Mongo1  :27020     $(fmt_status "$dev_m1")"
    echo -e "    Mongo2  :27021     $(fmt_status "$dev_m2")"
    echo -e "    Mongo3  :27022     $(fmt_status "$dev_m3")"

    # Replica set + data
    if [ "$dev_m1" = "healthy" ] || [ "$dev_m1" = "up" ]; then
      local dev_rs=$(check_rs_primary hydra-dev-mongo1)
      echo -e "    Replica set        $(fmt_status "$dev_rs")"

      if [ "$dev_rs" = "ready" ]; then
        local dev_data
        dev_data=$(docker exec hydra-dev-mongo1 mongosh --quiet --eval "
          use hydra;
          const u = db.users.countDocuments();
          const r = db.roles.countDocuments();
          const s = db.settings.countDocuments();
          const p = db.permissions.countDocuments();
          print(u + ' users, ' + r + ' roles, ' + p + ' perms, ' + s + ' settings');
        " 2>/dev/null)
        echo -e "    DB data            ${dev_data:-n/a}"
      fi
    else
      echo -e "    Replica set        $(fmt_status "n/a")"
    fi

    echo -e "    Image DB :27033    $(fmt_status "$dev_img_db")"

    # Dev local services
    echo ""
    if port_open 4114; then
      echo -e "    Gate     :4114     $(fmt_status "ok")"
    else
      echo -e "    Gate     :4114     $(fmt_status "not running")"
    fi

    if port_open 5173; then
      echo -e "    Frontend :5173     $(fmt_status "ok")"
    else
      echo -e "    Frontend :5173     $(fmt_status "not running")"
    fi

    if port_open 5179; then
      echo -e "    Image    :5179     $(fmt_status "ok")"
    else
      echo -e "    Image    :5179     $(fmt_status "not running")"
    fi

    # Dev config checks
    echo ""
    echo -e "    ${CYAN}Config:${NC}"

    local gate_db=$(check_env_value "$SCRIPT_DIR/gate/.env" "MONGODB_URI" "mongodb://127.0.0.1:27020/hydra?directConnection=true")
    local gate_web=$(check_env_value "$SCRIPT_DIR/gate/.env" "WEB_URL" "http://localhost:5173")
    local img_port=$(check_env_value "$SCRIPT_DIR/image/.env" "IMAGE_DB_PORT" "27033")
    local img_name=$(check_env_value "$SCRIPT_DIR/image/.env" "IMAGE_DB_NAME" "himage")
    local new_env_status
    if [ -f "$SCRIPT_DIR/web/.env" ]; then
      new_env_status=$(check_env_value "$SCRIPT_DIR/web/.env" "VITE_GATE_URL" "wss://localhost:4114")
    else
      new_env_status="missing"
    fi

    echo -e "    gate/.env DB_URI   $(fmt_status "$gate_db")"
    echo -e "    gate/.env WEB_URL  $(fmt_status "$gate_web")"
    echo -e "    image/.env DB_PORT $(fmt_status "$img_port")"
    echo -e "    image/.env DB_NAME $(fmt_status "$img_name")"
    echo -e "    web/.env GATE_URL  $(fmt_status "$new_env_status")"

    local certs_status="ok"
    [ ! -f "$SCRIPT_DIR/cfg/cert/key.pem" ] || [ ! -f "$SCRIPT_DIR/cfg/cert/cert.pem" ] && certs_status="missing"
    echo -e "    Certificates       $(fmt_status "$certs_status")"

    local gate_nm=$(dir_status "$SCRIPT_DIR/gate/node_modules")
    local web_nm=$(dir_status "$SCRIPT_DIR/web/node_modules")
    local img_nm=$(dir_status "$SCRIPT_DIR/image/node_modules")
    echo -e "    node_modules       gate:$(fmt_status "$gate_nm") web:$(fmt_status "$web_nm") image:$(fmt_status "$img_nm")"

    # ── PROD ─────────────────────────────────────────────
    echo ""
    echo -e "  ${CYAN}PROD${NC} (full Docker stack)"
    echo -e "  ${CYAN}───────────────────────────────────────────────────────────${NC}"

    local prod_m1=$(container_status hydra-mongo1)
    local prod_m2=$(container_status hydra-mongo2)
    local prod_m3=$(container_status hydra-mongo3)
    local prod_gate=$(container_status hydra-gate)
    local prod_new=$(container_status hydra-new)
    local prod_img=$(container_status hydra-image)
    local prod_img_db=$(container_status hydra-image-mongo)

    echo -e "    Mongo1  :27117     $(fmt_status "$prod_m1")"
    echo -e "    Mongo2  :27118     $(fmt_status "$prod_m2")"
    echo -e "    Mongo3  :27119     $(fmt_status "$prod_m3")"

    if [ "$prod_m1" = "healthy" ] || [ "$prod_m1" = "up" ]; then
      local prod_rs=$(check_rs_primary hydra-mongo1)
      echo -e "    Replica set        $(fmt_status "$prod_rs")"

      if [ "$prod_rs" = "ready" ]; then
        local prod_data
        prod_data=$(docker exec hydra-mongo1 mongosh --quiet --eval "
          use hydra;
          const u = db.users.countDocuments();
          const r = db.roles.countDocuments();
          const s = db.settings.countDocuments();
          const p = db.permissions.countDocuments();
          print(u + ' users, ' + r + ' roles, ' + p + ' perms, ' + s + ' settings');
        " 2>/dev/null)
        echo -e "    DB data            ${prod_data:-n/a}"
      fi
    else
      echo -e "    Replica set        $(fmt_status "n/a")"
    fi

    echo -e "    Image DB :27133    $(fmt_status "$prod_img_db")"
    echo -e "    Gate     :4214     $(fmt_status "$prod_gate")"
    echo -e "    Frontend :5273     $(fmt_status "$prod_new")"
    echo -e "    Image    :5279     $(fmt_status "$prod_img")"

    # Prod errors
    if [ "$prod_gate" = "restarting" ] || [ "$prod_gate" = "exited" ]; then
      local gate_err=$(last_container_error hydra-gate)
      [ -n "$gate_err" ] && echo -e "    ${RED}Gate error: $gate_err${NC}"
    fi

    if [ "$prod_img" = "restarting" ] || [ "$prod_img" = "exited" ]; then
      local img_err=$(last_container_error hydra-image)
      [ -n "$img_err" ] && echo -e "    ${RED}Image error: $img_err${NC}"
    fi

    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "  Refreshing every 3s. Press Ctrl+C to exit."

    sleep 3
  done
}

# ── Parse subcommand ──────────────────────────────────────────
# Usage: parse_command "$1"
# Sets COMMAND to start|stop|status
parse_command() {
  case "${1:-start}" in
    start)  COMMAND="start" ;;
    stop)   COMMAND="stop" ;;
    status) COMMAND="status" ;;
    *)
      echo "Usage: $0 [start|stop|status]"
      echo ""
      echo "  start   Start the environment (default)"
      echo "  stop    Stop the environment"
      echo "  status  Show current status of all environments"
      exit 1
      ;;
  esac
}
