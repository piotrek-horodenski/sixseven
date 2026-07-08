# ──────────────────────────────────────────────────────────────
# dev.ps1 — Hydra development environment (Windows/PowerShell).
#
# DB cluster runs in Docker, all services run locally with
# hot reload. For full Docker setup, use prod.sh instead.
#
# Usage:
#   .\dev.ps1              Start dev environment
#   .\dev.ps1 stop         Stop local services (DB keeps running)
#   .\dev.ps1 stop all     Stop everything including DB
# ──────────────────────────────────────────────────────────────

param(
  [string]$Command = "start",
  [string]$Scope = ""
)

$ErrorActionPreference = "Continue"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$DevProject = "hydra-dev"
$DevComposeFile = Join-Path $ScriptDir "db\docker-compose.yml"

# ── Colors ────────────────────────────────────────────────────
function Write-C($Color, $Text) { Write-Host $Text -ForegroundColor $Color }
function Write-Yellow($Text) { Write-C Yellow $Text }
function Write-Green($Text) { Write-C Green $Text }
function Write-Red($Text) { Write-C Red $Text }
function Write-Cyan($Text) { Write-C Cyan $Text }

# ── Kill all node processes belonging to this project ─────────
function Stop-HydraNodes {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" 2>$null |
    Where-Object { $_.CommandLine -match "new-hydra" } |
    ForEach-Object {
      Write-Yellow "  Killing node process (PID $($_.ProcessId))"
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

# ── Kill processes on a specific port ─────────────────────────
function Free-Port($Port) {
  $procIds = netstat -ano | Select-String ":$Port\s.*LISTENING" |
    ForEach-Object { ($_ -split '\s+')[-1] } |
    Sort-Object -Unique |
    Where-Object { $_ -match '^\d+$' -and $_ -ne '0' }
  foreach ($procId in $procIds) {
    Write-Yellow "  Killing process on port $Port (PID $procId)"
    taskkill /F /T /PID $procId 2>$null | Out-Null
  }
}

# ── Check Docker ─────────────────────────────────────────────
function Test-Docker {
  $null = docker info 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Red "Docker is not running. Please start Docker and try again."
    exit 1
  }
}

# ── Detect running environments ──────────────────────────────
function Test-DevRunning {
  $ids = docker compose -p $DevProject -f $DevComposeFile ps --status running -q 2>$null
  return [bool]$ids
}

# ── Wait for MongoDB ─────────────────────────────────────────
function Wait-Mongo($Container, $Label, $Timeout = 60) {
  Write-Host "  Waiting for $Label..." -NoNewline
  for ($i = 0; $i -lt $Timeout; $i++) {
    $result = docker exec $Container mongosh --quiet --eval "db.adminCommand('ping').ok" 2>$null
    if ($result -match "1") {
      Write-Green " ready"
      return
    }
    Start-Sleep 1
  }
  Write-Yellow " timeout after ${Timeout}s, continuing"
}

# ── Wait for replica set PRIMARY ─────────────────────────────
function Wait-ReplicaSet($Container, $Timeout = 90) {
  $reinitAttempted = $false
  Write-Host "  Waiting for replica set PRIMARY..." -NoNewline
  for ($i = 0; $i -lt $Timeout; $i++) {
    $state = docker exec $Container mongosh --quiet --eval @"
      try {
        const s = rs.status();
        s.members.find(m => m.stateStr === 'PRIMARY') ? print('ok') : print('waiting');
      } catch(e) {
        if (e.message.includes('no replset config')) { print('no_config'); }
        else { print('waiting'); }
      }
"@ 2>$null

    if ($state -match "ok") {
      Write-Green " ready"
      return
    }
    if ($state -match "no_config" -and -not $reinitAttempted) {
      $reinitAttempted = $true
      Write-Host ""
      Write-Yellow "  Replica set not configured. Re-running init..."
      docker compose -p $DevProject -f $DevComposeFile run --rm mongo-init 2>&1 | ForEach-Object { "    $_" }
      Write-Host "  Waiting for replica set PRIMARY..." -NoNewline
    }
    Start-Sleep 2
  }
  Write-Red " timeout after ${Timeout}s — replica set not ready"
}

# ── Check node_modules ───────────────────────────────────────
function Test-NodeModules($Dir, $Name) {
  if (-not (Test-Path (Join-Path $Dir "node_modules"))) {
    Write-Yellow "Installing $Name dependencies..."
    Push-Location $Dir
    npm install
    Pop-Location
  }
}

# ── Check certificates ───────────────────────────────────────
function Test-Certs {
  $certDir = Join-Path $ScriptDir "cfg\cert"
  if (-not (Test-Path (Join-Path $certDir "key.pem")) -or -not (Test-Path (Join-Path $certDir "cert.pem"))) {
    Write-Yellow "Certificates not found in cfg\cert\. Generating self-signed..."
    New-Item -ItemType Directory -Path $certDir -Force | Out-Null
    openssl req -x509 -newkey rsa:2048 -nodes `
      -keyout (Join-Path $certDir "key.pem") `
      -out (Join-Path $certDir "cert.pem") `
      -days 365 -subj "/CN=localhost" 2>$null
    Write-Host "  Self-signed certificates generated."
  }
}

# ── Print banner ─────────────────────────────────────────────
function Write-Banner {
  param([string[]]$Lines)
  Write-Host ""
  Write-Cyan ("=" * 54)
  foreach ($line in $Lines) { Write-Host "  $line" }
  Write-Cyan ("=" * 54)
  Write-Host ""
}

# ── stop ─────────────────────────────────────────────────────
if ($Command -eq "stop") {
  Write-Host "Stopping local services..."
  Stop-HydraNodes
  if ($Scope -eq "all") {
    Write-Host "Stopping dev environment..."
    docker compose -p $DevProject -f $DevComposeFile down
    Write-Host "Dev environment fully stopped (DB + services)."
  } else {
    Write-Host "Local services stopped. DB still running."
    Write-Host "  To stop DB too: .\dev.ps1 stop all"
  }
  exit 0
}

# ── start ────────────────────────────────────────────────────
Test-Docker
$devRunning = Test-DevRunning

Write-Host ""
Write-Host "  Current status:"
if ($devRunning) {
  Write-Host "    DEV  — " -NoNewline; Write-Green "running (DB on :27020-27022, :27033)"
} else {
  Write-Host "    DEV  — " -NoNewline; Write-Red "not running"
}
Write-Host ""

# ── Prerequisites ────────────────────────────────────────────
Test-Certs
Test-NodeModules (Join-Path $ScriptDir "gate") "gate"
Test-NodeModules (Join-Path $ScriptDir "web") "frontend"
Test-NodeModules (Join-Path $ScriptDir "image") "image"

$envFile = Join-Path $ScriptDir "web\.env"
$envExample = Join-Path $ScriptDir "web\.env.example"
if (-not (Test-Path $envFile) -and (Test-Path $envExample)) {
  Write-Host "Creating web\.env from .env.example..."
  Copy-Item $envExample $envFile
}

# ── Kill orphaned processes ──────────────────────────────────
Stop-HydraNodes
Free-Port 4114
Free-Port 5173
Free-Port 5179

# ── Ensure dev DB is running ─────────────────────────────────
if ($devRunning) {
  Write-Host "Dev DB already running. Checking replica set..."
} else {
  Write-Host "Starting dev DB cluster..."
  docker compose -p $DevProject -f $DevComposeFile up -d
  Wait-Mongo "hydra-dev-mongo1" "MongoDB" 60
  Wait-Mongo "hydra-dev-image-mongo" "Image MongoDB" 30
}

Wait-ReplicaSet "hydra-dev-mongo1" 90

# ── Start local services ─────────────────────────────────────
Write-Banner @(
  "Hydra DEV environment is running",
  "",
  "Frontend:  http://localhost:5173  (local, hot reload)",
  "Gate API:  https://localhost:4114  (local)",
  "Image:     http://localhost:5179  (local)",
  "MongoDB:   mongodb://localhost:27020  (docker)",
  "Image DB:  mongodb://localhost:27033  (docker)",
  "",
  "Ctrl+C to stop services (DB keeps running)"
)

$procs = @()

$procs += Start-Process npm.cmd -ArgumentList "start" -WorkingDirectory (Join-Path $ScriptDir "gate") -PassThru -NoNewWindow
$procs += Start-Process npm.cmd -ArgumentList "run","dev" -WorkingDirectory (Join-Path $ScriptDir "web") -PassThru -NoNewWindow
$procs += Start-Process npm.cmd -ArgumentList "run","dev" -WorkingDirectory (Join-Path $ScriptDir "image") -PassThru -NoNewWindow

# ── Wait for Ctrl+C, then cleanup ────────────────────────────
try {
  while ($true) {
    $allExited = $true
    foreach ($p in $procs) {
      if (-not $p.HasExited) { $allExited = $false; break }
    }
    if ($allExited) { break }
    Start-Sleep 1
  }
} finally {
  Write-Host ""
  Write-Host "Shutting down local services..."
  foreach ($p in $procs) {
    if (-not $p.HasExited) {
      taskkill /F /T /PID $p.Id 2>$null | Out-Null
    }
  }
  Stop-HydraNodes
  Write-Host "Done. DB still running. Stop with: .\dev.ps1 stop all"
}
