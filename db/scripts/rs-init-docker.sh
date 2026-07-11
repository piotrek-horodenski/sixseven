#!/usr/bin/env bash
# Jednorazowa inicjalizacja replica setu `h2dbs` (3 wezly: hydra-mongo1/2/3) dla
# docker-compose. Idempotentne: przy ponownym uruchomieniu rs.initiate() rzuca
# "already initialized" i lecimy dalej. Na koncu laduje init-db-data.js.
#
# Uwaga: czlonkowie RS sa adresowani nazwami uslug docker (hydra-mongo1:27017 itd.),
# wiec dzialaja WEWNATRZ sieci compose (klienci z replicaSet=h2dbs), inaczej niz
# testy z hosta (te uzywaja osobnego 1-wezlowego RS na 27140 — patrz ETAP2.md).
set -uo pipefail

MONGO1="hydra-mongo1:27017"

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
      { _id: 0, host: "hydra-mongo1:27017" },
      { _id: 1, host: "hydra-mongo2:27017" },
      { _id: 2, host: "hydra-mongo3:27017" }
    ]
  });
  print("[rs-init] replica set zainicjalizowany");
} catch (e) {
  print("[rs-init] rs.initiate pominiete: " + e.message);
}
'

echo "[rs-init] czekam na wybor primary ..."
until mongosh --host "$MONGO1" --quiet --eval "db.hello().isWritablePrimary" 2>/dev/null | grep -q true; do
  sleep 2
done

echo "[rs-init] laduje init-db-data.js ..."
mongosh --host "$MONGO1" --quiet /scripts/init-db-data.js || echo "[rs-init] init-db-data.js zwrocil blad (pomijam)"

echo "[rs-init] gotowe."
