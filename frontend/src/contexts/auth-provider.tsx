import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { auth } from '@/lib/api'
import type { User } from '@/types'

import { AuthContext, type LoginResult } from '@/contexts/auth-context'

const ME_RETRY_MS = 5_000

function isUnreachable(error: unknown): boolean {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status
  return typeof status !== 'number' || status >= 500
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'))
  const [isLoading, setIsLoading] = useState(true)
  const queryClient = useQueryClient()

  if (!token && (user !== null || isLoading)) {
    setUser(null)
    setIsLoading(false)
  }

  // Bumped to ask the server again for the user after it could not be reached.
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    const retry = () => setAttempt((count) => count + 1)
    auth.me()
      .then((me) => {
        if (cancelled) return
        setUser(me)
        setIsLoading(false)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        // Only an answer from the server says the token is bad. Dropping it on a network error would
        // also sign out the other desktop windows, which share this storage.
        if (isUnreachable(error)) {
          retryTimer = setTimeout(retry, ME_RETRY_MS)
          window.addEventListener('online', retry, { once: true })
          return
        }
        localStorage.removeItem('token')
        setToken(null)
        setIsLoading(false)
      })
    return () => {
      cancelled = true
      clearTimeout(retryTimer)
      window.removeEventListener('online', retry)
    }
  }, [token, attempt])

  // Sync token across tabs via storage events
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'token') {
        setToken(e.newValue)
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const data = await auth.login(email, password)

    if (data.requires_2fa) {
      return { requires_2fa: true, temp_token: data.temp_token, available_methods: data.available_methods }
    }

    const accessToken = data.access_token
    localStorage.setItem('token', accessToken)
    setToken(accessToken)
    const me = await auth.me()
    setUser(me)
    return { requires_2fa: false }
  }, [])

  const verify2fa = useCallback(async (tempToken: string, code: string) => {
    const data = await auth.verify2fa(tempToken, code)
    localStorage.setItem('token', data.access_token)
    setToken(data.access_token)
    const me = await auth.me()
    setUser(me)
  }, [])

  const loginWithToken = useCallback((accessToken: string) => {
    localStorage.setItem('token', accessToken)
    setToken(accessToken)
    auth.me().then(setUser).catch(() => {})
  }, [])

  const updateUser = useCallback((updatedUser: User) => {
    setUser(updatedUser)
  }, [])

  const register = useCallback(async (email: string, password: string, preferences?: Record<string, string>) => {
    await auth.register(email, password, preferences)
    await login(email, password)
  }, [login])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
    queryClient.clear()
  }, [queryClient])

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, verify2fa, loginWithToken, register, updateUser, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
