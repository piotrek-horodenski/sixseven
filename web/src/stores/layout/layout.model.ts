
export enum RouteSlotState {
  empty = 'empty',
  appearing = 'appearing',
  disappearing = 'disappearing',
  changing = 'changing',
  shown = 'shown',
}

export interface IRouteSlot {
  name: string
  state: RouteSlotState
}

export enum ETheme {
  light = 'light',
  dark = 'dark',
}

export enum EMenuType {
  horizontal = 'horizontal',
  vertical = 'vertical',
  none = 'none',
}

export enum EMenuVariant {
  hidden = 'hidden',
  default = 'default',
  expanded = 'expanded',
}
