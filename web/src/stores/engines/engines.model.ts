export const ENGINE_STATUS_NEW = 0
export const ENGINE_STATUS_ACTIVE = 1
export const ENGINE_STATUS_INACTIVE = 2

export const ENGINE_INFO_STATUSES = [
  'Ok', 'Busy', 'Idle', 'Deploying', 'Starting',
  'Unknown', 'MultipleRunning', 'NotResponding', 'Died',
] as const

export type EngineInfoStatus = typeof ENGINE_INFO_STATUSES[number]

export interface IEngineInfo {
  status: EngineInfoStatus | string
  project?: {
    id: string
  }
}

export interface IEngineError {
  _id: string
  engineId: string
  timestamp: number
  data: string
}

export interface IEngine {
  _id: string
  alias: string
  address: string
  port: number
  rePort: number
  cameraNumber: number
  status: number
  since: number
  lastAttempt: number
  assignedProject: string
  assignedProjectId: string
  initialized: boolean
  locked: boolean
  info?: IEngineInfo
  errorCount?: number
  logs?: { log: string }
  loadingLogs?: boolean
}

export interface ICluster {
  _id: string
  alias: string
  engines: string[]
}
