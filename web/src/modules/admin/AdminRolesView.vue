<script setup lang="ts">

import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAdminStore } from '@/stores/admin/admin.store'
import { EPopupSize } from '@/controls/controls.model'

const admin = useAdminStore()
const router = useRouter()
const search = ref('')
const confirmingDelete = ref<string | null>(null)
const showConfirm = ref(false)

const filteredRoles = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return admin.roles

  return admin.roles.filter((role: any) => {
    if (role.name?.toLowerCase().includes(q)) return true
    if (role.display?.toLowerCase().includes(q)) return true
    if (role.permissions?.some((p: string) => {
      const info = permissionMap.value[p]
      return p.toLowerCase().includes(q) || info?.display.toLowerCase().includes(q)
    })) return true
    return false
  })
})

const roleColors: Record<string, string> = {
  guest: '#9e9e9e',
  player: '#64b5f6',
  developer: '#81c784',
  admin: '#f0b078',
}

const groupColors: Record<string, string> = {
  admin: '#f0b078',
  games: '#64b5f6',
  images: '#4db6ac',
  other: '#9e9e9e',
}

const permissionMap = computed(() => {
  const map: Record<string, { display: string, group: string }> = {}
  for (const perm of admin.permissions) {
    map[perm.name] = { display: perm.display || perm.name, group: perm.group || 'other' }
  }
  return map
})

onMounted(() => {
  admin.init()
})

function openRole(roleId: string) {
  router.push(`/admin/roles/${roleId}`)
}

function createRole() {
  router.push('/admin/roles/new')
}

function confirmDelete(roleId: string) {
  confirmingDelete.value = roleId
  showConfirm.value = true
}

function doDelete() {
  if (confirmingDelete.value) {
    admin.deleteRole(confirmingDelete.value)
  }
  confirmingDelete.value = null
  showConfirm.value = false
}

function cancelDelete() {
  confirmingDelete.value = null
  showConfirm.value = false
}

</script>
<template>
<div class="admin-roles">
  <div class="admin-roles__header">
    <h2>{{ $t('admin.roles') }}</h2>
    <UiInput
      :modelValue="search"
      @update:modelValue="(v: string) => search = v"
      :placeholder="$t('admin.searchRoles')"
    />
    <UiButton icon="plus" @click="createRole">{{ $t('admin.newRole') }}</UiButton>
  </div>

  <div class="admin-roles__list">
    <table class="admin-table">
      <thead>
        <tr>
          <th>{{ $t('admin.role') }}</th>
          <th>{{ $t('admin.permissions') }}</th>
          <th>{{ $t('admin.inherits') }}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="role in filteredRoles"
          :key="role._id"
          class="admin-table__row admin-table__row--clickable"
          @click="openRole(role._id)"
        >
          <td>
            <strong :style="{ color: roleColors[role.name] || '#9e9e9e' }">{{ role.display || role.name }}</strong>
          </td>
          <td>
            <span
              v-for="perm in (role.permissions || []).slice(0, 3)"
              :key="perm"
              class="admin-tag"
              :style="{ '--tag-color': groupColors[permissionMap[perm]?.group] || groupColors.other }"
            >{{ permissionMap[perm]?.display || perm }}</span>
            <span
              v-if="(role.permissions?.length ?? 0) > 3"
              class="admin-tag-overflow"
              :title="role.permissions!.slice(3).map((p: string) => permissionMap[p]?.display || p).join(', ')"
            ><fa icon="ellipsis" /></span>
            <span v-if="!role.permissions?.length" class="admin-muted">{{ $t('admin.none') }}</span>
          </td>
          <td>
            <span
              v-for="r in (role.useRoles || []).slice(0, 3)"
              :key="r"
              class="admin-tag"
              :style="{ '--tag-color': roleColors[r] || '#9e9e9e' }"
            >{{ admin.roles.find((ro: any) => ro.name === r)?.display || r }}</span>
            <span
              v-if="(role.useRoles?.length ?? 0) > 3"
              class="admin-tag-overflow"
              :title="role.useRoles!.slice(3).map((r: string) => admin.roles.find((ro: any) => ro.name === r)?.display || r).join(', ')"
            ><fa icon="ellipsis" /></span>
            <span v-if="!role.useRoles?.length" class="admin-muted">{{ $t('admin.none') }}</span>
          </td>
          <td class="admin-table__actions" @click.stop>
            <UiButton
              icon="trash"
              :disabled="role.name === 'admin'"
              @click="confirmDelete(role._id)"
            >{{ $t('admin.remove') }}</UiButton>
          </td>
        </tr>
        <tr v-if="!filteredRoles.length">
          <td colspan="4" class="admin-muted" style="text-align: center; padding: 2rem">
            {{ $t('admin.noRoleMatches') }}
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
      <p class="ui-confirm__message">{{ $t('admin.confirmDeleteRole') }}</p>
      <div class="ui-confirm__actions">
        <UiButton class="accent" type="submit">{{ $t('common.cancel') }}</UiButton>
        <UiButton @click="doDelete">{{ $t('admin.yesDelete') }}</UiButton>
      </div>
    </form>
  </UiPopup>
</div>
</template>
