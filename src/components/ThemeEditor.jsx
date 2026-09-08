import { useEffect, useRef, useState } from 'react'

import { getAccountTheme, getThemeOptions, saveAccountTheme } from '../lib/api'
import { getApiErrorMessage } from '../lib/i18n'
import { applyTheme } from '../lib/theme'

// The theme editor: an accent colour and two presets, previewed live.
//
// The presets come from GET /api/theme-options rather than a copy here, which
// is what stops the picker offering something the API would refuse. The
// preview is painted with the SAME tokens the real page uses, resolved by the
// server -- a preview that renders its own approximation is a preview that
// eventually lies.

const ThemeEditor = ({ authToken, copy }) => {
  const [options, setOptions] = useState(null)
  const [theme, setTheme] = useState(null)
  const [tokens, setTokens] = useState(null)
  const [status, setStatus] = useState('loading')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const previewRef = useRef(null)

  useEffect(() => {
    let isMounted = true

    Promise.all([getThemeOptions(), getAccountTheme(authToken)])
      .then(([optionsPayload, themePayload]) => {
        if (!isMounted) return
        setOptions(optionsPayload)
        setTheme(themePayload.theme)
        setTokens(themePayload.themeTokens)
        setStatus('ready')
      })
      .catch((error) => {
        if (!isMounted) return
        setStatus('error')
        setMessage(error.code ? getApiErrorMessage(error, copy) : copy.themeLoadError)
      })

    return () => {
      isMounted = false
    }
  }, [authToken, copy])

  useEffect(() => applyTheme(previewRef.current, tokens), [tokens])

  // Saving is what resolves a theme into tokens, so the preview updates from
  // the server's answer rather than from a second implementation here. It also
  // means an accent the server rejects never appears in the preview as though
  // it had been accepted.
  const save = (next) => {
    if (busy) return
    setBusy(true)
    setMessage('')

    saveAccountTheme(next, authToken)
      .then((payload) => {
        setTheme(payload.theme)
        setTokens(payload.themeTokens)
        setMessage(copy.themeSaved)
      })
      .catch((error) => {
        setMessage(error.code ? getApiErrorMessage(error, copy) : error.message)
      })
      .finally(() => setBusy(false))
  }

  if (status === 'loading') return <p className="text-neutral-400">{copy.loading}</p>
  if (status === 'error' || !theme) return <p className="text-coral">{message}</p>

  const update = (changes) => setTheme((current) => ({ ...current, ...changes }))

  return (
    <section className="theme-editor">
      <div className="admin-section-header">
        <h2>{copy.themeTitle}</h2>
      </div>
      <p className="text-neutral-400">{copy.themeIntro}</p>

      <div className="theme-editor-grid">
        <label>
          <span>{copy.themeAccent}</span>
          {/* A native colour input: it is keyboard operable, it is the control
              people already know, and it cannot produce a value that is not a
              hex colour. The server validates anyway. */}
          <input
            onChange={(event) => update({ accent: event.target.value })}
            type="color"
            value={theme.accent}
          />
          <code>{theme.accent}</code>
        </label>

        <label>
          <span>{copy.themeSurface}</span>
          <select onChange={(event) => update({ surface: event.target.value })} value={theme.surface}>
            {options.surfaces.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>{copy.themeFont}</span>
          <select onChange={(event) => update({ font: event.target.value })} value={theme.font}>
            {options.fonts.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="theme-preview work-page-themed" ref={previewRef}>
        <span className="theme-preview-label">{copy.themePreview}</span>
        <h3>{copy.themePreviewHeading}</h3>
        <p>{copy.themePreviewBody}</p>
        <button className="primary-action" type="button">
          {copy.themePreviewButton}
        </button>
      </div>

      {/* The preview shows the SAVED theme until you save again. Saying so is
          better than a preview that silently disagrees with the page. */}
      {message && <p className={message === copy.themeSaved ? 'text-neutral-400' : 'text-coral'}>{message}</p>}

      <div className="theme-editor-actions">
        <button
          className="secondary-action"
          disabled={busy}
          onClick={() => save(options.defaults)}
          type="button"
        >
          {copy.themeReset}
        </button>
        <button className="primary-action" disabled={busy} onClick={() => save(theme)} type="button">
          {copy.themeSave}
        </button>
      </div>
    </section>
  )
}

export default ThemeEditor
