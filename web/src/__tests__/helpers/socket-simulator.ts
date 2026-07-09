import { vi } from 'vitest'

export class SocketSimulator {
  private handlers = new Map<string, Set<Function>>()
  private emitted: Array<{ event: string; args: any[] }> = []
  connected = false

  readonly socket = {
    on: vi.fn((event: string, handler: Function) => {
      if (!this.handlers.has(event)) this.handlers.set(event, new Set())
      this.handlers.get(event)!.add(handler)
    }),
    once: vi.fn((event: string, handler: Function) => {
      const wrapper = (...args: any[]) => {
        this.handlers.get(event)?.delete(wrapper)
        handler(...args)
      }
      if (!this.handlers.has(event)) this.handlers.set(event, new Set())
      this.handlers.get(event)!.add(wrapper)
    }),
    off: vi.fn((event: string, handler: Function) => {
      this.handlers.get(event)?.delete(handler)
    }),
    emit: vi.fn((...args: any[]) => {
      this.emitted.push({ event: args[0], args: args.slice(1) })
    }),
    removeAllListeners: vi.fn(() => {
      this.handlers.clear()
    }),
    disconnect: vi.fn(),
    get connected() {
      return this.connected
    },
    set connected(v: boolean) {
      // noop — controlled via simulator
    },
  }

  constructor() {
    // Fix the connected getter to reference the simulator
    const self = this
    Object.defineProperty(this.socket, 'connected', {
      get: () => self.connected,
      set: () => {},
      configurable: true,
    })
  }

  /** Fire a server→client event */
  simulate(event: string, ...args: any[]) {
    const handlers = this.handlers.get(event)
    if (handlers) {
      handlers.forEach(handler => handler(...args))
    }
  }

  /** Get all client→server emissions for an event */
  getEmitted(event: string) {
    return this.emitted.filter(e => e.event === event).map(e => e.args)
  }

  /** Get all client→server emissions */
  getAllEmitted() {
    return this.emitted
  }

  clearEmitted() {
    this.emitted = []
  }

  /** Connect the socket and fire the connect event */
  connect() {
    this.connected = true
    this.simulate('connect')
  }
}

export function createIoMock(simulator: SocketSimulator) {
  return vi.fn(() => simulator.socket)
}
