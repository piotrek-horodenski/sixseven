<script setup lang="ts">

import { ref, computed, watch, type Ref } from 'vue'
import { storeToRefs } from 'pinia'

import { useLayoutStore } from '@/stores/layout.store'
import { EPopupSize } from './controls.model'

const animationDuration = 300

const emit = defineEmits(['update:show', 'closed'])
const props = withDefaults(defineProps<{
  show: boolean
  closable?: boolean
  outsideClose?: boolean
  size?: EPopupSize
}>(), {
  show: false,
  closable: true,
  outsideClose: false,
  size: EPopupSize.regular,
})

const isTransitioning = ref(true)
const popupContent = ref(null)
const lastActiveElement: Ref<Element | null> = ref(null)
const hiding = ref(false)
const showing = ref(false)
let timeoutId = -1

const showPopup = computed(() => {
  return props.show || hiding.value
})

function getClasses(prefix: string) {
  return {
    [prefix + '--shown']: showing.value,
    [prefix + '--thin']: props.size === EPopupSize.thin,
    [prefix + '--wide']: props.size === EPopupSize.wide,
    [prefix + '--transitioning']: isTransitioning.value,
  }
}

const classes = computed(() => {
  return getClasses('ui-popup')
})

function close() {
  emit('update:show', false)
}

function addInertToBackground() {
  const appContent = document.querySelector('.app-content')

  if (!appContent) {
    return
  }

  appContent.setAttribute('inert', '')
}

function removeInertFromBackground() {
  const appContent = document.querySelector('.app-content')

  if (!appContent) {
    return
  }

  appContent.removeAttribute('inert')
}

function addFixedToBody() {
  const body = document.querySelector('body')

  if (!body) {
    return
  }

  const scollTop = window.scrollY
  body.classList.add('popup-opened')
  body.style.top = `-${scollTop}px`
}

function removeFixedFromBody() {
  const body = document.querySelector('body')

  if (!body) {
    return
  }

  const scrollTop = -parseInt(body.style.top)

  body.style.top = '0'
  body.classList.remove('popup-opened')
  window.scrollTo(0, scrollTop)
}

function scrollTopPopups() {
  const popups = document.querySelector('#popups')

  if (!popups) {
    return
  }

  popups.scrollTo(0, 0)
}

function startShowing() {
  showing.value = true

  addFixedToBody()
  addInertToBackground()
  scrollTopPopups()
}

function finishHiding() {
  hiding.value = false
  emit('closed')
  if (lastActiveElement.value) {
    (lastActiveElement.value as HTMLElement).focus()
  }
}

function checkClick() {
  if (props.outsideClose) {
    close()
  }
}

watch(() => props.show, (value, oldValue) => {
  if (value) {
    lastActiveElement.value = document.activeElement
    clearTimeout(timeoutId)
    timeoutId = setTimeout(startShowing, 50)
  } else if (oldValue !== undefined) {
    showing.value = false
    hiding.value = true
    removeInertFromBackground()
    removeFixedFromBody()
    clearTimeout(timeoutId)
    timeoutId = setTimeout(finishHiding, animationDuration)
  }
}, { immediate: true })

</script>
<template>
<Teleport
  v-if="showPopup"
  to="#popups"
>
  <div
    class="ui-popup__overlay"
    @click="checkClick"
  ></div>
</Teleport>
<Teleport
  v-if="showPopup"
  to="#popups"
>
  <div
    class="ui-popup"
    :class="classes"
  >
    <div class="ui-popup__title">
      <div class="ui-popup__title-text">
        <slot name="title" />
      </div>
      <div
        v-if="closable"
        class="ui-popup__close"
        
      >
        <a
          href="///"
          @click.prevent="close"
        ><fa icon="times" /></a>
      </div>
    </div>
    <div
      class="ui-popup__content"
      ref="popupContent"
    >
      <slot />
    </div>
  </div>
</Teleport>
</template>
