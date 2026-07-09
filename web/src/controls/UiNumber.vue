<script setup lang="ts">

import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
  type Ref
} from 'vue'
import { useKeyModifier } from '@vueuse/core'
import { useMousePressed } from '@vueuse/core'



const mouseSpeedMin = 400
const mouseSpeedMax = 10
const mouseAcceleRatio = .8
const smallStepRatioConst = .1
const bigStepRatioConst = 50

const emit = defineEmits([
  'update:modelValue',
  'focus',
  'blur',
])

const props = withDefaults(defineProps<{
  modelValue: number
  small?: boolean
  step?: number
  classes?: string
  precision?: number
  min?: number | null
  max?: number | null
  integer?: boolean
  placeholder?: string
  smallStepRatio?: number
  bigStepRatio?: number
  disabled?: boolean
  liveUpdate?: boolean
}>(), {
  small: false,
  step: 1,
  classes: '',
  precision: 0,
  min: null,
  max: null,
  integer: false,
  placeholder: 'input number',
  smallStepRatio: smallStepRatioConst,
  bigStepRatio: bigStepRatioConst,
  disabled: false,
  liveUpdate: false,
})

const input = ref(null)
const caretUp = ref(null)
const caretDown = ref(null)
const val: Ref<string | number> = ref(0)
const parsed: Ref<number> = ref(0)
const mousePressing = ref(false)
const mouseTimeout = ref(0)
const mouseSpeed = ref(mouseSpeedMin)
const caretColor = ref('')
const dragx = ref(0)
const dragv = ref(0)
const lastDragStep = ref(0)
const old = ref(0)
const oldKeyboard = ref('')

const ctrlKey = useKeyModifier('Control')
const shiftKey = useKeyModifier('Shift')

const { pressed: caretUpPressed } = useMousePressed({ target: caretUp })
const { pressed: caretDownPressed } = useMousePressed({ target: caretDown })

const smallStep = computed(() => {
  if (props.integer) {
    return 1
  }
  return Math.max(
    props.step * props.smallStepRatio,
    Math.pow(10, -props.precision)
  )
})

const bigStep = computed(() => {
  return props.step * props.bigStepRatio
})

const currentStep = computed(() => {
  return shiftKey.value ?
    bigStep.value : ctrlKey.value ?
      smallStep.value * props.smallStepRatio : props.step
})

const currentMouseStepRatio = computed(() => {
  return shiftKey.value ? 
    bigStep.value : ctrlKey.value ? 
    smallStep.value * props.smallStepRatio : props.step
})

function increase(step: number) {
  let next = parsed.value
  if (null === next) {
    next = props.min || 0
  } else {
    next = next + step
    if (null !== props.max) {
      next = Math.min(next, props.max)
    }
  }
  parse(next, false)
}

function decrease(step: number) {
  let next = parsed.value
  if (null === next) {
    next = props.max || 0
  } else {
    next = next - step
    if (null !== props.min) {
      next = Math.max(next, props.min)
    }
  }
  parse(next, false)
}

function mouseStart(func: (step: number) => void) {
  if (props.disabled || !input.value) {
    return
  }

  (input.value as HTMLInputElement).focus()
  clearTimeout(mouseTimeout.value)

  func(currentStep.value)

  mouseTimeout.value = setTimeout(() => {
    mouseSpeed.value = Math.max(
      mouseSpeedMax,
      mouseSpeed.value * mouseAcceleRatio
    )

    mouseStart(func)
  }, mouseSpeed.value)
}

function mouseStop() {
  if (mousePressing.value) {
    return
  }
  clearTimeout(mouseTimeout.value)
  mouseSpeed.value = mouseSpeedMin
}

function emitChange(value: number | null) {
  let candidate: string | number

  if (null !== value) {
    const power = Math.pow(10, props.precision)
    candidate = Math.round(value * power) / power
    parsed.value = candidate
  } else {
    candidate = 0
    if (null !== props.max) {
      candidate = Math.min(candidate, props.max)
    }
    if (null !== props.min) {
      candidate = Math.max(candidate, props.min)
    }
    parsed.value = candidate
  }

  if (!props.integer) {
    let str = '' + candidate
    const dotIndex = str.indexOf('.')
    let sum = props.precision - (str.length - dotIndex - 1)
    
    if (dotIndex < 0) {
      sum = props.precision
    }
    
    if (sum == props.precision) {
      str += '.'
    }
    if (sum > 0) {
      Array.from(Array(sum)).forEach(() => {
        str += '0'
      })
    }
    if (str[str.length - 1] === '.') {
      candidate = str.substring(0, str.length - 1)
    } else {
      candidate = str
    }
  } else {
    candidate = '' + candidate
  }

  val.value = candidate

  if (
    parsed.value != old.value ||
    (input.value && (input.value as HTMLInputElement).value != val.value + '')
  ) {
    old.value = parsed.value
    emit('update:modelValue', parsed.value)
  }
}

function parse(value: string | number, keyboardInput = true) {
  let candidate = Number((value + '').replace(',', '.'))

  if (isNaN(candidate)) {
    return emitChange(null)
  }
  if (props.integer) {
    candidate = Math.round(candidate)
  }
  if (keyboardInput) {
    if (null !== props.max) {
      candidate = Math.min(candidate, props.max)
    }
    if (null !== props.min) {
      candidate = Math.max(candidate, props.min)
    }
  }

  emitChange(candidate)

  return true
}

function focus(event: FocusEvent) {
  if (props.disabled) {
    return
  }
  emit('focus', event)
  if (!input.value) {
    return
  }

  const inputRef = input.value as HTMLInputElement
  const val = inputRef.value || ''
  inputRef.setSelectionRange(0, val.length)
}

function blur(event: FocusEvent) {
  if (!input.value) {
    return
  }
  parse((input.value as HTMLInputElement).value)
  setTimeout(() => {
    emit('blur', event)
  }, 10)
}

function onKeyDown($event: KeyboardEvent) {
  if (props.disabled) {
    return
  }

  if (!input.value) {
    return
  }

  const inputRef = input.value as HTMLInputElement
  oldKeyboard.value = inputRef.value

  // arrow up
  if ($event.key === 'ArrowUp') {
    increase(currentStep.value)
    $event.preventDefault()
    return
  }

  // arrow down
  if ($event.key === 'ArrowDown') {
    decrease(currentStep.value)
    $event.preventDefault()
    return
  }

  if ([
    '.',
    ',',
  ].includes($event.key)) {
    if (props.integer) {
      $event.preventDefault()
      return
    }
  }

  // if (!(
  //   // backspace, delete, tab, escape, enter, 
  //   // dot (decimal), dot, end, home, left, right, minus (+num-pad minus)
  //   0 <= [46, 8, 9, 27, 13, 110, 188, 190, 35, 36, 37, 39, 189, 109].indexOf($event.keyCode) ||
  //   // ctrl/cmd + A,C,R,V,X
  //   (0 <= [65, 67, 82, 86, 88].indexOf($event.keyCode) && ($event.ctrlKey || $event.metaKey))
  // )) {
  //   if (
  //     ($event.shiftKey || ($event.keyCode < 48 || $event.keyCode > 57)) &&
  //     ($event.keyCode < 96 || $event.keyCode > 105) &&
  //     ($event.keyCode !== 69)
  //   ) {
  //     $event.preventDefault()
  //   }
  // }
  
  if ($event.key === 'Enter') {
    nextTick(() => {
      parse(inputRef.value)

      nextTick(() => {
        inputRef.select()
      })
    })
  } else if (props.liveUpdate) {
    nextTick(() => {
      parse(inputRef.value, true)
    })
  }
}

function onMouseDown(event: MouseEvent) {
  if (props.disabled || !input.value) {
    return
  }
  mousePressing.value = true
  dragx.value = event.x
  dragv.value = parsed.value

  lastDragStep.value = currentMouseStepRatio.value
  event.preventDefault()

  const inputRef = input.value as HTMLInputElement
  inputRef.focus()
}

function onMouseDrag(event: MouseEvent) {
  if (props.disabled || !mousePressing.value) {
    return
  }
  if (lastDragStep.value !== currentMouseStepRatio.value) {
    dragx.value = event.x
    dragv.value = parsed.value
    lastDragStep.value = currentMouseStepRatio.value
  }

  let newValue = parsed.value

  newValue = dragv.value - (dragx.value - event.x) / 10 * currentMouseStepRatio.value

  if (props.integer) {
    newValue = Math.round(newValue)
  }

  if (null !== props.max) {
    newValue = Math.min(
      newValue,
      props.max
    )
  }
  if (null !== props.min) {
    newValue = Math.max(
      newValue,
      props.min
    )
  }

  parse(newValue)
}

function onMouseUp() {
  if (props.disabled || !input.value || !mousePressing.value) {
    return
  }
  mousePressing.value = false
  const inputRef = input.value as HTMLInputElement
  inputRef.setSelectionRange(0, inputRef.value.length)
}

watch(() => props.modelValue, (value) => {
    parse(value)
  }
)

watch(caretDownPressed, (value) => {
  if (value) {
    mouseStart(decrease)
  } else {
    mouseStop()
  }
})

watch(caretUpPressed, (value) => {
  if (value) {
    mouseStart(increase)
  } else {
    mouseStop()
  }
})

onMounted(() => {
  parse(props.modelValue, false)

  if (input.value) {
    caretColor.value = getComputedStyle(input.value as HTMLInputElement, null)
      .getPropertyValue('color')
  }

  window.addEventListener('mousemove', onMouseDrag)
  window.addEventListener('mouseup', onMouseUp)
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onMouseDrag)
  window.removeEventListener('mouseup', onMouseUp)
})

</script>
<template>
<label class="ui-number">
  <div class="ui-number__label">
    <slot />
  </div>
  <span class="ui-number__content">
    <input
      :value="val"
      class="ui-number__input"
      ref="input"
      type="text"
      @focus="focus"
      @blur="blur"
      @keydown="onKeyDown"
      @mousedown="onMouseDown"
    />
    <span class="carets">
      <span
        ref="caretUp"
        class="ui-number__caret-up"
      >
        <fa
          icon="caret-up"
          :style="{color: caretColor}"
        />
      </span>
      <span
        ref="caretDown"
        class="ui-number__caret-down"
      >
        <fa
          icon="caret-down"
          :style="{color: caretColor}"
        />
      </span>
    </span>
  </span>
</label>
</template>
