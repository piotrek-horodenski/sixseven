export interface IEnvironmentItem {
  propertyID: string
  preset: string
  [key: string]: any
}

export interface IEnvironment {
  _id: string
  pid: string
  id: string
  items: IEnvironmentItem[]
}
