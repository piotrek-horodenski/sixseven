<script setup lang="ts">
import type { RpsMove } from '@/stores/games/games.model'

/**
 * RpsIcon — wbudowane obrazki ruchów RPS. Dla każdego ruchu pokazujemy OBOK
 * SIEBIE gest dłoni i przedmiot (kamień/kartka/nożyce), w kolorowym stylu
 * „sticker" (wypełnienia + ciemny obrys). Czysty inline SVG — zero zewnętrznych
 * zasobów, ostre w każdej skali. Gra RPS jest first-party (built-in), więc jej
 * grafika też żyje w platformie.
 *
 * `move === null` → stan „ukryty" (przed odsłoną) — znak zapytania.
 */
defineProps<{ move: RpsMove | null }>()
</script>
<template>
<svg viewBox="0 0 72 44" xmlns="http://www.w3.org/2000/svg" class="rps-icon" role="img" aria-hidden="true">
  <g stroke="#2b2d42" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
    <!-- KAMIEŃ: pięść + kamień -->
    <template v-if="move === 'rock'">
      <rect x="6" y="18" width="22" height="19" rx="8" fill="#f6b93b" />
      <circle cx="11" cy="18" r="3.4" fill="#f6b93b" />
      <circle cx="17.5" cy="17" r="3.4" fill="#f6b93b" />
      <circle cx="24" cy="18" r="3.4" fill="#f6b93b" />
      <rect x="5" y="24" width="9" height="7" rx="3.5" fill="#e8a92e" />
      <path d="M42 35 q-5 -13 9 -17 q12 -4 16 5 q5 8 -2 14 q-6 5 -16 4 q-9 -1 -7 -6 z" fill="#9aa5b1" />
      <path d="M49 24 q6 -3 11 1" fill="none" stroke="#77828f" stroke-width="1.6" />
    </template>

    <!-- PAPIER: otwarta dłoń + kartka -->
    <template v-else-if="move === 'paper'">
      <rect x="7" y="22" width="20" height="15" rx="7" fill="#f6b93b" />
      <rect x="7.5" y="11" width="4.6" height="15" rx="2.3" fill="#f6b93b" />
      <rect x="12.7" y="8" width="4.6" height="18" rx="2.3" fill="#f6b93b" />
      <rect x="17.9" y="8" width="4.6" height="18" rx="2.3" fill="#f6b93b" />
      <rect x="23" y="11" width="4.6" height="15" rx="2.3" fill="#f6b93b" />
      <rect x="2.5" y="24" width="8" height="5" rx="2.5" fill="#e8a92e" transform="rotate(-24 6.5 26.5)" />
      <path d="M44 9 h15 l6 6 v23 h-21 z" fill="#ffffff" />
      <path d="M59 9 v6 h6" fill="#e6e9ee" />
      <line x1="48" y1="22" x2="60" y2="22" stroke="#cbd2d9" />
      <line x1="48" y1="27" x2="61" y2="27" stroke="#cbd2d9" />
      <line x1="48" y1="32" x2="57" y2="32" stroke="#cbd2d9" />
    </template>

    <!-- NOŻYCE: dłoń „V" + nożyce -->
    <template v-else-if="move === 'scissors'">
      <rect x="9" y="22" width="18" height="15" rx="7" fill="#f6b93b" />
      <rect x="9.5" y="7" width="4.6" height="19" rx="2.3" fill="#f6b93b" transform="rotate(-13 11.8 24)" />
      <rect x="18" y="7" width="4.6" height="19" rx="2.3" fill="#f6b93b" transform="rotate(13 20.3 24)" />
      <rect x="22" y="25" width="6" height="7" rx="3" fill="#e8a92e" />
      <circle cx="44" cy="20" r="4.5" fill="none" stroke="#e94b4b" stroke-width="3" />
      <circle cx="44" cy="31" r="4.5" fill="none" stroke="#e94b4b" stroke-width="3" />
      <line x1="47.5" y1="20.5" x2="67" y2="31" stroke="#90a4ae" stroke-width="3.4" />
      <line x1="47.5" y1="30.5" x2="67" y2="20" stroke="#90a4ae" stroke-width="3.4" />
      <circle cx="53" cy="25.6" r="1.9" fill="#2b2d42" stroke="none" />
    </template>

    <!-- UKRYTE (przed odsłoną) -->
    <template v-else>
      <rect x="26" y="9" width="20" height="26" rx="6" fill="#c7cdd6" />
      <text
        x="36"
        y="30"
        text-anchor="middle"
        font-size="18"
        font-weight="700"
        fill="#2b2d42"
        stroke="none"
        font-family="system-ui, sans-serif"
      >?</text>
    </template>
  </g>
</svg>
</template>
