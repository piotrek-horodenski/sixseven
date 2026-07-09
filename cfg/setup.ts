import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

const root = path.resolve(__dirname, '..')

const services = ['gate', 'web', 'image']

const log = {
  created: (f: string) => console.log(`  created  ${f}`),
  skipped: (f: string) => console.log(`  skipped  ${f} (already exists)`),
  install: (s: string) => console.log(`  npm install ${s}`),
}

// --- cfg/settings.base.json ---
const baseExample = path.join(__dirname, 'settings.base.example.json')
const baseJson    = path.join(__dirname, 'settings.base.json')

if (!fs.existsSync(baseJson)) {
  fs.copyFileSync(baseExample, baseJson)
  log.created('cfg/settings.base.json')
} else {
  log.skipped('cfg/settings.base.json')
}

// --- .env files ---
for (const service of services) {
  const dir     = path.join(root, service)
  const example = path.join(dir, '.env.example')
  const env     = path.join(dir, '.env')

  if (!fs.existsSync(example)) continue

  if (!fs.existsSync(env)) {
    fs.copyFileSync(example, env)
    log.created(`${service}/.env`)
  } else {
    log.skipped(`${service}/.env`)
  }
}

// --- npm install in each service ---
console.log('')
for (const service of services) {
  const dir = path.join(root, service)
  if (!fs.existsSync(path.join(dir, 'package.json'))) continue
  log.install(service)
  execSync('npm install', { cwd: dir, stdio: 'inherit' })
}

// --- next steps ---
console.log(`
Done. Next steps:
  1. Edit cfg/settings.base.json with your values (IPs, ports, cert paths)
  2. cd cfg && npm start   — generates .env files for gate, web, and image
  3. Start services individually: cd gate && npm start
`)
