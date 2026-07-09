import { EAnimationType } from '@/controls/animations.model'
import { RouteSlotState } from './layout.model'

export const stateToAnimationTypeMap = {
  [RouteSlotState.empty]: EAnimationType.disappearing,
  [RouteSlotState.disappearing]: EAnimationType.disappearing,
  [RouteSlotState.appearing]: EAnimationType.appearing,
  [RouteSlotState.changing]: EAnimationType.changing,
  [RouteSlotState.shown]: EAnimationType.changing,
}