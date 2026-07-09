import {
  START_LOCATION,
  type RouteLocation,
} from 'vue-router'

import {
  RouteSlotState,
  type IRouteSlot,
} from './layout.model'
import {
  EAnimationType,
  type IAnimationDefinition
} from '@/controls/animations.model'
import {
  AnimationDefinitionsByName,
  DefaultAnimationInstance,
  DefaultAnimationsBySlot,
  FadeAnimation,
} from '@/controls/animations.consts'
import { stateToAnimationTypeMap } from './layout.const'



export class RouteSlot implements IRouteSlot {
  public name: string
  public state: RouteSlotState
  public animationDefinition: IAnimationDefinition | null
  lastState: RouteSlotState = RouteSlotState.empty

  constructor(name: string) {
    this.name = name
    this.state = RouteSlotState.empty
    this.animationDefinition = null
  }

  get animationInstance() {
    const type = stateToAnimationTypeMap[this.state]

    return {
      definition: this.animationDefinition || DefaultAnimationInstance.definition,
      type,
    }
  }

  hasSlot(location: RouteLocation) {
    return location.matched.some(record =>
      record.components && record.components[this.name]
    )
  }

  public routeChange(to: RouteLocation, from: RouteLocation) {
    if (
      START_LOCATION === from &&
      this.hasSlot(to)
    ) {
      let candidate = DefaultAnimationsBySlot[this.name]

      if (to.meta.animation) {
        const meta = to.meta.animation as Record<string, Record<string, string>>

        if (meta[this.name] && meta[this.name].$default) {
          candidate = AnimationDefinitionsByName[meta[this.name].$default]
        }
      }

      this.animationDefinition = candidate
      this.lastState = this.state
      this.state = RouteSlotState.appearing
    } else if (this.hasSlot(to)) {
      if (this.hasSlot(from)) {
        this.lastState = this.state
        this.state = RouteSlotState.changing

        let candidate = DefaultAnimationsBySlot[this.name]

        if (to.meta.animation) {
          const meta = to.meta.animation as Record<string, Record<string, string>>

          if (
            from &&
            from.name &&
            meta[this.name] &&
            meta[this.name][from.name as string]
          ) {
            const animationName = meta[this.name][from.name as string]
            candidate = AnimationDefinitionsByName[animationName]
          } else if (
            meta[this.name] &&
            meta[this.name].$default
          ) {
            candidate = AnimationDefinitionsByName[meta[this.name].$default]
          }
        }

        if (!candidate) {
          candidate = FadeAnimation
        }

        this.animationDefinition = candidate
      } else {
        let candidate = DefaultAnimationsBySlot[this.name]

        if (to.meta.animation) {
          const meta = to.meta.animation as Record<string, Record<string, string>>

          if (meta[this.name] && meta[this.name].$default) {
            candidate = AnimationDefinitionsByName[meta[this.name].$default]
          }
        }
      
        this.animationDefinition = candidate
        this.lastState = this.state
        this.state = RouteSlotState.appearing
      }
    } else if (this.hasSlot(from)) {
      this.animationDefinition = DefaultAnimationsBySlot[this.name]
      this.lastState = this.state
      this.state = RouteSlotState.disappearing
    }
  }
}
