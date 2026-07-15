import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import api, { setToken, clearToken, getToken, errMsg } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // On boot, exchange any stored token for the live user record. This also
  // catches tokens that expired while the tab was closed.
  useEffect(() => {
    const token = getToken()
    if (!token) {
      setLoading(false)
      return
    }
    api
      .get('/auth/me')
      .then((res) => setUser(res.data.data))
      .catch(() => clearToken())
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email, password) => {
    try {
      const res = await api.post('/auth/login', { email, password })
      const { token, user: u } = res.data.data
      setToken(token)
      setUser(u)
      return { ok: true, user: u }
    } catch (e) {
      return { ok: false, message: errMsg(e) }
    }
  }, [])

  const logout = useCallback(() => {
    clearToken()
    setUser(null)
    window.location.href = '/login'
  }, [])

  const refresh = useCallback(async () => {
    const res = await api.get('/auth/me')
    setUser(res.data.data)
    return res.data.data
  }, [])

  const value = {
    user,
    loading,
    login,
    logout,
    refresh,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    isClient: user?.role === 'client',
    // Clients are read-only by definition; admins and users may raise queries.
    canRaiseQuery: user?.role === 'admin' || user?.role === 'user',
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
