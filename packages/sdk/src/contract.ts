/**
 * Wire contract gry sixseven (szkielet typów — etap 0).
 *
 * Kontrakt (z ARCHITECTURE.md / IMPLEMENTATION_PLAN.md):
 *   init(playerIds, seed, playerData{data,prefs}, options)
 *   resolve(...) -> zawiera revealDurationMs
 *   viewFor(...)
 *   defaultMove(rng)
 *   annotate(...) -> grant/revoke odznak z manifestu
 *
 * Logika gry = bezstanowe HTTP wołane przez platformę (podpisy HMAC,
 * budżet 2 s, 1 zbatchowany /resolve per runda). Ruchy opuszczają
 * platformę DOPIERO po zamknięciu fazy planowania (inwariant I2).
 *
 * Pełne definicje i walidacja zod dochodzą w etapie 2 wraz z `serve` i
 * harnessem `test`. Tu tylko szkic, żeby pakiet istniał w monorepo.
 */

export type PlayerId = string;

export interface PlayerData {
  /** pisane przez annotate() po meczu, ≤ 4 KB */
  data: Record<string, unknown>;
  /** pisane przez UI gry tokenem meczu, ≤ 4 KB */
  prefs: Record<string, unknown>;
}

export interface InitInput {
  playerIds: PlayerId[];
  seed: string;
  playerData: Record<PlayerId, PlayerData>;
  options: Record<string, unknown>;
}

export const SDK_STAGE = 0;
