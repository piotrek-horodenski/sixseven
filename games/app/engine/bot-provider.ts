/**
 * Hak na bota (Etap 4e — SCAFFOLD, kontrakt §2 „Hak na bota").
 *
 * Pełna implementacja = Etap 5 (pułapki/zawodnik): provider będzie decydował,
 * czy do meczu w lobby z wolnym slotem dosadzić bota (np. po czasie oczekiwania,
 * wg preferencji twórcy), i wykona dołączenie ścieżką join-match. W 4e wpinamy
 * TYLKO interfejs + noop, wołany z ticku schedulera dla lobby z wolnym slotem —
 * żeby Etap 5 nie musiał ruszać pętli schedulera.
 */

/** Metadane meczu w lobby (bez treści ruchów/stanu — I1). */
export interface LobbyMatchInfo {
  matchId: string
  gameId: string
  players: string[]
  guestIds: string[]
  capacity: number
  createdAt: number
}

export interface BotProvider {
  /** Wołany per mecz w lobby z wolnym slotem. Może (Etap 5) dosadzić bota. */
  maybeJoinLobby(match: LobbyMatchInfo): Promise<void>
}

/** Domyślny provider 4e: nic nie robi (boty = Etap 5). */
export const noopBotProvider: BotProvider = {
  async maybeJoinLobby(): Promise<void> {
    // celowo puste — scaffold na Etap 5
  },
}
