export interface IPlaylistElement {
  instanceId: string
  slot: string
}

export interface IPlaylist {
  _id: string
  pid: string
  name: string
  order: number
  elements: IPlaylistElement[]
  createdAt: number
}
