#!/usr/bin/env bash
# Jednorazowa inicjalizacja replica setu `h2dbs` (3 wezly: hydra-mongo1/2/3) dla
# docker-compose. Idempotentne: przy ponownym uruchomieniu rs.initiate() rzuca
# "already initialized" i lecimy dalej. Na koncu laduje init-db-data.js.
#
# Uwaga: czlonkowie RS sa adresowani nazwami uslug docker (hydra-mongo1:27017 itd.),
# wiec dzialaja WEWNATRZ sieci compose (klienci z replicaSet=h2dbs), inaczej niz
# testy z hosta (te uzywaja osobnego 1-wezlowego RS na 27140 — patrz ETAP2.md).
#
# FIX (2026-07): po restarcie klastra primary moze zostac wybrany DOWOLNY wezel
# (nie mongo1) — stara petla czekala wylacznie na "mongo1 == primary" i wisiala
# w nieskonczonosc. Teraz: (1) mongo1 dostaje priority 2, wiec przy swiezej
# inicjalizacji i kolejnych elekcjach jest preferowany, (2) petla czeka na
# JAKIKOLWIEK primary, (3) init-db-data.js laduje przez URI replica setu,
# ktore samo trafia w primary.
set -uo pipefail

MONGO1="hydra-mongo1:27017"
RS_URI="mongodb://hydra-mongo1:27017,hydra-mongo2:27017,hydra-mongo3:27017/?replicaSet=h2dbs"

echo "[rs-init] czekam na $MONGO1 ..."
until mongosh --host "$MONGO1" --quiet --eval "db.adminCommand('ping').ok" >/dev/null 2>&1; do
  sleep 2
done

echo "[rs-init] rs.initiate(h2dbs) ..."
mongosh --host "$MONGO1" --quiet --eval '
try {
  rs.initiate({
    _id: "h2dbs",
    members: [
      { _id: 0, host: "hydra-mongo1:27017", priority: 2 },
      { _id: 1, host: "hydra-mongo2:27017" },
      { _id: 2, host: "hydra-mongo3:27017" }
    ]
  });
  print("[rs-init] replica set zainicjalizowany");
} catch (e) {
  print("[rs-init] rs.initiate pominiete: " + e.message);
}
'

echo "[rs-init] czekam na wybor primary (ktorykolwiek wezel) ..."
until mongosh --host "$MONGO1" --quiet --eval 'rs.status().members.some(function (m) { return m.stateStr === "PRIMARY"; })' 2>/dev/null | grep -q true; do
  sleep 2
done

echo "[rs-init] laduje init-db-data.js (URI replica setu -> zawsze primary) ..."
mongosh "$RS_URI" --quiet /scripts/init-db-data.js || echo "[rs-init] init-db-data.js zwrocil blad (pomijam)"

echo "[rs-init] gotowe."
