<script setup lang="ts">

import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'

import { useLayoutStore } from '@/stores/layout/layout.store'
import { ETheme } from '@/stores/layout/layout.model'

const { theme } = storeToRefs(useLayoutStore())
const mode = computed({
  get() {
    return theme.value === ETheme.dark
  },
  set(value) {
    theme.value = value ? ETheme.dark : ETheme.light
  },
})

const showProgress = ref(false)
const showPopup1 = ref(false)

function onPopup1Closed() {
  // console.log('Popup closed')
}

</script>
<template>
<div>
  <UiProgress
    :show="showProgress"
  />
  <div class="typography">
    <div class="buttons">
      <UiSwitch
        v-model="mode"
      >{{ mode ? 'dark mode' : 'light mode' }}</UiSwitch>
      <UiSwitch
        v-model="showProgress"
      >{{ showProgress ? 'hide progress bar' : 'show progress bar' }}</UiSwitch>
    </div>

    <h2>Popups</h2>
    <UiButton @click="showPopup1 = true">
      show popup
    </UiButton>

    <UiPopup
      v-model:show="showPopup1"
      :outside-close="true"
      @closed="onPopup1Closed"
    >
      <template #title>
        Popup title
      </template>
      <UiForm>
        <p>Popup content</p>
        <div style="height: 120px;">

        </div>
        <template #errors>
          <UiMessage type="error">
            <template #title>
              Error title
            </template>
            Error message
          </UiMessage>
        </template>
        <template #buttons>
          <UiButton @click="showPopup1 = false">
            Close
          </UiButton>
          <UiButton
            class="accent"
            @click="showPopup1 = false"
          >
            Save
          </UiButton>
        </template>
      </UiForm>
    </UiPopup>
    <h2>Unordered List</h2>
    <ul>
      <li>Item 1</li>
      <li>Item 2</li>
      <li>Item 3</li>
      <li>Item 4</li>
    </ul>

    <h2>Links</h2>
    <div>
      <a
        href="#regular-link"
      >Regular link</a>
    </div>
    <div>
      <a
        href="#accent-link"
        class="accent"
      >Accent link</a>
    </div>
    <div>
      <a
        href="#regular-link"
        class="with-quotes"
      >Regular link with quotes</a>
    </div>
    <div>
      <a
        href="#accent-link"
        class="accent with-quotes"
      >Accent link with quotes</a>
    </div>

    <h2>Links in paragraph</h2>
    <p><a href="#link-in-paragraph-with-accent" class="accent">Paragraph</a> text lorem ipsum. Sed ut <a href="#link-in-paragraph" class="with-quotes">perspiciatis</a>, unde omnis iste natus error sit voluptatem accusantium <a href="#link-in-paragraph-light">doloremque</a> laudantium, totam rem aperiam eaque ipsa, quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt, explicabo. Nemo enim ipsam voluptatem, quia voluptas sit, aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos, qui ratione voluptatem sequi nesciunt, neque porro quisquam est, qui dolorem ipsum, quia dolor sit, amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt, ut labore et dolore magnam aliquam quaerat <a href="#link-in-paragraph-with-accent" class="accent with-quotes">voluptatem</a>.</p>

    
    <h1>Header 1</h1>
    <h2>Header 2</h2>
    <h3>Header 3</h3>
    <h4>Header 4</h4>

    <p>Paragraph text lorem ipsum. Sed ut perspiciatis, unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam eaque ipsa, quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt, explicabo. Nemo enim ipsam voluptatem, quia voluptas sit, aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos, qui ratione voluptatem sequi nesciunt, neque porro quisquam est, qui dolorem ipsum, quia dolor sit, amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt, ut labore et dolore magnam aliquam quaerat voluptatem. Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur? Quis autem vel eum iure reprehenderit, qui in ea voluptate velit esse, quam nihil molestiae consequatur, vel illum, qui dolorem eum fugiat, quo voluptas nulla pariatur?</p>

    <p>Paragraph text lorem ipsum. Sed ut perspiciatis, unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam eaque ipsa, quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt, explicabo. Nemo enim ipsam voluptatem, quia voluptas sit, aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos, qui ratione voluptatem sequi nesciunt, neque porro quisquam est, qui dolorem ipsum, quia dolor sit, amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt, ut labore et dolore magnam aliquam quaerat voluptatem. Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur? Quis autem vel eum iure reprehenderit, qui in ea voluptate velit esse, quam nihil molestiae consequatur, vel illum, qui dolorem eum fugiat, quo voluptas nulla pariatur?</p>

    <hr />

    <p>Paragraph text lorem ipsum. Sed ut perspiciatis, unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam eaque ipsa, quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt, explicabo. Nemo enim ipsam voluptatem, quia voluptas sit, aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos, qui ratione voluptatem sequi nesciunt, neque porro quisquam est, qui dolorem ipsum, quia dolor sit, amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt, ut labore et dolore magnam aliquam quaerat voluptatem. Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur? Quis autem vel eum iure reprehenderit, qui in ea voluptate velit esse, quam nihil molestiae consequatur, vel illum, qui dolorem eum fugiat, quo voluptas nulla pariatur?</p>

  </div>
</div>
</template>
