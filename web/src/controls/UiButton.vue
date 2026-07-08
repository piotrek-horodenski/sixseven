<script setup lang="ts">

const props = withDefaults(defineProps<{
  icon?: string
  loading?: boolean
  disabled?: boolean
  type?: string
}>(), {
  icon: '',
  loading: false,
  disabled: false,
  type: 'button',
})

</script>
<template>
<button
  class="ui-button"
  :type="props.type"
  :disabled="disabled"
>
  <span>
    <TransitionGroup name="button-spinner">
      <span
        v-if="loading"
        class="ui-button__spinner"
      >
        <fa
          icon="spinner"
          class="rotate"
        />
      </span>
      <span
        v-if="icon"
        class="ui-button__spinner"
      >
        <fa
          
          class="ui-button__icon"
          :icon="icon"
        />
      </span>
    </TransitionGroup>
    <span class="ui-button__content">
      <Transition name="button-spinner">
      </Transition>
      <slot />
    </span>
  </span>
</button>
</template>
