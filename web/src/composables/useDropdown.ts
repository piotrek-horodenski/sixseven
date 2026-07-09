import { ref, computed, watch, nextTick, type Ref, type CSSProperties } from 'vue'
import { onClickOutside } from '@vueuse/core'

export type DropdownPlacement = 'below' | 'above' | 'aside'

interface DropdownPosition {
  placement: DropdownPlacement
  top?: string
  bottom?: string
  left?: string
  right?: string
  maxHeight?: string
}

export function useDropdown(options: {
  containerRef: Ref<HTMLElement | null>
  triggerRef: Ref<HTMLElement | null>
  dropdownRef: Ref<HTMLElement | null>
  optionCount: Ref<number>
  onSelect: (index: number) => void
  onClose?: () => void
  closeOnSelect?: boolean
}) {
  const { containerRef, triggerRef, dropdownRef, optionCount, onSelect, onClose, closeOnSelect = true } = options

  const isOpen = ref(false)
  const highlightedIndex = ref(-1)
  const positioned = ref(false)
  const position = ref<DropdownPosition>({ placement: 'below' })

  const placement = computed(() => position.value.placement)

  const dropdownStyle = computed<CSSProperties>(() => {
    if (!isOpen.value) return {}

    const pos = position.value
    const style: CSSProperties = {}

    if (!positioned.value) {
      style.visibility = 'hidden'
    }

    if (pos.placement === 'aside') {
      style.top = pos.top ?? '0'
      style.left = pos.left ?? 'auto'
      style.right = pos.right ?? 'auto'
    } else if (pos.placement === 'above') {
      style.bottom = pos.bottom ?? `calc(100% + 2px)`
      style.top = 'auto'
      style.left = '0'
      style.right = '0'
    } else {
      style.top = pos.top ?? `calc(100% + 2px)`
      style.bottom = 'auto'
      style.left = '0'
      style.right = '0'
    }

    if (pos.maxHeight) {
      style.maxHeight = pos.maxHeight
    }

    return style
  })

  onClickOutside(containerRef, () => {
    if (isOpen.value) close()
  })

  function calculatePosition(): DropdownPosition {
    const trigger = triggerRef.value
    const dropdown = dropdownRef.value
    if (!trigger || !dropdown) return { placement: 'below', top: 'calc(100% + 2px)' }

    const triggerRect = trigger.getBoundingClientRect()
    const dropdownHeight = dropdown.scrollHeight
    const dropdownWidth = dropdown.scrollWidth
    const viewportHeight = window.innerHeight
    const viewportWidth = window.innerWidth
    const gap = 2

    const spaceBelow = viewportHeight - triggerRect.bottom - gap
    const spaceAbove = triggerRect.top - gap

    // prefer below when there's enough room
    if (spaceBelow >= dropdownHeight) {
      return { placement: 'below', top: `calc(100% + ${gap}px)` }
    }

    // prefer above when there's enough room
    if (spaceAbove >= dropdownHeight) {
      return { placement: 'above', bottom: `calc(100% + ${gap}px)` }
    }

    // neither side fits fully — pick the one with more space, constrain maxHeight
    if (spaceAbove > spaceBelow) {
      return {
        placement: 'above',
        bottom: `calc(100% + ${gap}px)`,
        maxHeight: `${spaceAbove}px`,
      }
    }

    // more space below, but not enough — check if aside would work better
    if (spaceBelow < 120) {
      const spaceRight = viewportWidth - triggerRect.right - gap
      const spaceLeft = triggerRect.left - gap
      const asideMaxHeight = Math.min(viewportHeight - gap * 2, 16 * 14)

      if (spaceRight >= dropdownWidth) {
        return {
          placement: 'aside',
          top: '0',
          left: `calc(100% + ${gap}px)`,
          right: 'auto',
          maxHeight: `${asideMaxHeight}px`,
        }
      }
      if (spaceLeft >= dropdownWidth) {
        return {
          placement: 'aside',
          top: '0',
          right: `calc(100% + ${gap}px)`,
          left: 'auto',
          maxHeight: `${asideMaxHeight}px`,
        }
      }
    }

    // fallback: below with constrained height
    return {
      placement: 'below',
      top: `calc(100% + ${gap}px)`,
      maxHeight: `${spaceBelow}px`,
    }
  }

  function open() {
    if (isOpen.value) return
    positioned.value = false
    isOpen.value = true
    highlightedIndex.value = -1
    nextTick(() => {
      position.value = calculatePosition()
      positioned.value = true
    })
  }

  function close() {
    if (!isOpen.value) return
    isOpen.value = false
    highlightedIndex.value = -1
    positioned.value = false
    position.value = { placement: 'below' }
    onClose?.()
  }

  function toggle() {
    isOpen.value ? close() : open()
  }

  function scrollToHighlighted() {
    nextTick(() => {
      const container = containerRef.value
      if (!container) return
      const option = container.querySelector(`[data-dropdown-index="${highlightedIndex.value}"]`) as HTMLElement | null
      option?.scrollIntoView({ block: 'nearest' })
    })
  }

  function moveHighlight(delta: number) {
    const count = optionCount.value
    if (count === 0) return

    if (highlightedIndex.value === -1) {
      highlightedIndex.value = delta > 0 ? 0 : count - 1
    } else {
      highlightedIndex.value = (highlightedIndex.value + delta + count) % count
    }
    scrollToHighlighted()
  }

  function handleKeydown(event: KeyboardEvent) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        if (!isOpen.value) open()
        else moveHighlight(1)
        break

      case 'ArrowUp':
        event.preventDefault()
        if (!isOpen.value) open()
        else moveHighlight(-1)
        break

      case 'Home':
        if (isOpen.value) {
          event.preventDefault()
          highlightedIndex.value = 0
          scrollToHighlighted()
        }
        break

      case 'End':
        if (isOpen.value) {
          event.preventDefault()
          highlightedIndex.value = optionCount.value - 1
          scrollToHighlighted()
        }
        break

      case 'Enter':
        event.preventDefault()
        if (isOpen.value && highlightedIndex.value >= 0) {
          onSelect(highlightedIndex.value)
          if (closeOnSelect) close()
        } else if (!isOpen.value) {
          open()
        }
        break

      case 'Escape':
        if (isOpen.value) {
          event.preventDefault()
          close()
          triggerRef.value?.focus()
        }
        break

      case 'Tab':
        if (isOpen.value) close()
        break
    }
  }

  watch(optionCount, (count) => {
    if (highlightedIndex.value >= count) {
      highlightedIndex.value = count - 1
    }
    if (isOpen.value) {
      nextTick(() => {
        position.value = calculatePosition()
      })
    }
  })

  return {
    isOpen,
    highlightedIndex,
    placement,
    dropdownStyle,
    open,
    close,
    toggle,
    handleKeydown,
  }
}
