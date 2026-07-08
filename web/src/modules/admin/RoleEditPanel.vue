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

const isNew = computed(() => route.name === 'admin-role-new')

const role = computed(() => {
  if (isNew.value) return null
  return admin.roles.find((r: any) => r._id === route.params.id)
})

const name = ref('')
const display = ref('')
const selectedPermissions = ref<string[]>([])
const selectedUseRoles = ref<string[]>([])

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

const permissionGroups = computed(() => {
  const groups: Record<string, any[]> = {}
  for (const perm of admin.permissions) {
    const group = perm.group || 'other'
    if (!groups[group]) groups[group] = []
    groups[group].push(perm)
  }
  return groups
})

const permissionMap = computed(() => {
  const map: Record<string, { display: string, group: string }> = {}
  for (const perm of admin.permissions) {
    map[perm.name] = { display: perm.display || perm.name, group: perm.group || 'other' }
  }
  return map
})

const otherRoles = computed(() => {
  if (isNew.value) return admin.roles
  return admin.roles.filter((r: any) => r._id !== route.params.id)
})

// Resolve all inherited permissions through useRoles
function resolveInheritedPermissions(roleNames: string[], visited = new Set<string>()): string[] {
  const perms: string[] = []
  for (const roleName of roleNames) {
    if (visited.has(roleName)) continue
    visited.add(roleName)
    const r = admin.roles.find((ro: any) => ro.name === roleName)
    if (!r) continue
    for (const p of r.permissions || []) {
      if (!perms.includes(p)) perms.push(p)
    }
    if (r.useRoles?.length) {
      for (const p of resolveInheritedPermissions(r.useRoles, visited)) {
        if (!perms.includes(p)) perms.push(p)
      }
    }
  }
  return perms
}

const inheritedPermissions = computed(() => {
  return resolveInheritedPermissions(selectedUseRoles.value)
})

const effectivePermissions = computed(() => {
  const all = new Set([...selectedPermissions.value, ...inheritedPermissions.value])
  return Array.from(all).sort()
})

const isProtectedAdmin = computed(() => {
  return !isNew.value && role.value?.name === 'admin'
})

const protectedPermissions = ['manage-users', 'manage-roles', 'view-admin']

function isPermissionProtected(permName: string): boolean {
  return isProtectedAdmin.value && protectedPermissions.includes(permName)
}

watch([role, isNew], () => {
  if (isNew.value) {
    name.value = ''
    display.value = ''
    selectedPermissions.value = []
    selectedUseRoles.value = []
  } else if (role.value) {
    name.value = role.value.name || ''
    display.value = role.value.display || ''
    selectedPermissions.value = [...(role.value.permissions || [])]
    selectedUseRoles.value = [...(role.value.useRoles || [])]
  }
}, { immediate: true })

function togglePermission(permName: string) {
  const index = selectedPermissions.value.indexOf(permName)
  if (index === -1) {
    selectedPermissions.value.push(permName)
  } else {
    selectedPermissions.value.splice(index, 1)
  }
}

function toggleUseRole(roleName: string) {
  const index = selectedUseRoles.value.indexOf(roleName)
  if (index === -1) {
    selectedUseRoles.value.push(roleName)
  } else {
    selectedUseRoles.value.splice(index, 1)
  }
}

function isPermissionInherited(permName: string): boolean {
  return inheritedPermissions.value.includes(permName)
}

function save() {
  if (isNew.value) {
    if (!name.value.trim()) return
    admin.createRole({
      name: name.value.trim(),
      display: display.value.trim(),
      permissions: selectedPermissions.value,
      useRoles: selectedUseRoles.value,
    })
    router.push('/admin/roles')
  } else if (role.value) {
    saveState.saving = true
    saveState.saved = false
    admin.updateRole({
      _id: role.value._id,
      display: display.value.trim(),
      permissions: selectedPermissions.value,
      useRoles: selectedUseRoles.value,
    })
  }
}

let savedTimer: ReturnType<typeof setTimeout> | null = null

function onSaveComplete() {
  saveState.saving = false
  saveState.saved = true
  if (savedTimer) clearTimeout(savedTimer)
  savedTimer = setTimeout(() => { saveState.saved = false }, 2000)
}

onMounted(() => {
  gate.socket?.on('admin:roles:update-complete', onSaveComplete)
  gate.socket?.on('admin:roles:update-stopped', onSaveComplete)
})

onUnmounted(() => {
  gate.socket?.off('admin:roles:update-complete', onSaveComplete)
  gate.socket?.off('admin:roles:update-stopped', onSaveComplete)
  if (savedTimer) clearTimeout(savedTimer)
})

function close() {
  router.push('/admin/roles')
}

</script>
<template>
<div class="admin-panel">
  <div class="admin-panel__header">
    <UiButton icon="times" @click="close">Close</UiButton>
    <h3 style="flex: 1; text-align: center">{{ isNew ? 'New Role' : 'Edit Role' }}</h3>
    <UiButton
      class="accent"
      :icon="saveState.saving ? null : saveState.saved ? 'check' : null"
      :loading="saveState.saving"
      @click="save"
    >{{ isNew ? 'Create' : 'Save' }}</UiButton>
  </div>

  <div class="admin-panel__body">
    <div class="admin-panel__section">
      <UiInput
        v-model="name"
        :disabled="!isNew"
        placeholder="role-name"
      >Name</UiInput>
      <UiInput
        v-model="display"
        placeholder="Display Name"
      >Display</UiInput>
    </div>

    <div class="admin-panel__columns">
      <div class="admin-panel__section">
        <h4>Direct Permissions</h4>
        <div
          v-for="(perms, group) in permissionGroups"
          :key="group"
          class="admin-panel__permission-group"
        >
          <h5 :style="{ color: groupColors[group as string] || groupColors.other }">{{ group }}</h5>
          <div class="admin-panel__checkboxes">
            <div
              v-for="perm in perms"
              :key="perm._id"
              class="admin-panel__perm-item"
            >
              <UiCheckbox
                :modelValue="selectedPermissions.includes(perm.name)"
                @change="togglePermission(perm.name)"
                :disabled="isPermissionProtected(perm.name) || (isPermissionInherited(perm.name) && !selectedPermissions.includes(perm.name))"
                :style="{ color: groupColors[group as string] || groupColors.other }"
              >{{ perm.display || perm.name }}</UiCheckbox>
              <span
                v-if="isPermissionInherited(perm.name)"
                class="admin-panel__role-inherited-badge"
              >inherited</span>
            </div>
          </div>
        </div>
      </div>

      <div class="admin-panel__section" v-if="otherRoles.length">
        <h4>Inherit from Roles</h4>
        <div class="admin-panel__checkboxes">
          <UiCheckbox
            v-for="r in otherRoles"
            :key="r._id"
            :modelValue="selectedUseRoles.includes(r.name)"
            @change="toggleUseRole(r.name)"
            :style="{ color: roleColors[r.name] || '#9e9e9e' }"
          >{{ r.display || r.name }}</UiCheckbox>
        </div>
      </div>
    </div>

    <div class="admin-panel__section">
      <h4>Effective Permissions <span class="admin-muted">({{ effectivePermissions.length }})</span></h4>
      <div class="admin-panel__permissions-list">
        <span
          v-for="perm in effectivePermissions"
          :key="perm"
          class="admin-tag"
          :class="{ 'admin-tag--subtle': inheritedPermissions.includes(perm) && !selectedPermissions.includes(perm) }"
          :style="{ '--tag-color': groupColors[permissionMap[perm]?.group] || groupColors.other }"
        >{{ permissionMap[perm]?.display || perm }}</span>
        <span v-if="!effectivePermissions.length" class="admin-muted">No permissions</span>
      </div>
    </div>
  </div>

  <div class="admin-panel__footer">
    <UiButton
      class="accent"
      :icon="saveState.saving ? null : saveState.saved ? 'check' : null"
      :loading="saveState.saving"
      @click="save"
    >{{ isNew ? 'Create' : 'Save' }}</UiButton>
  </div>
</div>
</template>
                                                                                                                                     