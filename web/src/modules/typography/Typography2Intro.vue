<template>
<div class="pt-1 pb-1 pl-3 pr-3">
  <h1>Typography2</h1>
  <div>
    <p>This is the second typography page</p>
  </div>
  <div class="buttons pt-1">
    <UiButton
      @click="$router.push({ name: 'typo' })"
    >
      goto 1
    </UiButton>
  </div>
</div>
</template>
