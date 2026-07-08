export interface IDataset {
  _id: string
  pid: string
  label: string
  name: string
  datasetId: string
  versionId: string
  currentVersionId: string
  parseOptions: Record<string, any>
  createdAt: number
}

export interface IDatasetVersion {
  _id: string
  pid: string
  datasetId: string
  versionId: string
  stats: Record<string, any>
  changed: number
  createdAt: number
}

export interface IDatasetItem {
  _id: string
  pid: string
  datasetId: string
  versionId: string
  category: string
  originalName: string
  options: any[]
}
