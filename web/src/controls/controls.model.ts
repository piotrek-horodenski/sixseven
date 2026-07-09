import type { Component } from 'vue'

export interface IControlsMap {
  [name: string]: Component
}

export enum EMessageType {
  success = 'success',
  info = 'info',
  warning = 'warning',
  error = 'error',
}

export enum EPopupSize {
  thin = 'thin',
  regular = 'regular',
  wide = 'wide',
}

export enum ELoaderSize {
  tiny = 'tiny',
  regular = 'regular',
  big = 'big',
}

export enum ELoaderSpeed {
  slow = 'slow',
  regular = 'regular',
  fast = 'fast',
}

export enum EStickTo {
  top = 'top',
  bottom = 'bottom',
}

export interface ISelectOption<T = string | number> {
  label: string
  value: T
  disabled?: boolean
}
