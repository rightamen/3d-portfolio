import { useCallback, useEffect, useState } from 'react'
import { getCurrentVisitor, logoutVisitor } from '../lib/api'

const tokenKey = 'mrright-visitor-token'
const readToken = () => window.localStorage.getItem(tokenKey) || ''
const initialSession = (token, attempt = 0) => ({
  token, attempt, user: null, status: token ? 'checking' : 'ready',
})

// Keep identity and verification state together. A changed token must never
// render the previous account while its own verification is still in flight.
export const useVisitorSession = () => {
  const [session, setSession] = useState(() => initialSession(readToken()))
  const { token, attempt } = session

  const syncToken = useCallback((retry = false) => {
    const stored = readToken()
    setSession((current) => {
      if (stored !== current.token) return initialSession(stored, current.attempt + 1)
      if (retry && stored && current.status === 'error') {
        return { ...current, status: 'checking', attempt: current.attempt + 1 }
      }
      return current
    })
  }, [])

  const retrySession = useCallback(() => syncToken(true), [syncToken])

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === tokenKey || event.key === null) syncToken()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') retrySession()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('online', retrySession)
    window.addEventListener('focus', retrySession)
    window.addEventListener('pageshow', retrySession)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('online', retrySession)
      window.removeEventListener('focus', retrySession)
      window.removeEventListener('pageshow', retrySession)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [retrySession, syncToken])

  useEffect(() => {
    if (!token) return undefined
    let active = true
    const update = (changes) => {
      setSession((current) => current.token === token && current.attempt === attempt
        ? { ...current, ...changes }
        : current)
    }
    const expire = () => {
      // A response for an old tab/account must not erase a newer credential.
      if (readToken() === token) window.localStorage.removeItem(tokenKey)
      update({ token: '', user: null, status: 'ready' })
    }

    getCurrentVisitor(token)
      .then((payload) => {
        if (!active) return
        if (payload.user === null) {
          expire()
        } else if (payload.user && typeof payload.user.id === 'string') {
          update({ user: payload.user, status: 'ready' })
        } else {
          // A malformed successful response does not prove the session expired.
          update({ status: 'error' })
        }
      })
      .catch((error) => {
        if (!active) return
        if (error.status === 401 || error.code === 'INVALID_TOKEN') expire()
        else update({ status: 'error' })
      })

    return () => { active = false }
  }, [attempt, token])

  const saveSession = useCallback((payload) => {
    window.localStorage.setItem(tokenKey, payload.session.token)
    setSession((current) => ({
      token: payload.session.token, user: payload.user, status: 'ready', attempt: current.attempt + 1,
    }))
  }, [])

  const logout = useCallback(() => {
    window.localStorage.removeItem(tokenKey)
    setSession((current) => initialSession('', current.attempt + 1))
    if (token) logoutVisitor(token).catch(() => {})
  }, [token])

  return {
    visitorToken: token,
    visitorUser: session.user,
    visitorLoading: session.status === 'checking',
    visitorSessionError: session.status === 'error',
    retrySession,
    saveSession,
    logout,
  }
}
