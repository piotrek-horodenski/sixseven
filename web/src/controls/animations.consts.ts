import {
  EAnimationHeightBehavior,
  EAnimationType,
  EAnimationWidthBehavior,
  EAnimationWrapperOverflow,
  ETransitionMode,
  type IAnimationDefinition,
  type IAnimationInstance,
} from './animations.model'

export const FadeAnimation: IAnimationDefinition = {
  name: 'fade',
  // Tryb symultaniczny (nie out-in): CSS `fade.scss` ustawia position:absolute na
  // obu stanach (enter-active i leave-active), czyli jest napisany pod nakładający
  // się cross-fade. Przy out-in nawigacja kliencka (typ `changing`) zacinała slot
  // `default`: faza leave kończyła się, ale wejście nowego widoku nie odpalało —
  // wrapper zostawał `--active` z zamrożoną wysokością i BEZ zamontowanego dziecka
  // (nowy content pojawiał się dopiero po F5, gdzie ścieżka to `appearing` bez leave).
  mode: ETransitionMode.default,
  duration: 500,
  wrapperOverflow: EAnimationWrapperOverflow.visible,
  heightBehavior: EAnimationHeightBehavior.default,
  widthBehavior: EAnimationWidthBehavior.default,
} as IAnimationDefinition

export const SlideLeftAnimation: IAnimationDefinition = {
  name: 'slide-left',
  mode: ETransitionMode.default,
  duration: 500,
  wrapperOverflow: EAnimationWrapperOverflow.visible,
  heightBehavior: EAnimationHeightBehavior.default,
  widthBehavior: EAnimationWidthBehavior.default,
} as IAnimationDefinition

export const SlideRightAnimation: IAnimationDefinition = {
  name: 'slide-right',
  mode: ETransitionMode.default,
  duration: 500,
  wrapperOverflow: EAnimationWrapperOverflow.visible,
  heightBehavior: EAnimationHeightBehavior.default,
  widthBehavior: EAnimationWidthBehavior.default,
} as IAnimationDefinition

export const SlideUpAnimation: IAnimationDefinition = {
  name: 'slide-up',
  mode: ETransitionMode.default,
  duration: 500,
  wrapperOverflow: EAnimationWrapperOverflow.hidden,
  heightBehavior: EAnimationHeightBehavior.default,
  widthBehavior: EAnimationWidthBehavior.default,
} as IAnimationDefinition

export const SlideDownAnimation: IAnimationDefinition = {
  name: 'slide-down',
  mode: ETransitionMode.default,
  duration: 500,
  wrapperOverflow: EAnimationWrapperOverflow.hidden,
  heightBehavior: EAnimationHeightBehavior.default,
  widthBehavior: EAnimationWidthBehavior.default,
} as IAnimationDefinition

export const OnlyLeftAnimation: IAnimationDefinition = {
  name: 'only-left',
  mode: ETransitionMode.default,
  duration: 500,
  wrapperOverflow: EAnimationWrapperOverflow.visible,
  heightBehavior: EAnimationHeightBehavior.default,
  widthBehavior: EAnimationWidthBehavior.default,
} as IAnimationDefinition

export const OnlyRightAnimation: IAnimationDefinition = {
  name: 'only-right',
  mode: ETransitionMode.default,
  duration: 500,
  wrapperOverflow: EAnimationWrapperOverflow.visible,
  heightBehavior: EAnimationHeightBehavior.default,
  widthBehavior: EAnimationWidthBehavior.default,
} as IAnimationDefinition

export const OnlyUpAnimation: IAnimationDefinition = {
  name: 'only-up',
  mode: ETransitionMode.default,
  duration: 500,
  wrapperOverflow: EAnimationWrapperOverflow.hidden,
  heightBehavior: EAnimationHeightBehavior.default,
  widthBehavior: EAnimationWidthBehavior.default,
} as IAnimationDefinition

export const OnlyDownAnimation: IAnimationDefinition = {
  name: 'only-down',
  mode: ETransitionMode.default,
  duration: 500,
  wrapperOverflow: EAnimationWrapperOverflow.hidden,
  heightBehavior: EAnimationHeightBehavior.default,
  widthBehavior: EAnimationWidthBehavior.default,
} as IAnimationDefinition

export const Roll3dUpAnimation: IAnimationDefinition = {
  name: 'roll3d-up',
  mode: ETransitionMode.default,
  duration: 500,
  wrapperOverflow: EAnimationWrapperOverflow.visible,
  heightBehavior: EAnimationHeightBehavior.default,
  widthBehavior: EAnimationWidthBehavior.default,
} as IAnimationDefinition

export const Roll3dDownAnimation: IAnimationDefinition = {
  name: 'roll3d-down',
  mode: ETransitionMode.default,
  duration: 500,
  wrapperOverflow: EAnimationWrapperOverflow.visible,
  heightBehavior: EAnimationHeightBehavior.default,
  widthBehavior: EAnimationWidthBehavior.default,
} as IAnimationDefinition

export const Roll3dLeftAnimation: IAnimationDefinition = {
  name: 'roll3d-left',
  mode: ETransitionMode.default,
  duration: 500,
  wrapperOverflow: EAnimationWrapperOverflow.visible,
  heightBehavior: EAnimationHeightBehavior.default,
  widthBehavior: EAnimationWidthBehavior.default,
} as IAnimationDefinition

export const Roll3dRightAnimation: IAnimationDefinition = {
  name: 'roll3d-right',
  mode: ETransitionMode.default,
  duration: 500,
  wrapperOverflow: EAnimationWrapperOverflow.visible,
  heightBehavior: EAnimationHeightBehavior.default,
  widthBehavior: EAnimationWidthBehavior.default,
} as IAnimationDefinition

export const DefaultAnimationInstance: IAnimationInstance = {
  definition: FadeAnimation,
  type: EAnimationType.changing,
}

export const DefaultAnimationsBySlot: Record<string, IAnimationDefinition> = {
  intro: OnlyLeftAnimation,
  controls: OnlyLeftAnimation,
  messages: OnlyUpAnimation,
  default: FadeAnimation,
  sidebar: OnlyLeftAnimation,
  aside: OnlyRightAnimation,
}

export const AnimationDefinitionsByName: Record<string, IAnimationDefinition> = {
  fade: FadeAnimation,
  'slide-left': SlideLeftAnimation,
  'slide-right': SlideRightAnimation,
  'slide-up': SlideUpAnimation,
  'slide-down': SlideDownAnimation,
  'only-left': OnlyLeftAnimation,
  'only-right': OnlyRightAnimation,
  'only-up': OnlyUpAnimation,
  'only-down': OnlyDownAnimation,
  'roll3d-up': Roll3dUpAnimation,
  'roll3d-down': Roll3dDownAnimation,
  'roll3d-left': Roll3dLeftAnimation,
  'roll3d-right': Roll3dRightAnimation,
}
