import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockOn = vi.fn()
const mockOff = vi.fn()
const mockCall = vi.fn()
const mockOnReconnect = vi.fn()
const mockOffReconnect = vi.fn()

vi.mock('@/stores/gate/gate.store', () => ({
  useGateStore: vi.fn(() => ({
    socket: { on: mockOn, off: mockOff, connected: true, emit: vi.fn(), once: vi.fn() },
    call: mockCall,
    onReconnect: mockOnReconnect,
    offReconnect: mockOffReconnect,
  })),
}))

import { useCollection } from '../useCollection'

function getHandler(name: string) {
  return mockOn.mock.calls.find((c: any) => c[0] === name)?.[1]
}

describe('useCollection', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('rejestruje handlery i subskrybuje przy start()', () => {
    const col = useCollection('matches')
    col.start()

    expect(mockOn).toHaveBeenCalledWith('collection-init', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('collection-add', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('collection-update', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('collection-delete', expect.any(Function))
    expect(mockCall).toHaveBeenCalledWith('subscribe', {
      tickets: [{ collection: 'matches', filter: {} }],
    })
    expect(mockOnReconnect).toHaveBeenCalled()
  })

  it('nie subskrybuje ponownie przy drugim start()', () => {
    const col = useCollection('matches')
    col.start()
    col.start()
    expect(mockCall).toHaveBeenCalledTimes(1)
  })

  it('reaguje tylko na swoją kolekcję', () => {
    const col = useCollection('matches')
    col.start()
    getHandler('collection-init')('matches', [{ _id: 'a' }, { _id: 'b' }])
    expect(col.docs.value).toHaveLength(2)

    getHandler('collection-init')('other', [{ _id: 'x' }])
    expect(col.docs.value).toHaveLength(2)
  })

  it('add deduplikuje po _id', () => {
    const col = useCollection('matches')
    col.start()
    getHandler('collection-add')('matches', { _id: 'a' })
    getHandler('collection-add')('matches', { _id: 'a' })
    expect(col.docs.value).toHaveLength(1)
  })

  it('update podmienia istniejący dokument', () => {
    const col = useCollection('matches')
    col.start()
    getHandler('collection-add')('matches', { _id: 'a', phase: 'lobby' })
    getHandler('collection-update')('matches', { _id: 'a', phase: 'planning' })
    expect(col.docs.value[0].phase).toBe('planning')
  })

  it('update dodaje dokument, jeśli go jeszcze nie ma (widok nowej rundy)', () => {
    const col = useCollection('match_views')
    col.start()
    getHandler('collection-update')('match_views', { _id: 'v1', round: 1 })
    expect(col.docs.value).toHaveLength(1)
  })

  it('delete usuwa dokument', () => {
    const col = useCollection('matches')
    col.start()
    getHandler('collection-add')('matches', { _id: 'a' })
    getHandler('collection-delete')('matches', 'a')
    expect(col.docs.value).toHaveLength(0)
  })

  it('stop odpina, wysyła unsubscribe i czyści', () => {
    const col = useCollection('matches')
    col.start()
    getHandler('collection-add')('matches', { _id: 'a' })
    col.stop()

    expect(mockCall).toHaveBeenCalledWith('unsubscribe', { collections: ['matches'] })
    expect(mockOffReconnect).toHaveBeenCalled()
    expect(col.docs.value).toHaveLength(0)
  })
})
