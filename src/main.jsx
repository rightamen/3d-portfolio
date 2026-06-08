import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Admin from './Admin.jsx'
import App from './App.jsx'

const chunkReloadKey = 'mrright-chunk-reload-attempted-at'
const chunkReloadCooldownMs = 60 * 1000
const chunkLoadPatterns = [
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /Loading chunk .* failed/i,
  /error loading dynamically imported module/i,
]

const getErrorMessage = (error) => {
  if (!error) return ''
  if (typeof error === 'string') return error
  if (error.message) return error.message
  if (error.reason) return getErrorMessage(error.reason)
  return String(error)
}

const isChunkLoadError = (error) =>
  chunkLoadPatterns.some((pattern) => pattern.test(getErrorMessage(error)))

const reloadOnceForFreshChunks = () => {
  const lastReloadAt = Number(window.sessionStorage.getItem(chunkReloadKey) || 0)
  if (Date.now() - lastReloadAt < chunkReloadCooldownMs) return

  window.sessionStorage.setItem(chunkReloadKey, String(Date.now()))
  window.location.reload()
}

window.addEventListener('error', (event) => {
  if (isChunkLoadError(event.error || event.message)) reloadOnceForFreshChunks()
})

window.addEventListener('unhandledrejection', (event) => {
  if (isChunkLoadError(event.reason)) reloadOnceForFreshChunks()
})

window.addEventListener('load', () => {
  window.setTimeout(() => {
    window.sessionStorage.removeItem(chunkReloadKey)
  }, 15 * 1000)
})

const Root = window.location.pathname.startsWith('/admin') ? Admin : App

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
