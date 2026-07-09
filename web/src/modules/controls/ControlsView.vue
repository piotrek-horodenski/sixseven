<script setup lang="ts">

import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'

import {
  Roll3dUpAnimation,
  Roll3dDownAnimation,
} from '@/controls/animations.consts'
import { EAnimationType } from '@/controls/animations.model'
import { useLayoutStore } from '@/stores/layout/layout.store'
import { EMenuType, ETheme } from '@/stores/layout/layout.model'

const { menuType, theme } = storeToRefs(useLayoutStore())
const { switchMenuType } = useLayoutStore()

const mode = computed({
  get() {
    return theme.value === ETheme.dark
  },
  set(value) {
    theme.value = value ? ETheme.dark : ETheme.light
  },
})
const showProgress = ref(false)
const showMessage1 = ref(false)
const showMessage2 = ref(true)
const chb1 = ref(false)
const chb2 = ref(false)
const chb3 = ref(true)
const radioValue = ref(null)
const isSpinning = ref(true)
const switch1 = ref(true)
const switch2 = ref(false)
const selectValue = ref<string | null>(null)
const multiselectValue = ref<string[]>([])
const autocompleteValue = ref<string | null>(null)
const selectOptions = [
  { label: 'Option A', value: 'a' },
  { label: 'Option B', value: 'b' },
  { label: 'Option C', value: 'c' },
  { label: 'Disabled option', value: 'd', disabled: true },
  { label: 'Option E', value: 'e' },
]
const colorValue = ref('#d4953d')
const colorWithAlpha = ref('#ffd4953d')
const text1 = ref('')
const text2 = ref('')
const text3 = ref('')
const number1 = ref(0)
const generalItem = ref(1)
const generalItemOld = ref(1)

const currentAnimationInstance = computed(() => {
  let type = EAnimationType.changing

  if (generalItem.value === 3) {
    type = EAnimationType.disappearing
  } else if (generalItemOld.value === 3) {
    type = EAnimationType.appearing
  }

  return generalItem.value === 1 ? {
    definition: Roll3dDownAnimation,
    type,
  } : {
    definition: Roll3dUpAnimation,
    type,
  }
})

const menuTypeSwitch = computed({
  get: () => {
    return menuType.value === EMenuType.horizontal
  },
  set: (value) => {
    switchMenuType(!!value ? EMenuType.horizontal : EMenuType.vertical)
  },
})

watch(generalItem, (value, old) => {
  generalItemOld.value = old
})

onMounted(() => {
  setTimeout(() => {
    showMessage1.value = !showMessage1.value
  }, 1000)
})

</script>
<template>
<div>
  <UiProgress
    :show="showProgress"
  />
  <div class="typography">
    <div class="buttons">
      <UiSwitch
        v-model="menuTypeSwitch"
      >top menu</UiSwitch>
      <UiSwitch
        v-model="mode"
      >{{ mode ? 'dark mode' : 'light mode' }}</UiSwitch>
      <UiSwitch
        v-model="showProgress"
      >{{ showProgress ? 'hide progress bar' : 'show progress bar' }}</UiSwitch>
    </div>
    <h2>Transitions</h2>
    <div class="buttons pb-1">
      <UiButton
        @click="generalItem = 1"
      >
        show msg 1
      </UiButton>
      <UiButton
        @click="generalItem = 2"
      >
        show msg 2
      </UiButton>
      <UiButton
        @click="generalItem = 3"
      >
        show msg 3
      </UiButton>
    </div>
    <UiGeneralTransition
      :animation-instance="currentAnimationInstance"
    >
      <UiMessage
        v-if="generalItem === 1"
        id="msg1"
        v-tooltip="'Co za dupa z tym tooltipem'"
      >
        <template #title>
          Message no 1
        </template>
        This is some info message
      </UiMessage>
      <UiMessage
        v-if="generalItem === 2"
        type="warning"
        id="msg2"
      >
        <template #title>
          Message no 2
        </template>
        This is some warning message<br />
        And some details
      </UiMessage>
    </UiGeneralTransition>

    <h2>UiAutocomplete</h2>
    <div class="buttons">
      <UiAutocomplete
        v-model="autocompleteValue"
        :options="selectOptions"
        placeholder="Search..."
      >
        Autocomplete label
      </UiAutocomplete>
      <UiAutocomplete
        v-model="autocompleteValue"
        :options="selectOptions"
        :free-text="true"
        placeholder="Free text allowed"
      >
        Free text
      </UiAutocomplete>
    </div>

    <h2>UiButtons</h2>
    <div class="buttons">
      <UiButton>
        simple
      </UiButton>
      <UiButton class="accent">
        simple accent
      </UiButton>
      <UiButton
        icon="times"
        :disabled="isSpinning"
      >
        regular
      </UiButton>
      <UiButton
        class="accent"
        :icon="isSpinning ? null : 'check'"
        :loading="isSpinning"
        @click="isSpinning = !isSpinning"
      >
        accent spinner
      </UiButton>
      <UiButton
        class="accent"
        :loading="isSpinning"
        :disabled="isSpinning"
      >
        accent
      </UiButton>
    </div>

    <h2>UiCheckboxes</h2>
    <UiCheckbox
      v-model="chb1"
      :disabled="!chb3"
    >checkbox 1</UiCheckbox>
    <UiCheckbox
      v-model="chb2"
      class="accent"
    >checkbox 2</UiCheckbox>
    <UiCheckbox
      v-model="chb3"
      class="accent"
    >checkbox 3</UiCheckbox>

    <h2>UiColorPicker</h2>
    <div class="buttons">
      <UiColorPicker
        v-model="colorValue"
      >
        Pick a color
      </UiColorPicker>
      <UiColorPicker
        v-model="colorWithAlpha"
        :has-opacity="true"
      >
        With opacity
      </UiColorPicker>
      <UiColorPicker
        v-model="colorValue"
        :disabled="true"
      >
        Disabled
      </UiColorPicker>
    </div>

    <h2>UiInputs</h2>
    <div class="buttons">
      <UiInput
        v-model="text1"
        :disabled="true"
        type="text"
        placeholder="Type some shit"
      >
        Label
      </UiInput>
      <UiInput
        v-model="text1"
        type="text"
        placeholder="Type some shit"
      >
        Label
      </UiInput>
      <UiInput
        v-model="text2"
        type="password"
        placeholder="Enter password"
      >
        Label for password
      </UiInput>
      <UiTextarea
        v-model="text3"
        :disabled="true"
        :auto-height="false"
        placeholder="Type something long"
      >
        Label for textarea
      </UiTextarea>
      <UiTextarea
        v-model="text3"
        placeholder="Type something long"
      >
        Label for textarea
      </UiTextarea>
      <UiNumber
        v-model="number1"
        :precision="2"
      >
        Number
      </UiNumber>
    </div>

    <h2>UiLoaders</h2>
    <div class="buttons">
      <UiLoader />
      <UiLoader
        size="tiny"
      />
      <UiLoader
        size="big"
        speed="fast"
      />
      <UiLoader
        speed="fast"
      />
      <UiLoader
        speed="slow"
      />
      <UiLoader
        size="tiny"
        speed="slow"
      />
    </div>

    <h2>UiMessages</h2>
    <div class="messages">
      <div>
        <UiHeightTransition>
          <div
            v-if="!showMessage1"
          >
            <UiButton
              @click="showMessage1 = !showMessage1"
            >
              toggle m1
            </UiButton>
          </div>
        </UiHeightTransition>
        <UiHeightTransition stick-to="top">
          <UiMessage
            v-if="showMessage1"
            type="success"
            :closable="true"
            @close="showMessage1 = false"
          >
            <template #title>
              Success
            </template>
            message with details
          </UiMessage>
        </UiHeightTransition>
      </div>
      <UiHeightTransition>
        <UiMessage
          v-if="showMessage2"
          type="success"
          :closable="true"
          @close="showMessage2 = false"
        >
          message with details
        </UiMessage>
      </UiHeightTransition>
      <UiMessage>
        <template #title>
          Important information
        </template>
        info message
      </UiMessage>
      <UiMessage>
        info message
      </UiMessage>
      <UiMessage type="warning">
        <template #title>
          Warning
        </template>
        warning message
      </UiMessage>
      <UiMessage type="warning">
        warning message
      </UiMessage>
      <UiMessage type="error">
        <template #title>
          Error
        </template>
        error message
      </UiMessage>
      <UiMessage type="error">
        error message
      </UiMessage>
    </div>

    <h2>UiMultiselect</h2>
    <div class="buttons">
      <UiMultiselect
        v-model="multiselectValue"
        :options="selectOptions"
        placeholder="Choose options"
      >
        Multiselect label
      </UiMultiselect>
      <UiMultiselect
        v-model="multiselectValue"
        :options="selectOptions"
        :max="2"
        placeholder="Max 2 items"
      >
        With max
      </UiMultiselect>
    </div>

    <h2>UiRadios</h2>
    <UiRadio
      name="group1"
      value="radio1"
      v-model:modelValue="radioValue"
    >radio 1</UiRadio>
    <UiRadio
      name="group1"
      value="radio2"
      :disabled="radioValue === 'radio3'"
      v-model:modelValue="radioValue"
    >radio 2</UiRadio>
    <UiRadio
      class="accent"
      name="group1"
      value="radio3"
      v-model:modelValue="radioValue"
    >radio 3</UiRadio>

    <h2>UiSelect</h2>
    <div class="buttons">
      <UiSelect
        v-model="selectValue"
        :options="selectOptions"
        placeholder="Choose an option"
      >
        Select label
      </UiSelect>
      <UiSelect
        v-model="selectValue"
        :options="selectOptions"
        :disabled="true"
        placeholder="Disabled"
      >
        Disabled select
      </UiSelect>
    </div>

    <h2>UiSwitch</h2>
    <div class="buttons">
      <UiSwitch
        v-model="switch1"
      >switch control</UiSwitch>
      <UiSwitch
        v-model="switch2"
        :disabled="true"
      >switch control</UiSwitch>
    </div>
  </div>
  <RouterView />
</div>
</template>
