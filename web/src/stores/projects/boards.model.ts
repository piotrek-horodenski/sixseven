export interface IBoard {
  _id: string
  pid: string
  name: string
  boardId: string
  panelId: string
  root: boolean
  default: boolean
  public: boolean
  preventAutoLoad: boolean
  elements: any[]
  createdAt: number
}
