import { Model } from 'mongoose'

import { User } from './users.schema'
import { Permission } from './permissions.schema'
import { Role } from './roles.schema'
import { Message } from './messages.schema'
import { Setting } from './settings.schema'
import { ColorPreset } from './color-presets.schema'

export interface ModelCollectionMapping {
  name: string
  model: typeof Model,
}

export const models: ModelCollectionMapping[] = [
  {
    name: 'users',
    model: User,
  },
  {
    name: 'permissions',
    model: Permission,
  },
  {
    name: 'roles',
    model: Role,
  },
  {
    name: 'messages',
    model: Message,
  },
  {
    name: 'settings',
    model: Setting,
  },
  {
    name: 'color-presets',
    model: ColorPreset,
  },
]
