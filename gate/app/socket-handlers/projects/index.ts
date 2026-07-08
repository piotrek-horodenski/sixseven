import { HandlerObject } from '..'

import {
  createProjectHandler,
  updateProjectHandler,
  deleteProjectHandler,
  assignConceptHandler,
  lockProjectHandler,
  unlockProjectHandler,
} from './projects.handler'

import {
  createBoardHandler,
  updateBoardHandler,
  deleteBoardHandler,
} from './boards.handler'

import {
  createPlaylistHandler,
  updatePlaylistHandler,
  deletePlaylistHandler,
} from './playlists.handler'

import {
  createDatasetHandler,
  updateDatasetHandler,
  deleteDatasetHandler,
} from './datasets.handler'

import {
  createStudioPresetHandler,
  deleteStudioPresetHandler,
  createMasksPresetHandler,
  deleteMasksPresetHandler,
} from './studio.handler'

import {
  saveEnvironmentHandler,
  deleteEnvironmentHandler,
} from './environment.handler'

import {
  loadProjectHandler,
  unloadProjectHandler,
  syncProjectHandler,
  resetProjectHandler,
  loadDefsHandler,
} from './lifecycle.handler'

export const projectHandlers: HandlerObject[] = [
  createProjectHandler,
  updateProjectHandler,
  deleteProjectHandler,
  assignConceptHandler,
  lockProjectHandler,
  unlockProjectHandler,
  createBoardHandler,
  updateBoardHandler,
  deleteBoardHandler,
  createPlaylistHandler,
  updatePlaylistHandler,
  deletePlaylistHandler,
  createDatasetHandler,
  updateDatasetHandler,
  deleteDatasetHandler,
  createStudioPresetHandler,
  deleteStudioPresetHandler,
  createMasksPresetHandler,
  deleteMasksPresetHandler,
  saveEnvironmentHandler,
  deleteEnvironmentHandler,
  loadProjectHandler,
  unloadProjectHandler,
  syncProjectHandler,
  resetProjectHandler,
  loadDefsHandler,
]
