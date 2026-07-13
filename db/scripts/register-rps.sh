#!/usr/bin/env bash
# Rejestruje RPS w games (kolekcja prywatna `registrations` w bazie `games`)
# ORAZ seeduje dokument katalogowy `games` (Etap 4d/4e, kontrakt §2 „Seed
# katalogu builtin"). Idempotentne upserty po gameId/_id. Uruchamiany jako
# one-shot z docker-compose (usluga games-register), analogicznie do
# rs-init-docker.sh.
#
# WERSJA musi = manifest RPS (1.0.0) — silnik przekazuje ja jako manifestVersion
# i SDK serve odrzuca niezgodna (kontrola wersji C3). planningPhaseMs (15000)
# MUSI = manifest w catalog/rps/src/rps.ts.
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

  // Katalog gier (kolekcja PUBLICZNA 'games'): dokument builtin RPS — published,
  // rankedEligible (ranked wylacznie wbudowane, ADR). BEZ serviceUrl/hmacSecret
  // (te zyja wylacznie w prywatnej 'registrations'). Manifest = podzbior
  // publiczny manifestu z catalog/rps (version/planningPhaseMs zgodne).
  db.games.updateOne(
    { _id: 'rps' },
    { \$set: {
        name: 'Papier, kamień, nożyce',
        builtin: true,
        status: 'published',
        devAccountId: null,
        uiUrl: null,
        rankedEligible: true,
        manifest: {
          version: '1.0.0',
          minPlayers: 2,
          maxPlayers: 8,
          planningPhaseMs: 15000,
          defaultTarget: 5,
          badges: [
            { badgeId: 'flawless', sentiment: 'positive' },
            { badgeId: 'mind-reader', sentiment: 'positive' }
          ],
          playerPrefs: [
            {
              key: 'fallbackMove',
              type: 'enum',
              values: ['rock', 'paper', 'scissors', 'random'],
              default: 'random',
              label: 'Ruch awaryjny (gdy nie zdążysz zagrać)'
            }
          ]
        },
        updatedAt: Date.now()
      },
      \$setOnInsert: { createdAt: Date.now(), publishedAt: Date.now() }
    },
    { upsert: true }
  );
  print('RPS seeded in games catalog (_id=rps, published, rankedEligible)');
"
