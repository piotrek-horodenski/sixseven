<script setup lang="ts">

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useProjectsStore } from '@/stores/projects/projects.store'
import { useBoardsStore } from '@/stores/projects/boards.store'
import { usePermission } from '@/composables/usePermission'
import type { IBoard } from '@/stores/projects/boards.model'
import { EPopupSize } from '@/controls/controls.model'

const route = useRoute()
const projectsStore = useProjectsStore()
const boardsStore = useBoardsStore()
const { hasPermission } = usePermission()

const canEdit = computed(() => hasPermission('edit-unreal-projects'))
const projectId = computed(() => route.params.projectId as string)
const project = computed(() => projectsStore.projects.find(p => p._id === projectId.value))

const showAdd = ref(false)
const newBoardName = ref('')
const showDelete = ref(false)
const deleteTarget = ref<IBoard | null>(null)

onMounted(() => {
  boardsStore.init(projectId.value)
})

onUnmounted(() => {
  boardsStore.cleanup()
})

function addBoard() {
  if (!newBoardName.value.trim()) return
  boardsStore.createBoard(projectId.value, newBoardName.value.trim())
  newBoardName.value = ''
  showAdd.value = false
}

function openDelete(board: IBoard) {
  deleteTarget.value = board
  showDelete.value = true
}

function doDelete() {
  if (deleteTarget.value) {
    boardsStore.deleteBoard(deleteTarget.value._id)
  }
  showDelete.value = false
  deleteTarget.value = null
}

function togglePublic(board: IBoard) {
  boardsStore.updateBoard({ _id: board._id, public: !board.public })
}

</script>
<template>
<div class="project-boards" v-if="project">
  <div class="project-boards__toolbar">
    <UiButton v-if="canEdit" class="accent" @click="showAdd = true" :disabled="project.locked">
      <fa icon="plus" /> Add Board
    </UiButton>
  </div>

  <div class="project-boards__list" v-if="boardsStore.boards.length">
    <div
      v-for="board in boardsStore.boards"
      :key="board._id"
      class="board-card"
    >
      <div class="board-card__name">{{ board.name }}</div>
      <div class="board-card__badges">
        <span v-if="board.root" class="board-card__badge">root</span>
        <span v-if="board.default" class="board-card__badge">default</span>
        <span v-if="board.public" class="board-card__badge">public</span>
      </div>
      <div class="board-card__actions" @click.stop>
        <UiButton v-if="canEdit" @click="togglePublic(board)" v-tooltip="board.public ? 'Make private' : 'Make public'">
          <fa :icon="board.public ? 'eye' : 'eye-slash'" />
        </UiButton>
        <UiButton v-if="canEdit" @click="openDelete(board)" :disabled="project.locked" v-tooltip="'Delete'">
          <fa icon="trash" />
        </UiButton>
      </div>
    </div>
  </div>

  <div v-else class="project-boards__placeholder">
    <fa icon="th-large" />
    <h3>No Boards</h3>
    <p>Create a board to build control panels for live broadcast.</p>
  </div>

  <!-- Add Board -->
  <UiPopup :show="showAdd" :size="EPopupSize.thin" :outsideClose="true" @update:show="showAdd = false">
    <template #title>Add Board</template>
    <form class="concept-edit" @submit.prevent="addBoard">
      <UiInput :modelValue="newBoardName" @update:modelValue="(v: string) => newBoardName = v">Name</UiInput>
      <div class="concept-edit__actions">
        <UiButton class="accent" type="submit" :disabled="!newBoardName.trim()">Add</UiButton>
        <UiButton @click="showAdd = false">Cancel</UiButton>
      </div>
    </form>
  </UiPopup>

  <!-- Delete Confirm -->
  <UiPopup :show="showDelete" :size="EPopupSize.thin" :outsideClose="true" @update:show="showDelete = false">
    <template #title>Confirm Delete</template>
    <form class="ui-confirm" @submit.prevent="showDelete = false">
      <p class="ui-confirm__message">Delete board <strong>{{ deleteTarget?.name }}</strong>?</p>
      <div class="ui-confirm__actions">
        <UiButton class="accent" type="submit">Cancel</UiButton>
        <UiButton @click="doDelete">Yes, delete</UiButton>
      </div>
    </form>
  </UiPopup>
</div>
</template>
