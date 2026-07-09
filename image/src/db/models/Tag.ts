import { Schema, model, Document } from 'mongoose'

import { settings } from '@/settings'



export interface ITag extends Document {
  name: string;
  count: number;
  createdAt?: string;
}

export const TagSchema = new Schema<ITag>({
  name: String,
  count: Number,
  createdAt: Date,
}, {
  collection: [
    settings.dbPrefix,
    'Tags',
  ].join('_'),
  timestamps: true,
});

export default model<ITag>('Tag', TagSchema)
