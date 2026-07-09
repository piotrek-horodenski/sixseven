<template>
<form
  @submit.prevent=""
  novalidate
  class="ui-form"
>
  <div class="ui-form__content">
    <slot />
  </div>
  <div
    v-if="$slots.errors"
    class="ui-form__errors pb-1"
  >
    <slot name="errors" />
  </div>
  <div class="ui-form__buttons pb-1">
    <slot name="buttons" />
  </div>
</form>
</template>
