import { describe, it, expect, beforeEach } from 'vitest'
import { START_LOCATION, type RouteLocation } from 'vue-router'
import { RouteSlot } from '../route-slot.class'
import { RouteSlotState } from '../layout.model'
import { EAnimationType } from '@/controls/animations.model'
import {
  DefaultAnimationsBySlot,
  FadeAnimation,
  AnimationDefinitionsByName,
  DefaultAnimationInstance,
} from '@/controls/animations.consts'
import { stateToAnimationTypeMap } from '../layout.const'

function makeRoute(overrides: Partial<RouteLocation> = {}): RouteLocation {
  return {
    path: '/',
    name: 'home',
    matched: [],
    meta: {},
    params: {},
    query: {},
    hash: '',
    fullPath: '/',
    redirectedFrom: undefined,
    ...overrides,
  } as RouteLocation
}

function makeRouteWithSlot(slotName: string, overrides: Partial<RouteLocation> = {}): RouteLocation {
  return makeRoute({
    matched: [{ components: { [slotName]: {} } }] as any,
    ...overrides,
  })
}

describe('RouteSlot', () => {
  let slot: RouteSlot

  beforeEach(() => {
    slot = new RouteSlot('default')
  })

  describe('constructor', () => {
    it('initializes with correct defaults', () => {
      expect(slot.name).toBe('default')
      expect(slot.state).toBe(RouteSlotState.empty)
      expect(slot.animationDefinition).toBeNull()
    })
  })

  describe('hasSlot', () => {
    it('returns true when route has the slot component', () => {
      const route = makeRouteWithSlot('default')
      expect(slot.hasSlot(route)).toBe(true)
    })

    it('returns false when route does not have the slot', () => {
      const route = makeRoute({ matched: [{ components: { sidebar: {} } }] as any })
      expect(slot.hasSlot(route)).toBe(false)
    })

    it('returns false for empty matched array', () => {
      const route = makeRoute()
      expect(slot.hasSlot(route)).toBe(false)
    })

    it('returns true when any matched record has the slot', () => {
      const route = makeRoute({
        matched: [
          { components: { sidebar: {} } },
          { components: { default: {} } },
        ] as any,
      })
      expect(slot.hasSlot(route)).toBe(true)
    })
  })

  describe('animationInstance', () => {
    it('uses default animation when no definition set', () => {
      const instance = slot.animationInstance
      expect(instance.definition).toBe(DefaultAnimationInstance.definition)
    })

    it('maps state to correct animation type', () => {
      slot.state = RouteSlotState.appearing
      expect(slot.animationInstance.type).toBe(EAnimationType.appearing)

      slot.state = RouteSlotState.disappearing
      expect(slot.animationInstance.type).toBe(EAnimationType.disappearing)

      slot.state = RouteSlotState.changing
      expect(slot.animationInstance.type).toBe(EAnimationType.changing)
    })

    it('uses custom animation definition when set', () => {
      slot.animationDefinition = FadeAnimation
      expect(slot.animationInstance.definition).toBe(FadeAnimation)
    })
  })

  describe('routeChange', () => {
    describe('first load (from START_LOCATION)', () => {
      it('transitions to appearing when slot exists in target', () => {
        const to = makeRouteWithSlot('default')
        slot.routeChange(to, START_LOCATION as RouteLocation)

        expect(slot.state).toBe(RouteSlotState.appearing)
        expect(slot.animationDefinition).toBe(DefaultAnimationsBySlot['default'])
      })

      it('does not change state when slot missing from target', () => {
        const to = makeRoute()
        slot.routeChange(to, START_LOCATION as RouteLocation)

        expect(slot.state).toBe(RouteSlotState.empty)
      })

      it('uses animation from route meta if provided', () => {
        const to = makeRouteWithSlot('default', {
          meta: { animation: { default: { $default: 'slide-left' } } },
        })
        slot.routeChange(to, START_LOCATION as RouteLocation)

        expect(slot.animationDefinition).toBe(AnimationDefinitionsByName['slide-left'])
      })
    })

    describe('slot in both routes (changing)', () => {
      it('transitions to changing state', () => {
        const from = makeRouteWithSlot('default', { name: 'page-a' })
        const to = makeRouteWithSlot('default', { name: 'page-b' })

        slot.routeChange(to, from)

        expect(slot.state).toBe(RouteSlotState.changing)
      })

      it('uses slot default animation', () => {
        const from = makeRouteWithSlot('default', { name: 'page-a' })
        const to = makeRouteWithSlot('default', { name: 'page-b' })

        slot.routeChange(to, from)

        expect(slot.animationDefinition).toBe(DefaultAnimationsBySlot['default'])
      })

      it('uses from-name-specific animation from route meta', () => {
        const from = makeRouteWithSlot('default', { name: 'page-a' })
        const to = makeRouteWithSlot('default', {
          name: 'page-b',
          meta: { animation: { default: { 'page-a': 'slide-right' } } },
        })

        slot.routeChange(to, from)

        expect(slot.animationDefinition).toBe(AnimationDefinitionsByName['slide-right'])
      })

      it('uses $default meta animation when no from-specific animation', () => {
        const from = makeRouteWithSlot('default', { name: 'page-a' })
        const to = makeRouteWithSlot('default', {
          name: 'page-b',
          meta: { animation: { default: { $default: 'slide-up' } } },
        })

        slot.routeChange(to, from)

        expect(slot.animationDefinition).toBe(AnimationDefinitionsByName['slide-up'])
      })

      it('falls back to FadeAnimation when candidate is undefined', () => {
        const sidebarSlot = new RouteSlot('custom-slot')
        const from = makeRoute({ name: 'a', matched: [{ components: { 'custom-slot': {} } }] as any })
        const to = makeRoute({ name: 'b', matched: [{ components: { 'custom-slot': {} } }] as any })

        sidebarSlot.routeChange(to, from)

        // DefaultAnimationsBySlot doesn't have 'custom-slot', so candidate is undefined
        expect(sidebarSlot.animationDefinition).toBe(FadeAnimation)
      })
    })

    describe('slot appearing (not in from, in to)', () => {
      it('transitions to appearing', () => {
        const from = makeRoute({ name: 'no-slot' })
        const to = makeRouteWithSlot('default', { name: 'has-slot' })

        slot.routeChange(to, from)

        expect(slot.state).toBe(RouteSlotState.appearing)
        expect(slot.animationDefinition).toBe(DefaultAnimationsBySlot['default'])
      })
    })

    describe('slot disappearing (in from, not in to)', () => {
      it('transitions to disappearing', () => {
        const from = makeRouteWithSlot('default', { name: 'has-slot' })
        const to = makeRoute({ name: 'no-slot' })

        slot.routeChange(to, from)

        expect(slot.state).toBe(RouteSlotState.disappearing)
        expect(slot.animationDefinition).toBe(DefaultAnimationsBySlot['default'])
      })
    })

    describe('lastState tracking', () => {
      it('saves previous state on transition', () => {
        const to = makeRouteWithSlot('default')
        slot.routeChange(to, START_LOCATION as RouteLocation)

        expect(slot.lastState).toBe(RouteSlotState.empty) // was empty before appearing
      })
    })
  })

  describe('stateToAnimationTypeMap', () => {
    it('maps all states to animation types', () => {
      expect(stateToAnimationTypeMap[RouteSlotState.empty]).toBe(EAnimationType.disappearing)
      expect(stateToAnimationTypeMap[RouteSlotState.disappearing]).toBe(EAnimationType.disappearing)
      expect(stateToAnimationTypeMap[RouteSlotState.appearing]).toBe(EAnimationType.appearing)
      expect(stateToAnimationTypeMap[RouteSlotState.changing]).toBe(EAnimationType.changing)
      expect(stateToAnimationTypeMap[RouteSlotState.shown]).toBe(EAnimationType.changing)
    })
  })
})
