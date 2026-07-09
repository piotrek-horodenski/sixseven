<script setup lang="ts">
import { computed } from 'vue'
import { moveMeta } from './rps.consts'
import type { RpsMove } from '@/stores/games/games.model'

const props = defineProps<{
  move: RpsMove | null
  /** true = odsłonięte (pokaż realny ruch); false = trzęsąca się pięść. */
  revealed: boolean
  outcome?: 'win' | 'lose' | 'draw' | null
  label: string
  defaulted?: boolean
}>()

const icon = computed(() => (props.revealed && props.move ? moveMeta(props.move).icon : 'hand-back-fist'))
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
      <fa :key="icon" :icon="icon" class="rps-hand__icon" />
    </Transition>
  </div>
  <span class="rps-hand__move">
    {{ moveLabel }}
    <span v-if="revealed && defaulted" class="rps-hand__defaulted">(auto)</span>
  </span>
</div>
</template>
