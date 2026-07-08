import { model, Schema } from 'mongoose'

export const PlaylistSchema = new Schema({
  createdAt: {
    immutable: true,
    type: Number,
    default: () => Date.now(),
  },
  pid: { type: String, required: true },
  name: { type: String, required: true },
  order: { type: Number, default: 0 },
  elements: { type: Schema.Types.Mixed, default: () => ([]) },
})

export const Playlist = model('playlists', PlaylistSchema)
