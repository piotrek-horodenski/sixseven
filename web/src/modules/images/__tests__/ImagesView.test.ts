import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import type { IImage, IImageTag, IImageCollection } from '@/stores/images/images.model'

// --- API mock ---
const mockApi = vi.hoisted(() => ({
  fetchImages: vi.fn().mockResolvedValue({ images: [], metadata: {} }),
  fetchTags: vi.fn().mockResolvedValue([]),
  fetchCollections: vi.fn().mockResolvedValue([]),
  uploadImage: vi.fn().mockResolvedValue(undefined),
  updateImage: vi.fn().mockResolvedValue(undefined),
  deleteImage: vi.fn().mockResolvedValue(undefined),
  batchUpdateImages: vi.fn().mockResolvedValue(undefined),
  createTag: vi.fn().mockResolvedValue(undefined),
  deleteTag: vi.fn().mockResolvedValue(undefined),
  createCollection: vi.fn().mockResolvedValue(undefined),
  deleteCollection: vi.fn().mockResolvedValue(undefined),
  getThumbUrl: vi.fn((id: string) => `/thumbs/${id}`),
  getImageUrl: vi.fn((id: string) => `/photos/${id}`),
}))

vi.mock('@/stores/images/images.api', () => mockApi)
vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({
    hasPermission: (name: string) => true,
    hasAnyPermission: (names: string[]) => true,
  }),
}))

import { useImagesStore } from '@/stores/images/images.store'
import ImagesView from '../ImagesView.vue'
import ImagesToolbar from '../ImagesToolbar.vue'
import ImagesGrid from '../ImagesGrid.vue'
import ImagesList from '../ImagesList.vue'
import ImageCard from '../ImageCard.vue'
import ImageUploadPopup from '../ImageUploadPopup.vue'
import ImagesSidebar from '../ImagesSidebar.vue'
import ImagesSubmenu from '../ImagesSubmenu.vue'
import ImagesBatchPanel from '../ImagesBatchPanel.vue'
import ImagesBatchFooter from '../ImagesBatchFooter.vue'

// --- Helpers ---

function makeImage(id: string, overrides: Partial<IImage> = {}): IImage {
  return {
    _id: id,
    title: `Image ${id}`,
    description: '',
    tags: [],
    collections: [],
    meta: { originalName: '', mimeType: '', fileSize: 0, width: 0, height: 0, density: 0, aspect: 0 },
    ...overrides,
  }
}

function makeTags(...names: string[]): IImageTag[] {
  return names.map((name, i) => ({ _id: `t${i}`, name, count: 10 - i }))
}

function makeCollections(...names: string[]): IImageCollection[] {
  return names.map((name, i) => ({ _id: `c${i}`, name, count: 5 - i }))
}

const StubComponent = defineComponent({
  inheritAttrs: false,
  setup(_, { slots }) {
    return () => h('div', slots.default?.())
  },
})

const StubTransition = defineComponent({
  inheritAttrs: false,
  setup(_, { slots }) {
    return () => slots.default?.()
  },
})

const globalStubs: Record<string, any> = {
  UiProgress: StubComponent,
  UiLoader: StubComponent,
  UiHeightTransition: StubTransition,
  UiGeneralTransition: StubTransition,
  UiForm: StubComponent,
  UiPopup: defineComponent({
    inheritAttrs: false,
    props: ['show', 'size', 'outsideClose'],
    emits: ['update:show'],
    setup(props, { slots }) {
      return () => props.show ? h('div', { class: 'ui-popup' }, [
        slots.title?.(),
        slots.default?.(),
      ]) : null
    },
  }),
  UiMessage: StubComponent,
  UiButton: defineComponent({
    inheritAttrs: false,
    props: ['loading', 'disabled', 'icon', 'type'],
    emits: ['click'],
    setup(props, { slots, emit }) {
      return () => h('button', {
        disabled: props.disabled || props.loading,
        onClick: () => emit('click'),
      }, slots.default?.())
    },
  }),
  UiInput: defineComponent({
    props: ['modelValue', 'placeholder'],
    emits: ['update:modelValue'],
    setup(props, { slots, emit }) {
      return () => h('div', { class: 'ui-input-wrapper' }, [
        slots.default?.(),
        h('input', {
          value: props.modelValue,
          placeholder: props.placeholder,
          onInput: (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).value),
        }),
      ])
    },
  }),
  UiTextarea: defineComponent({
    props: ['modelValue'],
    emits: ['update:modelValue'],
    setup(props, { slots, emit }) {
      return () => h('div', [
        slots.default?.(),
        h('textarea', {
          value: props.modelValue,
          onInput: (e: Event) => emit('update:modelValue', (e.target as HTMLTextAreaElement).value),
        }),
      ])
    },
  }),
  UiCheckbox: defineComponent({
    props: ['modelValue', 'indeterminate'],
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () => h('input', {
        type: 'checkbox',
        checked: props.modelValue,
        onChange: () => emit('update:modelValue', !props.modelValue),
      })
    },
  }),
  UiSwitch: defineComponent({
    props: ['modelValue'],
    emits: ['update:modelValue'],
    setup(props, { slots, emit }) {
      return () => h('label', { class: 'ui-switch' }, [
        h('input', {
          type: 'checkbox',
          checked: props.modelValue,
          onChange: () => emit('update:modelValue', !props.modelValue),
        }),
        slots.default?.(),
      ])
    },
  }),
  UiRadio: StubComponent,
  UiNumber: StubComponent,
  UiSaveIndicator: StubComponent,
  fa: defineComponent({
    props: ['icon'],
    setup(props) {
      return () => h('i', { class: `fa-${props.icon}` })
    },
  }),
}

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/images', name: 'images', component: { template: '<div />' } },
      { path: '/images/batch', name: 'images-batch', component: { template: '<div />' } },
      { path: '/images/:id', name: 'images-edit', component: { template: '<div />' } },
    ],
  })
}

function mountOptions(router: ReturnType<typeof createTestRouter>, pinia: ReturnType<typeof createPinia>) {
  return {
    global: {
      plugins: [pinia, router],
      stubs: globalStubs,
      directives: {
        tooltip: () => {},
      },
    },
  }
}

function createDataTransfer(files: File[]): DataTransfer {
  const dt = {
    files,
    types: ['Files'],
    dropEffect: 'none',
    effectAllowed: 'all',
    items: files.map(f => ({ kind: 'file', type: f.type, getAsFile: () => f })),
    getData: () => '',
    setData: () => {},
    clearData: () => {},
    setDragImage: () => {},
  } as unknown as DataTransfer
  // Also add length so it can be iterated
  Object.defineProperty(dt.files, 'length', { value: files.length })
  return dt
}

// ===========================================================================
// TESTS
// ===========================================================================

describe('ImagesView – drag & drop upload', () => {
  let store: ReturnType<typeof useImagesStore>
  let router: ReturnType<typeof createTestRouter>
  let pinia: ReturnType<typeof createPinia>

  beforeEach(async () => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    router = createTestRouter()
    router.push('/images')
    await router.isReady()
    store = useImagesStore()
  })

  function mountImagesView() {
    return mount(ImagesView, {
      ...mountOptions(router, pinia),
      global: {
        ...mountOptions(router, pinia).global,
        stubs: {
          ...globalStubs,
          Teleport: true, // stub Teleport to avoid happy-dom issues
        },
      },
    })
  }

  it('opens upload popup with dropped files on document drop', async () => {
    const wrapper = mountImagesView()
    await flushPromises()

    const file = new File(['pixels'], 'photo.png', { type: 'image/png' })
    const dropEvent = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent
    const fileList = [file] as unknown as FileList
    Object.defineProperty(fileList, 'length', { value: 1 })
    Object.defineProperty(dropEvent, 'dataTransfer', { value: { files: fileList } })

    document.dispatchEvent(dropEvent)
    await nextTick()

    // Upload popup should now be visible (show=true passed to UiPopup)
    const popup = wrapper.findComponent(ImageUploadPopup)
    expect(popup.exists()).toBe(true)
    expect(popup.props('show')).toBe(true)
    expect(popup.props('initialFiles')).toHaveLength(1)
    expect(popup.props('initialFiles')[0].name).toBe('photo.png')
  })

  it('shows dropzone overlay on dragenter with files', async () => {
    const wrapper = mountImagesView()
    await flushPromises()

    const event = new Event('dragenter', { bubbles: true }) as DragEvent
    Object.defineProperty(event, 'dataTransfer', {
      value: { types: ['Files'] },
    })
    document.dispatchEvent(event)
    await nextTick()

    // With Teleport stubbed, dropzone renders inline
    expect(wrapper.find('.images-view__dropzone').exists()).toBe(true)
  })

  it('hides dropzone on dragleave', async () => {
    const wrapper = mountImagesView()
    await flushPromises()

    // Enter
    const enter = new Event('dragenter', { bubbles: true }) as DragEvent
    Object.defineProperty(enter, 'dataTransfer', { value: { types: ['Files'] } })
    document.dispatchEvent(enter)
    await nextTick()
    expect(wrapper.find('.images-view__dropzone').exists()).toBe(true)

    // Leave
    const leave = new Event('dragleave', { bubbles: true }) as DragEvent
    document.dispatchEvent(leave)
    await nextTick()

    expect(wrapper.find('.images-view__dropzone').exists()).toBe(false)
  })
})

describe('ImageUploadPopup – file handling', () => {
  let store: ReturnType<typeof useImagesStore>
  let pinia: ReturnType<typeof createPinia>
  let router: ReturnType<typeof createTestRouter>

  beforeEach(async () => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    router = createTestRouter()
    router.push('/images')
    await router.isReady()
    store = useImagesStore()
    // Stub URL.createObjectURL / revokeObjectURL
    vi.stubGlobal('URL', {
      ...globalThis.URL,
      createObjectURL: vi.fn(() => 'blob:preview'),
      revokeObjectURL: vi.fn(),
    })
  })

  async function mountUpload(initialFiles: File[] = []) {
    // Mount with show=false first, then toggle to true so the watcher fires
    const wrapper = mount(ImageUploadPopup, {
      props: { show: false, initialFiles: [] as File[] },
      ...mountOptions(router, pinia),
    })
    await wrapper.setProps({ show: true, initialFiles })
    await nextTick()
    await flushPromises()
    return wrapper
  }

  it('populates file list from initialFiles', async () => {
    const files = [
      new File(['a'], 'a.png', { type: 'image/png' }),
      new File(['b'], 'b.jpg', { type: 'image/jpeg' }),
    ]
    const wrapper = await mountUpload(files)

    const items = wrapper.findAll('.image-upload__file-item')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toContain('a.png')
    expect(items[1].text()).toContain('b.jpg')
  })

  it('pre-fills title from filename (without extension)', async () => {
    const wrapper = await mountUpload([new File(['x'], 'my-photo.png', { type: 'image/png' })])

    const titleInput = wrapper.find('.image-upload__form input')
    expect(titleInput.exists()).toBe(true)
    expect((titleInput.element as HTMLInputElement).value).toBe('my-photo')
  })

  it('pre-fills tags from currently selected tags in store', async () => {
    store.selectedTags = ['nature', 'sky']
    const wrapper = await mountUpload([new File(['x'], 'test.png', { type: 'image/png' })])

    // The tags input should contain space-separated selected tags
    const inputs = wrapper.findAll('.image-upload__form input')
    const tagsInput = inputs.find(i => (i.element as HTMLInputElement).value.includes('nature'))
    expect(tagsInput).toBeDefined()
    expect((tagsInput!.element as HTMLInputElement).value).toBe('nature sky')
  })

  it('uploads current file with metadata', async () => {
    mockApi.uploadImage.mockResolvedValueOnce(undefined)
    mockApi.fetchImages.mockResolvedValue({ images: [], metadata: {} })

    store.selectedTags = ['landscape']
    const file = new File(['data'], 'test.jpg', { type: 'image/jpeg' })
    const wrapper = await mountUpload([file])

    // Find and click upload button
    const buttons = wrapper.findAll('button')
    const uploadBtn = buttons.find(b => b.text().includes('Prześlij'))
    expect(uploadBtn).toBeDefined()

    await uploadBtn!.trigger('click')
    await flushPromises()

    expect(mockApi.uploadImage).toHaveBeenCalledWith(
      file,
      expect.objectContaining({
        title: 'test',
        tags: 'landscape',
      }),
    )
  })

  it('removes a file from the list', async () => {
    const files = [
      new File(['a'], 'a.png', { type: 'image/png' }),
      new File(['b'], 'b.png', { type: 'image/png' }),
    ]
    const wrapper = await mountUpload(files)

    // Click the remove link on first file
    const removeLinks = wrapper.findAll('.image-upload__file-item a')
    expect(removeLinks).toHaveLength(2)
    await removeLinks[0].trigger('click')
    await nextTick()

    const items = wrapper.findAll('.image-upload__file-item')
    expect(items).toHaveLength(1)
    expect(items[0].text()).toContain('b.png')
  })
})

describe('ImagesToolbar – search filtering', () => {
  let store: ReturnType<typeof useImagesStore>
  let pinia: ReturnType<typeof createPinia>
  let router: ReturnType<typeof createTestRouter>

  beforeEach(async () => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    vi.useFakeTimers()
    router = createTestRouter()
    router.push('/images')
    await router.isReady()
    store = useImagesStore()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function mountToolbar() {
    return mount(ImagesToolbar, mountOptions(router, pinia))
  }

  it('debounces search input and calls setPhrase', async () => {
    const wrapper = mountToolbar()

    const input = wrapper.find('input')
    await input.setValue('sunset')

    // Before debounce fires
    expect(store.phrase).toBe('')

    vi.advanceTimersByTime(300)
    await flushPromises()

    expect(store.phrase).toBe('sunset')
    expect(mockApi.fetchImages).toHaveBeenCalled()
  })

  it('clears search on clear button click', async () => {
    const wrapper = mountToolbar()

    const input = wrapper.find('input')
    await input.setValue('query')
    vi.advanceTimersByTime(300)
    await flushPromises()

    const clearLink = wrapper.find('.images-toolbar__clear')
    expect(clearLink.exists()).toBe(true)
    await clearLink.trigger('click')
    await nextTick()

    expect(store.phrase).toBe('')
  })

  it('switches between grid and list view', async () => {
    const wrapper = mountToolbar()
    expect(store.viewMode).toBe('grid')

    const buttons = wrapper.findAll('button')
    const listBtn = buttons.find(b => b.find('.fa-list').exists())
    expect(listBtn).toBeDefined()

    await listBtn!.trigger('click')
    expect(store.viewMode).toBe('list')

    const gridBtn = buttons.find(b => b.find('.fa-dice-four').exists())
    await gridBtn!.trigger('click')
    expect(store.viewMode).toBe('grid')
  })
})

describe('ImagesSidebar – tag filtering', () => {
  let store: ReturnType<typeof useImagesStore>
  let pinia: ReturnType<typeof createPinia>
  let router: ReturnType<typeof createTestRouter>

  beforeEach(async () => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    router = createTestRouter()
    router.push('/images')
    await router.isReady()
    store = useImagesStore()
    store.tags = makeTags('nature', 'sky', 'portrait', 'landscape')
  })

  function mountSidebar() {
    return mount(ImagesSidebar, mountOptions(router, pinia))
  }

  it('renders all tags sorted by count', () => {
    const wrapper = mountSidebar()
    const tags = wrapper.findAll('.images-sidebar__tag')
    expect(tags).toHaveLength(4)
    expect(tags[0].text()).toContain('nature')
  })

  it('toggles tag selection on click', async () => {
    const wrapper = mountSidebar()

    const tagLinks = wrapper.findAll('.images-sidebar__tag a')
    await tagLinks[0].trigger('click')
    await flushPromises()

    expect(store.selectedTags).toContain('nature')

    // Click again to deselect
    await tagLinks[0].trigger('click')
    await flushPromises()

    expect(store.selectedTags).not.toContain('nature')
  })

  it('highlights active tags', async () => {
    store.selectedTags = ['sky']
    const wrapper = mountSidebar()
    await nextTick()

    const tags = wrapper.findAll('.images-sidebar__tag')
    const skyTag = tags.find(t => t.text().includes('sky'))
    expect(skyTag?.classes()).toContain('images-sidebar__tag--active')
  })

  it('filters tags by search input', async () => {
    const wrapper = mountSidebar()

    const input = wrapper.find('.images-sidebar__search input')
    await input.setValue('por')
    await nextTick()

    const tags = wrapper.findAll('.images-sidebar__tag')
    expect(tags).toHaveLength(1)
    expect(tags[0].text()).toContain('portrait')
  })

  it('shows clear button when tags are selected', async () => {
    store.selectedTags = ['nature']
    const wrapper = mountSidebar()
    await nextTick()

    const clearLink = wrapper.find('.images-sidebar__clear')
    expect(clearLink.exists()).toBe(true)

    await clearLink.trigger('click')
    await flushPromises()

    expect(store.selectedTags).toEqual([])
  })
})

describe('ImagesSubmenu – collection filtering', () => {
  let store: ReturnType<typeof useImagesStore>
  let pinia: ReturnType<typeof createPinia>
  let router: ReturnType<typeof createTestRouter>

  beforeEach(async () => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    router = createTestRouter()
    router.push('/images')
    await router.isReady()
    store = useImagesStore()
    store.collections = makeCollections('favorites', 'wallpapers', 'icons')
  })

  function mountSubmenu() {
    return mount(ImagesSubmenu, mountOptions(router, pinia))
  }

  it('renders "All" plus each collection', () => {
    const wrapper = mountSubmenu()
    const items = wrapper.findAll('li')
    // All + 3 collections + add button
    expect(items.length).toBeGreaterThanOrEqual(4)
    expect(items[0].text()).toContain('Wszystkie')
    expect(items[1].text()).toContain('favorites')
  })

  it('selects a collection on click', async () => {
    const wrapper = mountSubmenu()
    const links = wrapper.findAll('a')
    const favLink = links.find(l => l.text().includes('favorites'))
    await favLink!.trigger('click')
    await flushPromises()

    expect(store.selectedCollection).toBe('favorites')
  })

  it('clears collection when "All" is clicked', async () => {
    store.selectedCollection = 'favorites'
    const wrapper = mountSubmenu()

    const allLink = wrapper.findAll('a').find(l => l.text().trim() === 'Wszystkie')
    await allLink!.trigger('click')
    await flushPromises()

    expect(store.selectedCollection).toBe('')
  })

  it('setting a collection clears selected tags', async () => {
    store.selectedTags = ['nature', 'sky']
    const wrapper = mountSubmenu()

    const links = wrapper.findAll('a')
    const favLink = links.find(l => l.text().includes('wallpapers'))
    await favLink!.trigger('click')
    await flushPromises()

    expect(store.selectedTags).toEqual([])
    expect(store.selectedCollection).toBe('wallpapers')
  })

  it('highlights active collection', async () => {
    store.selectedCollection = 'icons'
    const wrapper = mountSubmenu()
    await nextTick()

    const links = wrapper.findAll('a')
    const iconsLink = links.find(l => l.text().includes('icons'))
    expect(iconsLink?.classes()).toContain('active')
  })
})

describe('ImageCard – selection interactions', () => {
  let store: ReturnType<typeof useImagesStore>
  let pinia: ReturnType<typeof createPinia>
  let router: ReturnType<typeof createTestRouter>

  beforeEach(async () => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    router = createTestRouter()
    router.push('/images')
    await router.isReady()
    store = useImagesStore()
    store.images = [makeImage('a'), makeImage('b'), makeImage('c'), makeImage('d')]
  })

  function mountCard(image: IImage) {
    return mount(ImageCard, {
      props: { image },
      ...mountOptions(router, pinia),
    })
  }

  it('emits open on plain click', async () => {
    const img = makeImage('a')
    const wrapper = mountCard(img)

    await wrapper.find('.image-card').trigger('click')

    expect(wrapper.emitted('open')).toBeTruthy()
    expect(wrapper.emitted('open')![0]).toEqual([img])
  })

  it('toggles selection on ctrl+click', async () => {
    const wrapper = mountCard(makeImage('a'))

    await wrapper.find('.image-card').trigger('click', { ctrlKey: true })
    expect(store.selectedIds.has('a')).toBe(true)

    await wrapper.find('.image-card').trigger('click', { ctrlKey: true })
    expect(store.selectedIds.has('a')).toBe(false)
  })

  it('shift+click selects a range', async () => {
    store.toggleSelect('a') // set lastSelectedId

    const wrapper = mountCard(makeImage('c'))
    await wrapper.find('.image-card').trigger('click', { shiftKey: true })

    expect(store.selectedIds.has('a')).toBe(true)
    expect(store.selectedIds.has('b')).toBe(true)
    expect(store.selectedIds.has('c')).toBe(true)
    expect(store.selectedIds.has('d')).toBe(false)
  })

  it('checkbox click toggles selection without opening', async () => {
    const wrapper = mountCard(makeImage('b'))

    await wrapper.find('.image-card__checkbox').trigger('click')

    expect(store.selectedIds.has('b')).toBe(true)
    expect(wrapper.emitted('open')).toBeFalsy()
  })

  it('shows selected state via CSS class', async () => {
    store.toggleSelect('a')
    const wrapper = mountCard(makeImage('a'))

    expect(wrapper.find('.image-card--selected').exists()).toBe(true)
  })

  it('shows deleted state via CSS class', () => {
    const wrapper = mountCard(makeImage('x', { isDeleted: true }))
    expect(wrapper.find('.image-card--deleted').exists()).toBe(true)
  })

  it('ctrl+click from empty selection emits open (all new)', async () => {
    const wrapper = mountCard(makeImage('a'))

    await wrapper.find('.image-card').trigger('click', { ctrlKey: true })

    expect(store.selectedIds.has('a')).toBe(true)
    expect(wrapper.emitted('open')).toBeTruthy()
    expect(wrapper.emitted('open')![0][0]).toMatchObject({ _id: 'a' })
  })

  it('ctrl+click to add to existing selection does NOT emit open', async () => {
    store.toggleSelect('b')
    const wrapper = mountCard(makeImage('a'))

    await wrapper.find('.image-card').trigger('click', { ctrlKey: true })

    expect(store.selectedIds.has('a')).toBe(true)
    expect(store.selectedIds.has('b')).toBe(true)
    expect(wrapper.emitted('open')).toBeFalsy()
  })

  it('ctrl+click to deselect last item does NOT emit open', async () => {
    store.toggleSelect('a')
    const wrapper = mountCard(makeImage('a'))

    await wrapper.find('.image-card').trigger('click', { ctrlKey: true })

    expect(store.selectedIds.has('a')).toBe(false)
    expect(store.selectedCount).toBe(0)
    expect(wrapper.emitted('open')).toBeFalsy()
  })

  it('ctrl+click to deselect one of many does NOT emit open', async () => {
    store.toggleSelect('a')
    store.toggleSelect('b')
    const wrapper = mountCard(makeImage('a'))

    await wrapper.find('.image-card').trigger('click', { ctrlKey: true })

    expect(store.selectedIds.has('a')).toBe(false)
    expect(store.selectedIds.has('b')).toBe(true)
    expect(wrapper.emitted('open')).toBeFalsy()
  })

  it('plain click when images are selected changes selection and emits open', async () => {
    store.toggleSelect('b')
    store.toggleSelect('c')
    const wrapper = mountCard(makeImage('a'))

    await wrapper.find('.image-card').trigger('click')

    expect(store.selectedIds.has('a')).toBe(true)
    expect(store.selectedIds.has('b')).toBe(false)
    expect(store.selectedIds.has('c')).toBe(false)
    expect(wrapper.emitted('open')).toBeTruthy()
  })

  it('shift+click from empty selection emits open for first', async () => {
    const wrapper = mountCard(makeImage('c'))

    await wrapper.find('.image-card').trigger('click', { shiftKey: true })

    expect(store.selectedCount).toBeGreaterThan(0)
    // Should emit open since all items are new to selection
    expect(wrapper.emitted('open')).toBeTruthy()
  })
})

describe('ImagesList – selection interactions', () => {
  let store: ReturnType<typeof useImagesStore>
  let pinia: ReturnType<typeof createPinia>
  let router: ReturnType<typeof createTestRouter>

  beforeEach(async () => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    router = createTestRouter()
    router.push('/images')
    await router.isReady()
    store = useImagesStore()
    store.images = [
      makeImage('a', { tags: [{ name: 'nature', count: 5 }], meta: { originalName: '', mimeType: '', fileSize: 2048, width: 800, height: 600, density: 72, aspect: 1.33 } }),
      makeImage('b'),
      makeImage('c'),
    ]
  })

  function mountList() {
    return mount(ImagesList, mountOptions(router, pinia))
  }

  it('renders a row per image', () => {
    const wrapper = mountList()
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(3)
  })

  it('emits open on plain row click', async () => {
    const wrapper = mountList()
    const rows = wrapper.findAll('tbody tr')
    await rows[0].trigger('click')

    expect(wrapper.emitted('open')).toBeTruthy()
  })

  it('toggles selection on ctrl+click row', async () => {
    const wrapper = mountList()
    const rows = wrapper.findAll('tbody tr')
    await rows[0].trigger('click', { ctrlKey: true })

    expect(store.selectedIds.has('a')).toBe(true)
  })

  it('shift+click row selects range', async () => {
    store.toggleSelect('a')
    const wrapper = mountList()

    const rows = wrapper.findAll('tbody tr')
    await rows[2].trigger('click', { shiftKey: true })

    expect(store.selectedIds.has('a')).toBe(true)
    expect(store.selectedIds.has('b')).toBe(true)
    expect(store.selectedIds.has('c')).toBe(true)
  })

  it('header checkbox selects all / deselects all', async () => {
    const wrapper = mountList()

    const headerCheckbox = wrapper.find('thead input[type="checkbox"]')
    await headerCheckbox.trigger('change')
    expect(store.selectedCount).toBe(3)

    await headerCheckbox.trigger('change')
    expect(store.selectedCount).toBe(0)
  })

  it('selected row has selected class', async () => {
    store.toggleSelect('a')
    const wrapper = mountList()

    const rows = wrapper.findAll('tbody tr')
    expect(rows[0].classes()).toContain('admin-table__row--selected')
  })

  it('shows empty state when no images', async () => {
    store.images = []
    const wrapper = mountList()

    expect(wrapper.text()).toContain('Nie znaleziono obrazów')
  })

  it('ctrl+click from empty selection emits open (all new)', async () => {
    const wrapper = mountList()
    const rows = wrapper.findAll('tbody tr')

    await rows[0].trigger('click', { ctrlKey: true })

    expect(store.selectedIds.has('a')).toBe(true)
    expect(wrapper.emitted('open')).toBeTruthy()
    expect(wrapper.emitted('open')![0][0]).toMatchObject({ _id: 'a' })
  })

  it('ctrl+click to add to existing selection does NOT emit open', async () => {
    store.toggleSelect('b')
    const wrapper = mountList()
    const rows = wrapper.findAll('tbody tr')

    await rows[0].trigger('click', { ctrlKey: true })

    expect(store.selectedIds.has('a')).toBe(true)
    expect(store.selectedIds.has('b')).toBe(true)
    expect(wrapper.emitted('open')).toBeFalsy()
  })

  it('ctrl+click to deselect last item does NOT emit open', async () => {
    store.toggleSelect('a')
    const wrapper = mountList()
    const rows = wrapper.findAll('tbody tr')

    await rows[0].trigger('click', { ctrlKey: true })

    expect(store.selectedIds.has('a')).toBe(false)
    expect(store.selectedCount).toBe(0)
    expect(wrapper.emitted('open')).toBeFalsy()
  })

  it('ctrl+click to deselect one of many does NOT emit open', async () => {
    store.toggleSelect('a')
    store.toggleSelect('b')
    const wrapper = mountList()
    const rows = wrapper.findAll('tbody tr')

    await rows[0].trigger('click', { ctrlKey: true })

    expect(store.selectedIds.has('a')).toBe(false)
    expect(store.selectedIds.has('b')).toBe(true)
    expect(wrapper.emitted('open')).toBeFalsy()
  })

  it('plain click when images are selected changes selection and emits open', async () => {
    store.toggleSelect('b')
    store.toggleSelect('c')
    const wrapper = mountList()
    const rows = wrapper.findAll('tbody tr')

    await rows[0].trigger('click')

    expect(store.selectedIds.has('a')).toBe(true)
    expect(store.selectedIds.has('b')).toBe(false)
    expect(store.selectedIds.has('c')).toBe(false)
    expect(wrapper.emitted('open')).toBeTruthy()
    expect(wrapper.emitted('open')![0][0]).toMatchObject({ _id: 'a' })
  })

  it('shift+click from empty selection emits open for first', async () => {
    const wrapper = mountList()
    const rows = wrapper.findAll('tbody tr')

    await rows[2].trigger('click', { shiftKey: true })

    expect(store.selectedCount).toBeGreaterThan(0)
    expect(wrapper.emitted('open')).toBeTruthy()
  })

  it('shift+click extending existing selection does NOT emit open', async () => {
    store.toggleSelect('a')
    const wrapper = mountList()
    const rows = wrapper.findAll('tbody tr')

    await rows[2].trigger('click', { shiftKey: true })

    expect(store.selectedIds.has('a')).toBe(true)
    expect(store.selectedIds.has('c')).toBe(true)
    expect(wrapper.emitted('open')).toBeFalsy()
  })
})

describe('ImagesBatchPanel – batch edit operations', () => {
  let store: ReturnType<typeof useImagesStore>
  let pinia: ReturnType<typeof createPinia>
  let router: ReturnType<typeof createTestRouter>

  beforeEach(async () => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    router = createTestRouter()
    router.push('/images')
    await router.isReady()
    store = useImagesStore()
    store.images = [
      makeImage('a', { tags: [{ name: 'nature', count: 5 }, { name: 'sky', count: 3 }], collections: [{ name: 'favorites', count: 2 }] }),
      makeImage('b', { tags: [{ name: 'nature', count: 5 }, { name: 'portrait', count: 1 }], collections: [{ name: 'wallpapers', count: 4 }] }),
      makeImage('c'),
    ]
    store.toggleSelect('a')
    store.toggleSelect('b')
  })

  function mountBatch() {
    return mount(ImagesBatchPanel, mountOptions(router, pinia))
  }

  it('shows count of selected images', () => {
    const wrapper = mountBatch()
    expect(wrapper.text()).toContain('Edycja zbiorcza (2)')
  })

  it('shows union of tags across selected images', () => {
    const wrapper = mountBatch()
    const chips = wrapper.findAll('.images-batch-panel__chip')
    const chipText = chips.map(c => c.text())

    expect(chipText).toContain('nature')
    expect(chipText).toContain('sky')
    expect(chipText).toContain('portrait')
  })

  it('shows union of collections across selected images', () => {
    const wrapper = mountBatch()
    expect(wrapper.text()).toContain('favorites')
    expect(wrapper.text()).toContain('wallpapers')
  })

  it('marks tag for removal on chip click', async () => {
    const wrapper = mountBatch()
    const chips = wrapper.findAll('.images-batch-panel__chip')
    const natureChip = chips.find(c => c.text().includes('nature'))

    await natureChip!.trigger('click')
    await nextTick()

    expect(natureChip!.classes()).toContain('images-batch-panel__chip--marked')
  })

  it('applies batch update with tags to add and remove', async () => {
    mockApi.batchUpdateImages.mockResolvedValueOnce(undefined)
    mockApi.fetchImages.mockResolvedValue({ images: [], metadata: {} })

    const wrapper = mountBatch()

    // Type tags to add
    const inputs = wrapper.findAll('input')
    const addTagsInput = inputs.find(i =>
      (i.element as HTMLInputElement).placeholder?.includes('Tagi do dodania'),
    )
    await addTagsInput!.setValue('urban city')

    // Mark 'nature' for removal
    const chips = wrapper.findAll('.images-batch-panel__chip')
    const natureChip = chips.find(c => c.text().includes('nature'))
    await natureChip!.trigger('click')

    // Click Apply
    const applyBtn = wrapper.findAll('button').find(b => b.text().includes('Zastosuj'))
    await applyBtn!.trigger('click')
    await flushPromises()

    expect(mockApi.batchUpdateImages).toHaveBeenCalledWith(
      expect.objectContaining({
        ids: expect.arrayContaining(['a', 'b']),
        tagsToAdd: expect.arrayContaining([{ name: 'urban' }, { name: 'city' }]),
        tagsToRemove: [{ name: 'nature' }],
      }),
    )
  })

  it('applies batch update with collections to add', async () => {
    mockApi.batchUpdateImages.mockResolvedValueOnce(undefined)
    mockApi.fetchImages.mockResolvedValue({ images: [], metadata: {} })

    const wrapper = mountBatch()

    const inputs = wrapper.findAll('input')
    const addColInput = inputs.find(i =>
      (i.element as HTMLInputElement).placeholder?.includes('Kolekcje do dodania'),
    )
    await addColInput!.setValue('new-col, another')

    const applyBtn = wrapper.findAll('button').find(b => b.text().includes('Zastosuj'))
    await applyBtn!.trigger('click')
    await flushPromises()

    expect(mockApi.batchUpdateImages).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionsToAdd: expect.arrayContaining([{ name: 'new-col' }, { name: 'another' }]),
      }),
    )
  })

  it('is hidden when no images are selected', async () => {
    store.deselectAll()
    const wrapper = mountBatch()
    await nextTick()

    expect(wrapper.find('.images-batch-panel').exists()).toBe(false)
  })

  it('clears form after successful apply', async () => {
    mockApi.batchUpdateImages.mockResolvedValueOnce(undefined)
    mockApi.fetchImages.mockResolvedValue({ images: [], metadata: {} })

    const wrapper = mountBatch()

    const inputs = wrapper.findAll('input')
    const addTagsInput = inputs.find(i =>
      (i.element as HTMLInputElement).placeholder?.includes('Tagi do dodania'),
    )
    await addTagsInput!.setValue('test')

    const applyBtn = wrapper.findAll('button').find(b => b.text().includes('Zastosuj'))
    await applyBtn!.trigger('click')
    await flushPromises()

    // After apply, selections are cleared so the panel hides
    expect(store.selectedCount).toBe(0)
  })
})

describe('ImagesBatchFooter – selection bar', () => {
  let store: ReturnType<typeof useImagesStore>
  let pinia: ReturnType<typeof createPinia>
  let router: ReturnType<typeof createTestRouter>

  beforeEach(async () => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    router = createTestRouter()
    router.push('/images')
    await router.isReady()
    store = useImagesStore()
    store.images = [makeImage('a'), makeImage('b'), makeImage('c')]
    store.toggleSelect('a')
    store.toggleSelect('b')
  })

  function mountFooter() {
    return mount(ImagesBatchFooter, mountOptions(router, pinia))
  }

  it('shows selected count', () => {
    const wrapper = mountFooter()
    expect(wrapper.text()).toContain('Zaznaczono 2 obrazy')
  })

  it('singular when 1 selected', async () => {
    store.deselectAll()
    store.toggleSelect('a')
    const wrapper = mountFooter()
    expect(wrapper.text()).toContain('Zaznaczono 1 obraz')
  })

  it('deselect link clears selection', async () => {
    const wrapper = mountFooter()
    const deselectLink = wrapper.findAll('a').find(a => a.text().includes('Odznacz'))

    await deselectLink!.trigger('click')

    expect(store.selectedCount).toBe(0)
  })

  it('is hidden when nothing is selected', async () => {
    store.deselectAll()
    const wrapper = mountFooter()
    expect(wrapper.find('.images-batch-footer').exists()).toBe(false)
  })

  it('batch edit button navigates to batch route', async () => {
    const wrapper = mountFooter()
    const batchBtn = wrapper.findAll('button').find(b => b.text().includes('Edycja zbiorcza'))

    await batchBtn!.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/images/batch')
  })

  it('delete selected shows confirmation popup', async () => {
    const wrapper = mountFooter()
    const deleteBtn = wrapper.findAll('button').find(b => b.text().includes('Usuń'))

    await deleteBtn!.trigger('click')
    await nextTick()

    expect(wrapper.text()).toContain('Potwierdź usuwanie zbiorcze')
    expect(wrapper.text()).toContain('Czy na pewno chcesz usunąć 2 obrazy')
  })

  it('confirming batch delete calls store.batchDelete', async () => {
    mockApi.deleteImage.mockResolvedValue(undefined)
    mockApi.fetchImages.mockResolvedValue({ images: [], metadata: {} })

    const wrapper = mountFooter()

    // Open confirm
    const deleteBtn = wrapper.findAll('button').find(b => b.text().includes('Usuń zaznaczone'))
    await deleteBtn!.trigger('click')
    await nextTick()

    // Click "Yes, delete all"
    const confirmBtn = wrapper.findAll('button').find(b => b.text().includes('Tak, usuń wszystkie'))
    await confirmBtn!.trigger('click')
    await flushPromises()

    expect(mockApi.deleteImage).toHaveBeenCalledWith('a', false)
    expect(mockApi.deleteImage).toHaveBeenCalledWith('b', false)
    expect(store.selectedCount).toBe(0)
  })
})

describe('ImagesGrid – rectangle selection and empty state', () => {
  let store: ReturnType<typeof useImagesStore>
  let pinia: ReturnType<typeof createPinia>
  let router: ReturnType<typeof createTestRouter>

  beforeEach(async () => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    router = createTestRouter()
    router.push('/images')
    await router.isReady()
    store = useImagesStore()
  })

  function mountGrid() {
    return mount(ImagesGrid, mountOptions(router, pinia))
  }

  it('shows empty state when no images', () => {
    store.images = []
    const wrapper = mountGrid()
    expect(wrapper.find('.images-grid__empty').exists()).toBe(true)
    expect(wrapper.text()).toContain('Nie znaleziono obrazów')
  })

  it('renders image cards for each image', () => {
    store.images = [makeImage('a'), makeImage('b'), makeImage('c')]
    const wrapper = mountGrid()

    const cards = wrapper.findAll('.image-card')
    expect(cards).toHaveLength(3)
  })

  it('plain click on blank space deselects all', async () => {
    store.images = [makeImage('a')]
    store.toggleSelect('a')
    const wrapper = mountGrid()

    const area = wrapper.find('.images-grid-area')

    // Simulate mousedown on blank area then mouseup (no drag)
    await area.trigger('mousedown', { button: 0, clientX: 0, clientY: 0 })

    // Trigger mouseup on document
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 0, clientY: 0 }))
    await nextTick()

    expect(store.selectedCount).toBe(0)
  })
})

describe('Integration – full filtering flow', () => {
  let store: ReturnType<typeof useImagesStore>
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    store = useImagesStore()
  })

  it('search + tag filter builds correct API call', async () => {
    store.setPhrase('sunset')
    await flushPromises()

    store.toggleTag('nature')
    await flushPromises()

    // fetchImages should have been called with both phrase and tag
    const lastCall = mockApi.fetchImages.mock.calls.at(-1)?.[0]
    expect(lastCall).toMatchObject({
      phrase: 'sunset',
      tags: ['nature'],
    })
  })

  it('setting collection clears tags in API call', async () => {
    store.toggleTag('sky')
    await flushPromises()

    store.setCollection('wallpapers')
    await flushPromises()

    const lastCall = mockApi.fetchImages.mock.calls.at(-1)?.[0]
    expect(lastCall).toMatchObject({
      tags: [],
      collection: 'wallpapers',
    })
  })

  it('sort change triggers new fetch', async () => {
    vi.clearAllMocks()
    store.setSort('title', 1)
    await flushPromises()

    expect(mockApi.fetchImages).toHaveBeenCalledWith(
      expect.objectContaining({
        sortBy: 'title',
        sortDirection: 1,
      }),
    )
  })

  it('toggleShowDeleted triggers new fetch with deleted flag', async () => {
    vi.clearAllMocks()
    store.toggleShowDeleted()
    await flushPromises()

    expect(mockApi.fetchImages).toHaveBeenCalledWith(
      expect.objectContaining({
        deleted: true,
        active: false,
      }),
    )
  })
})
