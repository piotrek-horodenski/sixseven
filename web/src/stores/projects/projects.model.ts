export interface IProject {
  _id: string
  name: string
  displayName: string
  map: string
  source: string
  type: 'standalone' | 'cluster'
  env: string
  devEngine: string
  concept: string
  cameras: string[]
  productionReady: boolean
  locked: boolean
  useStandalone: boolean
  useBatch: boolean
  globalAdjustments: Record<string, any>
  virtualSet: Record<string, any>
  createdAt: number
}
