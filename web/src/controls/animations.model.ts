
export enum ETransitionMode {
  default = 'default',
  outIn = 'out-in',
  inOut = 'in-out',
}

export enum EAnimationWrapperOverflow {
  visible = 'visible',
  hidden = 'hidden',
}

export enum EAnimationType {
  appearing = 'appearing',
  disappearing = 'disappearing',
  changing = 'changing',
}

export enum EAnimationHeightBehavior {
  default = 'default',
  preserve = 'preserve',
}

export enum EAnimationWidthBehavior {
  default = 'default',
  adjust = 'adjust',
}

export interface IAnimationDefinition {
  name: string
  mode: ETransitionMode
  duration: number
  wrapperOverflow: EAnimationWrapperOverflow
  heightBehavior: EAnimationHeightBehavior
  widthBehavior: EAnimationWidthBehavior
}

export interface IAnimationInstance {
  definition: IAnimationDefinition
  type: EAnimationType
}
