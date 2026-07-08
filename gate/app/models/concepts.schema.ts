import { model, Schema } from 'mongoose'

export const ConceptSchema = new Schema({
  createdAt: {
    immutable: true,
    type: Number,
    default: () => Date.now(),
  },
  name: { type: String, required: true, unique: true },
  description: { type: String, default: '' },
})

export const Concept = model('concepts', ConceptSchema)
