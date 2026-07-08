import { model, Schema } from 'mongoose'

export const BoardSchema = new Schema({
  createdAt: {
    immutable: true,
    type: Number,
    default: () => Date.now(),
  },
  pid: { type: String, required: true },
  name: { type: String, required: true },
  boardId: { type: String, required: true },
  panelId: { type: String, default: '' },
  root: { type: Boolean, default: false },
  default: { type: Boolean, default: false },
  public: { type: Boolean, default: false },
  preventAutoLoad: { type: Boolean, default: false },
  elements: { type: Schema.Types.Mixed, default: () => ([]) },
})

export const Board = model('boards', BoardSchema)
