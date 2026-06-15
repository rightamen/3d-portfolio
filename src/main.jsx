import { Component, StrictMode } from 'react'
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

class ChunkReloadBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    if (isChunkLoadError(error)) reloadOnceForFreshChunks()
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main className="flex min-h-screen items-center justify-center bg-primary px-6 text-center text-white">
        <section className="max-w-md rounded-2xl border border-white/10 bg-black-100/70 p-8">
          <p className="section-kicker">mrright.blog</p>
          <h1 className="mt-3 text-3xl font-bold">页面资源正在更新</h1>
          <p className="mt-4 text-neutral-400">
            如果页面没有自动恢复，请点击下方按钮重新加载最新版本。
          </p>
          <button
            type="button"
            className="primary-action mt-6 w-full"
            onClick={() => window.location.reload()}
          >
            重新加载
          </button>
        </section>
      </main>
    )
  }
}

const Root = window.location.pathname.startsWith('/admin') ? Admin : App

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ChunkReloadBoundary>
      <Root />
    </ChunkReloadBoundary>
  </StrictMode>,
)
