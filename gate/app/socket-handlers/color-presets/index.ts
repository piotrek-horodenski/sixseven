import { HandlerObject } from '..'

import { createColorPresetHandler, deleteColorPresetHandler } from './color-presets.handler'

export const colorPresetHandlers: HandlerObject[] = [
  createColorPresetHandler,
  deleteColorPresetHandler,
]
