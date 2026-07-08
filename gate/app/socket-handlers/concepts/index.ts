import { HandlerObject } from '..'

import { createConceptHandler, updateConceptHandler, deleteConceptHandler } from './concepts.handler'

export const conceptHandlers: HandlerObject[] = [
  createConceptHandler,
  updateConceptHandler,
  deleteConceptHandler,
]
