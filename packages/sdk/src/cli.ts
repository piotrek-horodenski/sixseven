#!/usr/bin/env node
/**
 * CLI sixseven-sdk (szkielet — etap 0).
 * Komendy `serve` (serwer deweloperski gry) i `test` (harness kontrakt-testów)
 * implementowane w etapie 2.
 */
const cmd = process.argv[2];

if (cmd === "serve" || cmd === "test") {
  // eslint-disable-next-line no-console
  console.log(`sixseven-sdk ${cmd}: not implemented yet (planned: etap 2)`);
  process.exit(0);
} else {
  // eslint-disable-next-line no-console
  console.log("sixseven-sdk — dostępne komendy (w budowie): serve, test");
  process.exit(0);
}
