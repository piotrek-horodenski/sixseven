#!/usr/bin/env bash
# Rejestruje RPS w games (kolekcja prywatna `registrations` w bazie `games`).
# Idempotentny upsert po gameId. Uruchamiany jako one-shot z docker-compose
# (usluga games-register), analogicznie do rs-init-docker.sh.
#
# WERSJA musi = manifest RPS (1.0.0) — silnik przekazuje ja jako manifestVersion
# i SDK serve odrzuca niezgodna (kontrola wersji C3).
# hmacSecret MUSI = SIXSEVEN_GAME_SECRET uslugi `rps` (RPS_HMAC_SECRET z .env).
set -euo pipefail

: "${RPS_HMAC_SECRET:?RPS_HMAC_SECRET nie ustawiony}"

mongosh "mongodb://hydra-mongo1:27017/hydra?replicaSet=h2dbs" --quiet --eval "
  db.registrations.updateOne(
    { gameId: 'rps' },
    { \$set: {
        gameId: 'rps',
        name: 'rps',
        version: '1.0.0',
        serviceUrl: 'http://rps:4310',
        hmacSecret: '${RPS_HMAC_SECRET}',
        manifest: {},
        status: 'active',
        updatedAt: Date.now()
      },
      \$setOnInsert: { createdAt: Date.now() }
    },
    { upsert: true }
  );
  print('RPS registered in games (gameId=rps, serviceUrl=http://rps:4310)');
"
