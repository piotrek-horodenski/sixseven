import { Model } from 'mongoose'

import { User } from './users.schema'
import { Permission } from './permissions.schema'
import { Role } from './roles.schema'
import { Message } from './messages.schema'
import { Setting } from './settings.schema'
import { Engine } from './engines.schema'
import { Cluster } from './clusters.schema'
import { Concept } from './concepts.schema'
import { Project } from './projects.schema'
import { Board } from './boards.schema'
import { Playlist } from './playlists.schema'
import { Dataset, DatasetVersion, DatasetItem } from './datasets.schema'
import { StudioPreset, MasksPreset } from './studio-presets.schema'
import { Environment } from './environment.schema'
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
    name: 'engines',
    model: Engine,
  },
  {
    name: 'clusters',
    model: Cluster,
  },
  {
    name: 'concepts',
    model: Concept,
  },
  {
    name: 'projects',
    model: Project,
  },
  {
    name: 'boards',
    model: Board,
  },
  {
    name: 'playlists',
    model: Playlist,
  },
  {
    name: 'datasets',
    model: Dataset,
  },
  {
    name: 'dataset-versions',
    model: DatasetVersion,
  },
  {
    name: 'dataset-items',
    model: DatasetItem,
  },
  {
    name: 'studio-presets',
    model: StudioPreset,
  },
  {
    name: 'masks-presets',
    model: MasksPreset,
  },
  {
    name: 'environments',
    model: Environment,
  },
  {
    name: 'color-presets',
    model: ColorPreset,
  },
]
