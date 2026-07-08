import { ref } from 'vue'
import { defineStore } from 'pinia'
import { io } from 'socket.io-client'
import router from '@/router'

const TOKEN_KEY = 'hydra_token'

export const useGateStore = defineStore('gate', () => {
  const socket = ref(null as any)
  const isAuthenticated = ref(false)
  const user = ref(null as any)
  const connected = ref(false)
  const authToken = ref(localStorage.getItem(TOKEN_KEY))
  const gateUrl = import.meta.env.VITE_GATE_URL || 'wss://localhost:4114'
  const registerError = ref(null as string | null)
  const registerSuccess = ref(false)
  const loginError = ref(null as string | null)
  const loginLoading = ref(false)

  const reconnectCallbacks = new Set<() => void>()

  // Restore session from saved token
  if (authToken.value) {
    isAuthenticated.value = true
  }

  function authenticate(userObject: any, token: string) {
    user.value = userObject
    authToken.value = token
    isAuthenticated.value = true
    localStorage.setItem(TOKEN_KEY, token)
  }

  function resetUser() {
    user.value = null
    isAuthenticated.value = false
    authToken.value = null
    localStorage.removeItem(TOKEN_KEY)
  }

  function connect() {
    if (socket.value) {
      socket.value.removeAllListeners()
      socket.value.disconnect()
    }

    if (authToken.value) {
      socket.value = io(gateUrl, {
        rememberUpgrade: true,
        auth: {
          token: authToken.value,
        },
      })
    } else {
      socket.value = io(gateUrl, {
        rememberUpgrade: true,
      })
    }

    socket.value.on('login-complete', (userData: any) => {
      loginError.value = null
      loginLoading.value = false
      authenticate(userData, userData.token)
      router.push('/')
      connect()
    })

    socket.value.on('login-stopped', ({ message }: { message: string }) => {
      loginError.value = message
      loginLoading.value = false
    })

    socket.value.on('register-complete', () => {
      registerError.value = null
      registerSuccess.value = true
    })

    socket.value.on('register-stopped', ({ message }: { message: string }) => {
      registerSuccess.value = false
      registerError.value = message
    })

    socket.value.on('logout-complete', ({ _id }: { _id: any }) => {
      if (_id === user.value?._id) {
        resetUser()
        router.push('/login')
        connect()
      }
    })

    socket.value.on('session', (userData: any) => {
      user.value = userData
      isAuthenticated.value = true
    })

    socket.value.on('connect', () => {
      connected.value = true
      reconnectCallbacks.forEach(cb => cb())
    })

    socket.value.on('disconnect', () => {
      connected.value = false
    })
  }

  function disconnect() {
    if (!socket.value?.connected) {
      return
    }
    socket.value.disconnect()
  }

  function call(...args: any[]) {
    if (!socket.value) return

    if (socket.value.connected) {
      socket.value.emit(...args)
    } else {
      socket.value.once('connect', () => {
        socket.value.emit(...args)
      })
    }
  }

  function onReconnect(callback: () => void) {
    reconnectCallbacks.add(callback)
  }

  function offReconnect(callback: () => void) {
    reconnectCallbacks.delete(callback)
  }

  return {
    socket,
    isAuthenticated,
    authToken,
    user,
    connected,
    registerError,
    registerSuccess,
    loginError,
    loginLoading,
    resetUser,
    authenticate,
    connect,
    disconnect,
    call,
    onReconnect,
    offReconnect,
  }
})
