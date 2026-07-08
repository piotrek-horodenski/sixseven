<script setup lang="ts">

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useProjectsStore } from '@/stores/projects/projects.store'
import { usePlaylistsStore } from '@/stores/projects/playlists.store'
import { usePermission } from '@/composables/usePermission'
import type { IPlaylist } from '@/stores/projects/playlists.model'
import { EPopupSize } from '@/controls/controls.model'

const route = useRoute()
const projectsStore = useProjectsStore()
const playlistsStore = usePlaylistsStore()
const { hasPermission } = usePermission()

const canEdit = computed(() => hasPermission('edit-unreal-projects'))
const projectId = computed(() => route.params.projectId as string)
const project = computed(() => projectsStore.projects.find(p => p._id === projectId.value))

const showAdd = ref(false)
const newPlaylistName = ref('')
const showDelete = ref(false)
const deleteTarget = ref<IPlaylist | null>(null)

onMounted(() => {
  playlistsStore.init(projectId.value)
})

onUnmounted(() => {
  playlistsStore.cleanup()
})

function addPlaylist() {
  if (!newPlaylistName.value.trim()) return
  playlistsStore.createPlaylist(projectId.value, newPlaylistName.value.trim())
  newPlaylistName.value = ''
  showAdd.value = false
}

function openDelete(playlist: IPlaylist) {
  deleteTarget.value = playlist
  showDelete.value = true
}

function doDelete() {
  if (deleteTarget.value) {
    playlistsStore.deletePlaylist(deleteTarget.value._id)
  }
  showDelete.value = false
  deleteTarget.value = null
}

</script>
<template>
<div class="project-playlists" v-if="project">
  <div class="project-playlists__toolbar">
    <UiButton v-if="canEdit" class="accent" @click="showAdd = true" :disabled="project.locked">
      <fa icon="plus" /> Add Playlist
    </UiButton>
  </div>

  <div class="project-playlists__list" v-if="playlistsStore.sortedPlaylists.length">
    <div
      v-for="playlist in playlistsStore.sortedPlaylists"
      :key="playlist._id"
      class="playlist-card"
    >
      <div class="board-card__name">{{ playlist.name }}</div>
      <div class="playlist-card__element-count">
        {{ playlist.elements.length }} element{{ playlist.elements.length !== 1 ? 's' : '' }}
      </div>
      <div class="board-card__actions" @click.stop>
        <UiButton v-if="canEdit" @click="openDelete(playlist)" :disabled="project.locked" v-tooltip="'Delete'">
          <fa icon="trash" />
        </UiButton>
      </div>
    </div>
  </div>

  <div v-else class="project-playlists__placeholder">
    <fa icon="list-ol" />
    <h3>No Playlists</h3>
    <p>Create a playlist to sequence graphics during broadcast.</p>
  </div>

  <!-- Add Playlist -->
  <UiPopup :show="showAdd" :size="EPopupSize.thin" :outsideClose="true" @update:show="showAdd = false">
    <template #title>Add Playlist</template>
    <form class="concept-edit" @submit.prevent="addPlaylist">
      <UiInput :modelValue="newPlaylistName" @update:modelValue="(v: string) => newPlaylistName = v">Name</UiInput>
      <div class="concept-edit__actions">
        <UiButton class="accent" type="submit" :disabled="!newPlaylistName.trim()">Add</UiButton>
        <UiButton @click="showAdd = false">Cancel</UiButton>
      </div>
    </form>
  </UiPopup>

  <!-- Delete Confirm -->
  <UiPopup :show="showDelete" :size="EPopupSize.thin" :outsideClose="true" @update:show="showDelete = false">
    <template #title>Confirm Delete</template>
    <form class="ui-confirm" @submit.prevent="showDelete = false">
      <p class="ui-confirm__message">Delete playlist <strong>{{ deleteTarget?.name }}</strong>?</p>
      <div class="ui-confirm__actions">
        <UiButton class="accent" type="submit">Cancel</UiButton>
        <UiButton @click="doDelete">Yes, delete</UiButton>
      </div>
    </form>
  </UiPopup>
</div>
</template>
