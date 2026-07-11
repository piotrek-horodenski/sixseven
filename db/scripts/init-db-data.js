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

  ['matches', 'match_views', 'rooms'].forEach(function (name) {
    try {
      h.createCollection(name);
      print('[init-db-data] utworzono kolekcje: ' + name);
    } catch (e) {
      print('[init-db-data] kolekcja ' + name + ' juz istnieje (ok)');
    }
  });

  print('[init-db-data] baza hydra gotowa');
})();
