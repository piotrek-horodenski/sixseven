/**
 * dev-runner.js — Cross-platform process manager for Hydra dev services.
 *
 * Spawns gate, frontend, and image services as child processes and kills
 * them all on exit. Works reliably on Windows (where bash traps don't).
 *
 * Usage: node dev-runner.js (called by dev.sh)
 */

const { spawn, execSync } = require('child_process')
const path = require('path')

const ROOT = __dirname
const isWindows = process.platform === 'win32'

const services = [
  { name: 'gate',     cwd: path.join(ROOT, 'gate'),  cmd: 'npm', args: ['start'] },
  { name: 'frontend', cwd: path.join(ROOT, 'web'),   cmd: 'npm', args: ['run', 'dev'] },
  { name: 'image',    cwd: path.join(ROOT, 'image'),  cmd: 'npm', args: ['run', 'dev'] },
]

const children = []

for (const svc of services) {
  console.log(`Starting ${svc.name}...`)
  const child = spawn(svc.cmd, svc.args, {
    cwd: svc.cwd,
    stdio: 'inherit',
    shell: true,
  })
  child.svc = svc.name
  children.push(child)

  child.on('error', (err) => {
    console.error(`[${svc.name}] failed to start: ${err.message}`)
  })
}

function killAll() {
  console.log('\nShutting down local services...')

  for (const child of children) {
    try {
      if (isWindows) {
        // On Windows, child.kill() doesn't kill the tree.
        // Use taskkill /T to kill the entire process tree.
        execSync(`taskkill /F /T /PID ${child.pid}`, { stdio: 'ignore' })
      } else {
        // On Unix, kill the process group
        process.kill(-child.pid, 'SIGTERM')
      }
    } catch (e) {
      // Process may have already exited
    }
  }

  console.log('Done. DB still running. Stop with: bash dev.sh stop all')
  process.exit(0)
}

// Handle all exit signals
process.on('SIGINT', killAll)
process.on('SIGTERM', killAll)
process.on('SIGHUP', killAll)

// Also handle Windows console close
if (isWindows) {
  process.on('message', (msg) => {
    if (msg === 'shutdown') killAll()
  })
}

// If all children exit on their own, exit the runner
let exited = 0
for (const child of children) {
  child.on('exit', () => {
    exited++
    if (exited >= children.length) {
      console.log('\nAll services exited.')
      process.exit(0)
    }
  })
}
