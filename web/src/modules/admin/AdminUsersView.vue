<script setup lang="ts">

import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAdminStore } from '@/stores/admin/admin.store'
import { EPopupSize } from '@/controls/controls.model'

const admin = useAdminStore()
const router = useRouter()

const roleColors: Record<string, string> = {
  guest: '#9e9e9e',
  player: '#64b5f6',
  developer: '#81c784',
  admin: '#f0b078',
}
const search = ref('')
const confirmingDelete = ref<string | null>(null)
const showConfirm = ref(false)

const roleDisplayToName = computed(() => {
  const map: Record<string, string> = {}
  for (const r of admin.roles) {
    if (r.display) map[r.display.toLowerCase()] = r.name
    map[r.name.toLowerCase()] = r.name
  }
  return map
})

const filteredUsers = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return admin.users

  return admin.users.filter((u: any) => {
    if (u.username?.toLowerCase().includes(q)) return true
    if (u.email?.toLowerCase().includes(q)) return true
    const matchedRole = roleDisplayToName.value[q]
    if (matchedRole && u.roles?.includes(matchedRole)) return true
    return false
  })
})

onMounted(() => {
  admin.init()
})

function openUser(userId: string) {
  router.push(`/admin/users/${userId}`)
}

function confirmDelete(userId: string) {
  confirmingDelete.value = userId
  showConfirm.value = true
}

function doDelete() {
  if (confirmingDelete.value) {
    admin.deleteUser(confirmingDelete.value)
  }
  confirmingDelete.value = null
  showConfirm.value = false
}

function cancelDelete() {
  confirmingDelete.value = null
  showConfirm.value = false
}

function syncUsers() {
  admin.syncUsers()
}

</script>
<template>
<div class="admin-users">
  <div class="admin-users__header">
    <h2>{{ $t('admin.users') }}</h2>
    <UiInput
      :modelValue="search"
      @update:modelValue="(v: string) => search = v"
      :placeholder="$t('admin.searchUsers')"
    />
    <UiButton
      :loading="admin.syncing"
      @click="syncUsers"
    >{{ $t('admin.sync') }}</UiButton>
  </div>

  <div class="admin-users__list">
    <table class="admin-table">
      <thead>
        <tr>
          <th>{{ $t('admin.username') }}</th>
          <th>{{ $t('admin.email') }}</th>
          <th>{{ $t('admin.roles') }}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="u in filteredUsers"
          :key="u._id"
          class="admin-table__row admin-table__row--clickable"
          :class="{ 'admin-table__row--selected': $route.params.id === u._id }"
          @click="openUser(u._id)"
        >
          <td>{{ u.username }}</td>
          <td>{{ u.email }}</td>
          <td>
            <span
              v-for="role in (u.roles || []).slice(0, 3)"
              :key="role"
              class="admin-tag"
              :style="{ '--tag-color': roleColors[role] || '#9e9e9e' }"
            >{{ admin.roles.find((r: any) => r.name === role)?.display || role }}</span>
            <span
              v-if="(u.roles?.length ?? 0) > 3"
              class="admin-tag-overflow"
              :title="u.roles!.slice(3).map((r: string) => admin.roles.find((ro: any) => ro.name === r)?.display || r).join(', ')"
            ><fa icon="ellipsis" /></span>
            <span v-if="!u.roles?.length" class="admin-muted">{{ $t('admin.none') }}</span>
          </td>
          <td class="admin-table__actions" @click.stop>
            <UiButton
              icon="trash"
              :disabled="u.roles?.includes('admin')"
              @click="confirmDelete(u._id)"
            >{{ $t('admin.remove') }}</UiButton>
          </td>
        </tr>
        <tr v-if="!filteredUsers.length">
          <td colspan="4" class="admin-muted" style="text-align: center; padding: 2rem">
            {{ $t('admin.noUserMatches') }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <UiPopup
    :show="showConfirm"
    :size="EPopupSize.thin"
    :outsideClose="true"
    @update:show="cancelDelete"
  >
    <template #title>{{ $t('admin.confirm') }}</template>
    <form class="ui-confirm" @submit.prevent="cancelDelete">
      <p class="ui-confirm__message">{{ $t('admin.confirmDeleteUser') }}</p>
      <div class="ui-confirm__actions">
        <UiButton class="accent" type="submit">{{ $t('common.cancel') }}</UiButton>
        <UiButton @click="doDelete">{{ $t('admin.yesDelete') }}</UiButton>
      </div>
    </form>
  </UiPopup>
</div>
</template>
