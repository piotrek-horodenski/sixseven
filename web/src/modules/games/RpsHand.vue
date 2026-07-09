<script setup lang="ts">
import { computed } from 'vue'
import { moveMeta } from './rps.consts'
import type { RpsMove } from '@/stores/games/games.model'
import RpsIcon from './RpsIcon.vue'

const props = defineProps<{
  move: RpsMove | null
  /** true = odsłonięte (pokaż realny ruch); false = stan ukryty (trzęsie się). */
  revealed: boolean
  outcome?: 'win' | 'lose' | 'draw' | null
  label: string
  defaulted?: boolean
}>()

// Przed odsłoną pokazujemy stan ukryty (null → znak zapytania), po — realny ruch.
const shownMove = computed<RpsMove | null>(() => (props.revealed ? props.move : null))
const moveLabel = computed(() => (props.revealed && props.move ? moveMeta(props.move).label : ''))
</script>
<template>
<div
  class="rps-hand"
  :class="[
    revealed ? 'rps-hand--revealed' : 'rps-hand--shaking',
    outcome ? `rps-hand--${outcome}` : '',
  ]"
>
  <span class="rps-hand__player">{{ label }}</span>
  <div class="rps-hand__disc">
    <Transition name="rps-flip" mode="out-in">
      <RpsIcon :key="shownMove ?? 'hidden'" :move="shownMove" class="rps-hand__icon" />
    </Transition>
  </div>
  <span class="rps-hand__move">
    {{ moveLabel }}
    <span v-if="revealed && defaulted" class="rps-hand__defaulted">(auto)</span>
  </span>
</div>
</template>
