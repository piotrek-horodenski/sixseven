import express from "express";

/**
 * games — serwis skarbca (silnik meczów, matchmaking, trust).
 *
 * ETAP 0: to jest wyłącznie szkielet z endpointem /health, żeby serwis
 * bootował i wchodził do monorepo/CI. Właściwa logika powstaje później:
 *   - Etap 2: maszyna stanów meczu, kolekcje prywatne (moves, match_states,
 *     resolve_log), wire contract do serwisów gier.
 *   - Etap 3: matchmaking, kolejka, presence, kwoty.
 *   - Etap 4: ELO, hosting bundli UI.
 *   - Etap 5: silnik zaufania (trust_events, formuły, progi).
 * Kolekcje prywatne games NIE są nigdy wystawiane przez gate (patrz
 * IMPLEMENTATION_PLAN.md — model danych).
 */
export async function boot(): Promise<void> {
  const app = express();
  const port = Number(process.env.GAMES_PORT ?? 4120);

  app.get("/health", (_req, res) => {
    res.json({ service: "games", status: "ok", stage: 0 });
  });

  await new Promise<void>((resolve) => {
    app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`games listening on :${port}`);
      resolve();
    });
  });
}
