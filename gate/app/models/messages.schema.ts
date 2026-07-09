import { model, Schema } from 'mongoose'

export const MessageSchema = new Schema({
  createdAt: {
    immutable: true,
    type: Number,
    default: () => Date.now(),
  },
  signedBy: String,
  userId: { type: String, default: null },
  text: String,
  dest: { type: String, default: null },
})

export const Message = model('messages', MessageSchema)
