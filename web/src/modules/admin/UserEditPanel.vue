<script setup lang="ts">

import { computed, reactive, ref, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAdminStore } from '@/stores/admin/admin.store'
import { useGateStore } from '@/stores/gate/gate.store'

const admin = useAdminStore()
const gate = useGateStore()
const route = useRoute()
const router = useRouter()

const saveState = reactive({ saving: false, saved: false })
const selectedRoles = ref<string[]>([])

const groupColors: Record<string, string> = {
  admin: '#f0b078',
  games: '#64b5f6',
  images: '#4db6ac',
  other: '#9e9e9e',
}

const roleColors: Record<string, string> = {
  guest: '#9e9e9e',
  player: '#64b5f6',
  developer: '#81c784',
  admin: '#f0b078',
}

function getRoleColor(name: string): string {
  return roleColors[name] || '#9e9e9e'
}

const user = computed(() => {
  return admin.users.find((u: any) => u._id === route.params.id)
})

const permissionMap = computed(() => {
  const map: Record<string, { display: string, group: string }> = {}
  for (const perm of admin.permissions) {
    map[perm.name] = { display: perm.display || perm.name, group: perm.group || 'other' }
  }
  return map
})

function resolveRoles(roleNames: string[], visited = new Set<string>()): string[] {
  const result: string[] = []
  for (const name of roleNames) {
    if (visited.has(name)) continue
    visited.add(name)
    result.push(name)
    const role = admin.roles.find((r: any) => r.name === name)
    if (role?.useRoles?.length) {
      result.push(...resolveRoles(role.useRoles, visited))
    }
  }
  return result
}

const allResolvedRoles = computed(() => {
  return resolveRoles(selectedRoles.value)
})

const inheritedRoles = computed(() => {
  return allResolvedRoles.value.filter(r => !selectedRoles.value.includes(r))
})

const computedPermissions = computed(() => {
  const perms = new Set<string>()
  for (const roleName of allResolvedRoles.value) {
    const role = admin.roles.find((r: any) => r.name === roleName)
    if (role) {
      for (const perm of role.permissions || []) {
        perms.add(perm)
      }
    }
  }
  return Array.from(perms).sort()
})

watch(user, (u) => {
  if (u) {
    selectedRoles.value = [...(u.roles || [])]
  }
}, { immediate: true })

function isRoleInherited(roleName: string): boolean {
  return inheritedRoles.value.includes(roleName)
}

function isRoleDirect(roleName: string): boolean {
  return selectedRoles.value.includes(roleName)
}

function toggleRole(roleName: string) {
  const index = selectedRoles.value.indexOf(roleName)
  if (index === -1) {
    selectedRoles.value.push(roleName)
  } else {
    selectedRoles.value.splice(index, 1)
  }
}

function save() {
  if (!user.value) return
  saveState.saving = true
  saveState.saved = false
  admin.updateUserRoles(user.value._id, selectedRoles.value)
}

function close() {
  router.push('/admin/users')
}

let savedTimer: ReturnType<typeof setTimeout> | null = null

function onSaveComplete() {
  saveState.saving = false
  saveState.saved = true
  if (savedTimer) clearTimeout(savedTimer)
  savedTimer = setTimeout(() => { saveState.saved = false }, 2000)
}

onMounted(() => {
  gate.socket?.on('admin:users:update-roles-complete', onSaveComplete)
  gate.socket?.on('admin:users:update-roles-stopped', onSaveComplete)
})

onUnmounted(() => {
  gate.socket?.off('admin:users:update-roles-complete', onSaveComplete)
  gate.socket?.off('admin:users:update-roles-stopped', onSaveComplete)
  if (savedTimer) clearTimeout(savedTimer)
})

</script>
<template>
<div class="admin-panel" v-if="user">
  <div class="admin-panel__header">
    <UiButton icon="times" @click="close">{{ $t('common.close') }}</UiButton>
    <h3 style="flex: 1; text-align: center">{{ $t('admin.editUserRoles') }}</h3>
    <UiButton
      class="accent"
      :icon="saveState.saving ? null : saveState.saved ? 'check' : null"
      :loading="saveState.saving"
      @click="save"
    >{{ $t('common.save') }}</UiButton>
  </div>

  <div class="admin-panel__body">
    <div class="admin-panel__section">
      <UiInput
        :modelValue="user.username"
        disabled
      >{{ $t('admin.username') }}</UiInput>
      <UiInput
        :modelValue="user.email"
        disabled
      >{{ $t('admin.email') }}</UiInput>
      <UiInput
        :modelValue="user.profile?.display || '-'"
        disabled
      >{{ $t('admin.displayName') }}</UiInput>
    </div>

    <div class="admin-panel__section">
      <h4>{{ $t('admin.roles') }}</h4>
      <div class="admin-panel__checkboxes">
        <div
          v-for="role in admin.roles"
          :key="role._id"
          class="admin-panel__role-item"
          :class="{
            'admin-panel__role-item--inherited': isRoleInherited(role.name) && !isRoleDirect(role.name),
          }"
        >
          <UiCheckbox
            :modelValue="isRoleDirect(role.name)"
            @change="toggleRole(role.name)"
            :style="{ color: getRoleColor(role.name) }"
          >{{ role.display || role.name }}</UiCheckbox>
          <span
            v-if="isRoleInherited(role.name) && !isRoleDirect(role.name)"
            class="admin-panel__role-inherited-badge"
          >{{ $t('admin.inherited') }}</span>
        </div>
      </div>
    </div>

    <div class="admin-panel__section" v-if="inheritedRoles.length">
      <h4>{{ $t('admin.inheritedRoles') }}</h4>
      <div class="admin-panel__permissions-list">
        <span
          v-for="r in inheritedRoles"
          :key="r"
          class="admin-tag admin-tag--subtle"
          :style="{ '--tag-color': getRoleColor(r) }"
        >{{ admin.roles.find((role: any) => role.name === r)?.display || r }}</span>
      </div>
    </div>

    <div class="admin-panel__section">
      <h4>{{ $t('admin.effectivePermissions') }} <span class="admin-muted">({{ computedPermissions.length }})</span></h4>
      <div class="admin-panel__permissions-list">
        <span
          v-for="perm in computedPermissions"
          :key="perm"
          class="admin-tag"
          :style="{ '--tag-color': groupColors[permissionMap[perm]?.group] || groupColors.other }"
        >{{ permissionMap[perm]?.display || perm }}</span>
        <span v-if="!computedPermissions.length" class="admin-muted">{{ $t('admin.noPermissions') }}</span>
      </div>
    </div>
  </div>

  <div class="admin-panel__footer">
    <UiButton
      class="accent"
      :icon="saveState.saving ? null : saveState.saved ? 'check' : null"
      :loading="saveState.saving"
      @click="save"
    >{{ $t('common.save') }}</UiButton>
  </div>
</div>
<div class="admin-panel admin-panel--empty" v-else>
  <p>{{ $t('admin.userNotFound') }}</p>
  <UiButton @click="close">{{ $t('common.back') }}</UiButton>
</div>
</template>
