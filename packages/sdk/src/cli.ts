#!/usr/bin/env node
import path from 'path'

import { GameDefinition } from './contract'
import { serve } from './serve'
import { runContractTests, allPassed } from './harness'

/**
 * CLI sixseven-sdk.
 *
 *   sixseven-sdk serve <ścieżka-modułu> [--port N]
 *       Ładuje GameDefinition i startuje bezstanowy serwis HTTP (wire contract).
 *       Sekret HMAC z env SIXSEVEN_GAME_SECRET.
 *
 *   sixseven-sdk test <ścieżka-modułu>
 *       Uruchamia harness kontrakt-testów na GameDefinition (determinizm,
 *       schemat). Kod wyjścia 0 = wszystko zielone, 1 = coś padło.
 *
 * Moduł gry eksportuje GameDefinition jako `default`, `definition` albo `game`.
 */

async function loadDefinition(modulePath: string): Promise<GameDefinition> {
  const resolved = path.isAbsolute(modulePath) ? modulePath : path.resolve(process.cwd(), modulePath)
  const mod = await import(resolved)
  const def = mod.default ?? mod.definition ?? mod.game
  if (!def || typeof def.resolve !== 'function' || !def.manifest) {
    throw new Error(`moduł ${modulePath} nie eksportuje poprawnego GameDefinition (default/definition/game)`)
  }
  return def as GameDefinition
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main(): Promise<void> {
  const cmd = process.argv[2]
  const modulePath = process.argv[3]

  if (cmd === 'serve') {
    if (!modulePath) throw new Error('podaj ścieżkę modułu gry: sixseven-sdk serve <moduł>')
    const secret = process.env.SIXSEVEN_GAME_SECRET
    if (!secret) throw new Error('ustaw SIXSEVEN_GAME_SECRET (sekret HMAC z rejestracji)')
    const port = Number(argValue('--port') ?? process.env.GAME_PORT ?? 4310)
    const def = await loadDefinition(modulePath)
    serve(def, { secret, port })
    // eslint-disable-next-line no-console
    console.log(`sixseven-sdk serve: ${def.manifest.id}@${def.manifest.version} na :${port}`)
    return
  }

  if (cmd === 'test') {
    if (!modulePath) throw new Error('podaj ścieżkę modułu gry: sixseven-sdk test <moduł>')
    const def = await loadDefinition(modulePath)
    const results = runContractTests(def)
    for (const r of results) {
      // eslint-disable-next-line no-console
      console.log(`${r.passed ? '✓' : '✗'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
    }
    const ok = allPassed(results)
    // eslint-disable-next-line no-console
    console.log(ok ? '\nWszystkie kontrakt-testy zielone.' : '\nKontrakt-testy WYKRYŁY problem.')
    process.exit(ok ? 0 : 1)
  }

  // eslint-disable-next-line no-console
  console.log('sixseven-sdk — komendy: serve <moduł> [--port N], test <moduł>')
  process.exit(cmd ? 1 : 0)
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(`sixseven-sdk: ${err.message}`)
  process.exit(1)
})
