<script setup lang="ts">

import { computed, onMounted, ref } from 'vue'

const props = defineProps<{
  show: boolean
}>()

const current = ref(0)

const styles = computed(() => {
  return 'transform: translate3d(' + 
    (current.value * 200 - 100) +
    '%,0,0);'
})

const classes = computed(() => {
  return {
    'ui-progress--hidden': !props.show,
  }
})

function recalculate() {
  current.value += (.05 + .5 * Math.random())
  if (current.value >= 1.1) {
    current.value = -.05
  }
}

function next() {
  recalculate()
  setTimeout(next, 800 + Math.random() * 2700)
}

onMounted(() => {
  recalculate()

  requestAnimationFrame(next)
})

</script>
<template>
<div
  class="ui-progress"
  :class="classes"
>
  <div
    class="ui-progress__bar"
    role="bar"
    :style="styles"
  >
    <div class="ui-progress__peg"></div>
  </div>
</div>
</template>
