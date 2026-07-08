<script setup lang="ts">

import { computed } from 'vue'

import { ELoaderSize, ELoaderSpeed } from './controls.model'

const props = withDefaults(defineProps<{
  size?: ELoaderSize
  speed?: ELoaderSpeed
}>(), {
  size: ELoaderSize.regular,
  speed: ELoaderSpeed.regular,
})

const dimensionBySize = {
  [ELoaderSize.tiny]: '1em',
  [ELoaderSize.regular]: '3em',
  [ELoaderSize.big]: '6em',
}

const durationBySpeed = {
  [ELoaderSpeed.slow]: '2s',
  [ELoaderSpeed.regular]: '.9s',
  [ELoaderSpeed.fast]: '.5s',
}

const dimension = computed(() => {
  return dimensionBySize[props.size]
})

const duration = computed(() => {
  return durationBySpeed[props.speed]
})

const classes = computed(() => {
  return {
    'ui-loader--tiny': props.size === ELoaderSize.tiny,
    'ui-loader--big': props.size === ELoaderSize.big,
    'ui-loader--slow': props.speed === ELoaderSpeed.slow,
    'ui-loader--fast': props.speed === ELoaderSpeed.fast,
  }
})

</script>
<template>
<div
  class="ui-loader"
  :class="classes"
>
  <svg
    :width="dimension"
    :height="dimension"
    viewBox="0 0 38 38"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <linearGradient
        x1="8.042%"
        y1="0%"
        x2="65.682%"
        y2="23.865%"
        id="a"
      >
        <stop
          stop-color="var(--neutral-color)"
          stop-opacity="0"
          offset="0%"
        />
        <stop
          stop-color="var(--neutral-color)"
          stop-opacity=".631"
          offset="63.146%"
        />
        <stop
          stop-color="var(--neutral-color)"
          offset="100%"
        />
      </linearGradient>
    </defs>
    <g
      fill="none"
      fill-rule="evenodd"
    >
      <g transform="translate(1 1)">
        <path
          d="M36 18c0-9.94-8.06-18-18-18"
          id="Oval-2"
          stroke="url(#a)"
          stroke-width="2"
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 18 18"
            to="360 18 18"
            :dur="duration"
            repeatCount="indefinite"
          />
        </path>
        <circle
          fill="var(--neutral-color)"
          cx="36"
          cy="18"
          r="1"
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 18 18"
            to="360 18 18"
            :dur="duration"
            repeatCount="indefinite"
          />
        </circle>
      </g>
    </g>
  </svg>
</div>
</template>
