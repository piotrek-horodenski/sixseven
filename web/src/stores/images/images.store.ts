import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { IImage, IImageTag, IImageCollection, ViewMode } from './images.model'
import * as api from './images.api'

const PAGE_SIZE = 40

const STORAGE_KEY_VIEW_MODE = 'hydra_images_viewMode'
const STORAGE_KEY_SORT_BY = 'hydra_images_sortBy'
const STORAGE_KEY_SORT_DIR = 'hydra_images_sortDirection'

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw !== null ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export const useImagesStore = defineStore('images', () => {
  // Data
  const images = ref<IImage[]>([])
  const tags = ref<IImageTag[]>([])
  const collections = ref<IImageCollection[]>([])

  // Filters
  const phrase = ref('')
  const selectedTags = ref<string[]>([])
  const selectedCollection = ref('')
  const sortBy = ref(loadFromStorage(STORAGE_KEY_SORT_BY, 'createdAt'))
  const sortDirection = ref(loadFromStorage(STORAGE_KEY_SORT_DIR, -1))

  // UI state
  const viewMode = ref<ViewMode>(loadFromStorage(STORAGE_KEY_VIEW_MODE, 'grid'))
  const loading = ref(false)
  const loadingMore = ref(false)
  const hasMore = ref(true)
  const page = ref(0)
  const showDeleted = ref(false)
  const uploading = ref(false)

  // Selection
  const selectedIds = ref<Set<string>>(new Set())
  const lastSelectedId = ref<string | null>(null)

  // Edit
  const editingImage = ref<IImage | null>(null)
  const showBatchEdit = ref(false)

  // Upload popup
  const showUploadPopup = ref(false)
  const droppedFiles = ref<File[]>([])

  // Computed
  const selectedImages = computed(() =>
    images.value.filter(img => selectedIds.value.has(img._id)),
  )

  const selectedCount = computed(() => selectedIds.value.size)

  const sortedTags = computed(() =>
    [...tags.value].sort((a, b) => b.count - a.count),
  )

  // Filters object for API calls
  function getFilters(pageOverride?: number) {
    return {
      phrase: phrase.value,
      tags: selectedTags.value,
      collection: selectedCollection.value,
      sortBy: sortBy.value,
      sortDirection: sortDirection.value,
      page: pageOverride ?? page.value,
      limit: PAGE_SIZE,
      deleted: showDeleted.value,
      active: !showDeleted.value,
    }
  }

  // Actions
  async function loadImages() {
    loading.value = true
    page.value = 0
    try {
      const res = await api.fetchImages(getFilters(0))
      images.value = res.images
      hasMore.value = res.images.length >= PAGE_SIZE
    } catch {
      images.value = []
      hasMore.value = false
    } finally {
      loading.value = false
    }
  }

  async function loadMore() {
    if (loadingMore.value || !hasMore.value) return
    loadingMore.value = true
    page.value++
    try {
      const res = await api.fetchImages(getFilters())
      images.value = [...images.value, ...res.images]
      hasMore.value = res.images.length >= PAGE_SIZE
    } catch {
      hasMore.value = false
    } finally {
      loadingMore.value = false
    }
  }

  async function loadTags() {
    try {
      tags.value = await api.fetchTags()
    } catch {
      tags.value = []
    }
  }

  async function loadCollections() {
    try {
      collections.value = await api.fetchCollections()
    } catch {
      collections.value = []
    }
  }

  async function init() {
    await Promise.all([loadImages(), loadTags(), loadCollections()])
  }

  async function reload() {
    await Promise.all([loadImages(), loadTags(), loadCollections()])
  }

  function setPhrase(value: string) {
    phrase.value = value
    loadImages()
  }

  function toggleTag(name: string) {
    const idx = selectedTags.value.indexOf(name)
    if (idx === -1) {
      selectedTags.value = [...selectedTags.value, name]
    } else {
      selectedTags.value = selectedTags.value.filter(t => t !== name)
    }
    loadImages()
  }

  function clearTags() {
    selectedTags.value = []
    loadImages()
  }

  function setCollection(name: string) {
    selectedCollection.value = name
    selectedTags.value = []
    loadImages()
  }

  function clearCollection() {
    selectedCollection.value = ''
    loadImages()
  }

  function setSort(field: string, direction: number) {
    sortBy.value = field
    sortDirection.value = direction
    localStorage.setItem(STORAGE_KEY_SORT_BY, JSON.stringify(field))
    localStorage.setItem(STORAGE_KEY_SORT_DIR, JSON.stringify(direction))
    loadImages()
  }

  function setViewMode(mode: ViewMode) {
    viewMode.value = mode
    localStorage.setItem(STORAGE_KEY_VIEW_MODE, JSON.stringify(mode))
  }

  function toggleShowDeleted() {
    showDeleted.value = !showDeleted.value
    loadImages()
  }

  // Selection
  function toggleSelect(id: string) {
    const next = new Set(selectedIds.value)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    selectedIds.value = next
    lastSelectedId.value = id
  }

  function shiftSelect(id: string) {
    if (!lastSelectedId.value) {
      toggleSelect(id)
      return
    }
    const allIds = images.value.map(img => img._id)
    const startIdx = allIds.indexOf(lastSelectedId.value)
    const endIdx = allIds.indexOf(id)
    if (startIdx === -1 || endIdx === -1) {
      toggleSelect(id)
      return
    }
    const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx]
    const next = new Set(selectedIds.value)
    for (let i = from; i <= to; i++) {
      next.add(allIds[i])
    }
    selectedIds.value = next
    lastSelectedId.value = id
  }

  function selectAll() {
    selectedIds.value = new Set(images.value.map(img => img._id))
  }

  function deselectAll() {
    selectedIds.value = new Set()
    lastSelectedId.value = null
  }

  function setEditingImage(image: IImage | null) {
    editingImage.value = image
  }

  // CRUD actions
  async function upload(file: File, metadata: { title: string; description: string; tags: string; collections: string[] }, skipReload = false) {
    uploading.value = true
    try {
      await api.uploadImage(file, metadata)
      if (!skipReload) await reload()
    } finally {
      uploading.value = false
    }
  }

  async function updateImageData(id: string, data: { title?: string; description?: string; tags?: string; collections?: string[]; isDeleted?: boolean }) {
    await api.updateImage(id, data)
    await reload()
  }

  async function removeImage(id: string, force = false) {
    await api.deleteImage(id, force)
    selectedIds.value = new Set([...selectedIds.value].filter(sid => sid !== id))
    if (editingImage.value?._id === id) editingImage.value = null
    await reload()
  }

  async function restoreImage(id: string) {
    await api.updateImage(id, { isDeleted: false })
    await reload()
  }

  async function batchUpdate(payload: {
    ids: string[]
    tagsToAdd: { name: string }[]
    tagsToRemove: { name: string }[]
    collectionsToAdd: { name: string }[]
    collectionsToRemove: { name: string }[]
  }) {
    await api.batchUpdateImages(payload)
    deselectAll()
    await reload()
  }

  async function batchDelete(ids: string[], force = false) {
    for (const id of ids) {
      await api.deleteImage(id, force)
    }
    deselectAll()
    await reload()
  }

  // Tag/Collection management
  async function addTag(name: string) {
    await api.createTag(name)
    await loadTags()
  }

  async function removeTag(id: string) {
    await api.deleteTag(id)
    await loadTags()
  }

  async function addCollection(name: string) {
    await api.createCollection(name)
    await loadCollections()
  }

  async function removeCollection(id: string) {
    await api.deleteCollection(id)
    await loadCollections()
  }

  return {
    // State
    images,
    tags,
    collections,
    phrase,
    selectedTags,
    selectedCollection,
    sortBy,
    sortDirection,
    viewMode,
    loading,
    loadingMore,
    hasMore,
    page,
    showDeleted,
    uploading,
    selectedIds,
    editingImage,
    showBatchEdit,
    showUploadPopup,
    droppedFiles,

    // Computed
    selectedImages,
    selectedCount,
    sortedTags,

    // Actions
    init,
    reload,
    loadImages,
    loadMore,
    loadTags,
    loadCollections,
    setPhrase,
    toggleTag,
    clearTags,
    setCollection,
    clearCollection,
    setSort,
    setViewMode,
    toggleShowDeleted,
    toggleSelect,
    shiftSelect,
    selectAll,
    deselectAll,
    setEditingImage,
    upload,
    updateImageData,
    removeImage,
    restoreImage,
    batchUpdate,
    batchDelete,
    addTag,
    removeTag,
    addCollection,
    removeCollection,
  }
})
