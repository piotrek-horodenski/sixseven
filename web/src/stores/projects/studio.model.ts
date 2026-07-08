export interface IVector3 {
  X: number
  Y: number
  Z: number
}

export interface IRotator {
  Pitch: number
  Roll: number
  Yaw: number
}

export interface IStudioPreset {
  _id: string
  pid: string
  cameraIndex: number
  name: string
  position: IVector3
  rotation: IRotator
  aperture: number
  createdAt: number
}

export interface IMask {
  active: boolean
  position: IVector3
  rotation: IRotator
  scale: IVector3
}

export interface IMasksPreset {
  _id: string
  pid: string
  name: string
  masks: IMask[]
  createdAt: number
}
