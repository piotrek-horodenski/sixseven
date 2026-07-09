#!/usr/bin/env node
/**
 * Generuje silny sekret JWT i (domyślnie) zapisuje/rotuje JWT_SECRET w ./.env.
 *
 *   node scripts/gen-secret.js           # rotuje JWT_SECRET w .env (tworzy .env z .env.example jeśli brak)
 *   node scripts/gen-secret.js --print   # tylko wypisuje nowy sekret, nic nie zapisuje
 *
 * UWAGA: rotacja sekretu unieważnia wszystkie aktywne tokeny (gate weryfikuje
 * podpis; image używa tego samego sekretu). Po rotacji użytkownicy logują się
 * ponownie. Sekret jest współdzielony gate↔image — trzymamy go w jednym .env.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const secret = crypto.randomBytes(48).toString("base64");

if (process.argv.includes("--print")) {
  process.stdout.write(secret + "\n");
  process.exit(0);
}

const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env");
const examplePath = path.join(root, ".env.example");

let content = "";
if (fs.existsSync(envPath)) {
  content = fs.readFileSync(envPath, "utf8");
} else if (fs.existsSync(examplePath)) {
  content = fs.readFileSync(examplePath, "utf8");
  console.log("Utworzono .env z .env.example");
}

if (/^JWT_SECRET=.*$/m.test(content)) {
  content = content.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret}`);
} else {
  content += (content.endsWith("\n") || content === "" ? "" : "\n") + `JWT_SECRET=${secret}\n`;
}

fs.writeFileSync(envPath, content);
console.log("JWT_SECRET zrotowany w .env (aktywne sesje zostaną unieważnione).");
