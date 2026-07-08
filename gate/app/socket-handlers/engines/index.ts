import { HandlerObject } from '..'

import { createEngineHandler, updateEngineHandler, deleteEngineHandler, wakeUpEngineHandler } from './engines.handler'
import { createClusterHandler, updateClusterHandler, deleteClusterHandler } from './clusters.handler'

export const engineHandlers: HandlerObject[] = [
  createEngineHandler,
  updateEngineHandler,
  deleteEngineHandler,
  wakeUpEngineHandler,
  createClusterHandler,
  updateClusterHandler,
  deleteClusterHandler,
]
