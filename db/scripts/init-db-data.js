// Bootstrap bazy po inicjalizacji replica setu (ladowany przez rs-init-docker.sh).
// Wlasciwe dane (uzytkownicy/role) seeduje gate przy starcie; rejestracje RPS
// wpisuje games-register. Tutaj:
//  1) znacznik istnienia bazy (zeby primary sie "rozgrzalo"),
//  2) PRE-TWORZENIE kolekcji subskrybowalnych pisanych przez games (matches,
//     match_views). Gate otwiera change-stream na tych kolekcjach przy pierwszej
//     subskrypcji — a watch() na NIEISTNIEJACEJ kolekcji potrafi sie nie podpiac,
//     przez co live-delivery nie rusza. Utworzenie ich z gory rozwiazuje problem.

(function () {
  var h = db.getSiblingDB('hydra');
  h._init.updateOne({ _id: 'init' }, { $set: { at: new Date() } }, { upsert: true });

  // Etap 4d/4e: 'games' tworzy tez games-register (upsert), ale 'ratings' i
  // 'queue' powstalyby dopiero przy PIERWSZYM zapisie (pierwsze ELO / pierwszy
  // queue-join) — a web subskrybuje je od razu. Pre-tworzymy, zeby watch() gate
  // mial sie do czego podpiac (ten sam problem co matches/match_views).
  ['matches', 'match_views', 'rooms', 'games', 'ratings', 'queue'].forEach(function (name) {
    try {
      h.createCollection(name);
      print('[init-db-data] utworzono kolekcje: ' + name);
    } catch (e) {
      print('[init-db-data] kolekcja ' + name + ' juz istnieje (ok)');
    }
  });

  // Pre-images change-streamu dla `queue` (Etap 4e, bug „Anuluj oczekiwanie"):
  // matchmaker USUWA wpisy (deleteMany/leave), a gate dopasowuje delete do
  // filtra row-level po fullDocumentBeforeChange — bez pre-images go nie ma
  // (gate ma fallback broadcastowy, pre-images przywracaja precyzje).
  // Idempotentne; wymaga mongo >= 6.0 (RS h2dbs spelnia).
  try {
    h.runCommand({ collMod: 'queue', changeStreamPreAndPostImages: { enabled: true } });
    print('[init-db-data] pre-images wlaczone dla: queue');
  } catch (e) {
    print('[init-db-data] collMod queue pre-images nieudany (fallback gate wystarczy): ' + e);
  }

  print('[init-db-data] baza hydra gotowa');
})();
