import { Schema, model, Document } from 'mongoose'

import { settings } from '@/settings'



export interface ICollection extends Document {
  name: string;
  count: number;
  createdAt?: string;
}

export const CollectionSchema = new Schema<ICollection>({
  name: String,
  count: Number,
}, {
  collection: [
    settings.dbPrefix,
    'Collections',
  ].join('_'),
  timestamps: true,
});

export default model<ICollection>('Collection', CollectionSchema)
