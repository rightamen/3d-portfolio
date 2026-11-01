import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAccountTheme, getThemeOptions, getWorks, saveAccountTheme } from '../lib/api'
import { getApiErrorMessage } from '../lib/i18n'
import { applyTheme } from '../lib/theme'
import { normalizeTheme, themeToTokens } from '../../server/themes.js'

// Drafts and saved pages use the same pure resolver. Presets are offered by
// the server; previewing a draft never writes to the creator's account.
const ThemeEditorSession = ({ authToken, copy, language, profile }) => {
  const [options, setOptions] = useState(null)
  const [theme, setTheme] = useState(null)
  const [saved, setSaved] = useState(null)
  const [status, setStatus] = useState('loading')
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [covers, setCovers] = useState([])
  const previewRef = useRef(null)
  const mounted = useRef(false)
  const saving = useRef(false)

  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    let current = true
    Promise.all([getThemeOptions(), getAccountTheme(authToken)])
      .then(([catalogue, payload]) => {
        if (!current) return
        setOptions(catalogue)
        setTheme(payload.theme)
        setSaved(payload.theme)
        setStatus('ready')
      })
      .catch(error => {
        if (!current) return
        setStatus('error')
        setNotice({ error })
      })
    return () => { current = false }
  }, [authToken, attempt])

  useEffect(() => {
    if (!profile?.handle) return undefined
    let current = true
    getWorks({ creator: profile.handle, limit: 3 }).then(payload => {
      if (current) setCovers((payload.works || []).map(work => work.thumbnail || work.image).filter(Boolean))
    }).catch(() => {})
    return () => { current = false }
  }, [profile?.handle])

  const validation = useMemo(() => theme ? normalizeTheme(theme) : null, [theme])
  const tokens = useMemo(() => themeToTokens(validation?.theme || saved), [saved, validation])
  useEffect(() => applyTheme(previewRef.current, tokens), [tokens, status])

  if (status === 'loading') return <p role="status" className="text-neutral-400">{copy.loading}</p>
  if (status === 'error' || !theme) return <div className="theme-load-error" role="alert"><p>{copy.themeLoadError}</p><button type="button" className="secondary-action" onClick={() => { setStatus('loading'); setAttempt(value => value + 1) }}>{copy.profileRetry}</button></div>

  const dirty = ['accent', 'font', 'surface'].some(key => theme[key] !== saved?.[key])
  const invalid = !validation?.theme
  const selected = options.presets?.find(item => ['accent', 'font', 'surface'].every(key => item.theme[key] === theme[key]))
  const label = item => item.labels?.[language] || item.label || item.labels?.en || item.value
  const update = changes => { if (!saving.current) { setTheme(current => ({ ...current, ...changes })); setNotice(null) } }
  const save = async () => {
    if (saving.current || invalid || !dirty) return
    saving.current = true
    setBusy(true)
    setNotice(null)
    try {
      const payload = await saveAccountTheme(theme, authToken)
      if (!mounted.current) return
      setTheme(payload.theme)
      setSaved(payload.theme)
      setNotice({ saved: true })
    } catch (error) { if (mounted.current) setNotice({ error }) }
    finally { saving.current = false; if (mounted.current) setBusy(false) }
  }

  return (
    <section className="theme-editor">
      <div className="theme-editor-heading"><div><p className="section-kicker">{copy.themeCollectionKicker}</p><h2>{copy.themeTitle}</h2><p>{copy.themeIntro}</p></div><span className="theme-draft-state" role="status">{busy ? copy.themeSaving : dirty ? copy.themeUnsaved : copy.themeCurrent}</span></div>
      <fieldset className="theme-controls" disabled={busy}>
        <legend className="sr-only">{copy.themeTitle}</legend>
        <div className="theme-preset-grid" role="group" aria-label={copy.themePresets}>
          {(options.presets || []).map(preset => <button className="theme-preset" type="button" key={preset.id} aria-pressed={selected?.id === preset.id} onClick={() => update(preset.theme)}>
            <span className="theme-preset-swatch" style={{ background: preset.themeTokens['--theme-surface'], color: preset.themeTokens['--theme-accent'], '--swatch-panel': preset.themeTokens['--theme-panel'], '--swatch-font': preset.themeTokens['--theme-font'] }} aria-hidden="true"><span>Aa<span>∞</span></span><i /><i /><i /></span>
            <span className="theme-preset-name">{label(preset)}<i aria-hidden="true">{selected?.id === preset.id ? '✓' : '↗'}</i></span>
            <span className="theme-preset-description">{preset.descriptions?.[language] || preset.descriptions?.en}</span>
          </button>)}
        </div>
        <details className="theme-customize"><summary>{copy.themeCustomize}<span>{selected ? label(selected) : copy.themeCustom}</span></summary><div className="theme-editor-grid">
          <label><span>{copy.themeAccent}</span><input onChange={event => update({ accent: event.target.value })} type="color" value={theme.accent} /><code>{theme.accent}</code></label>
          <label><span>{copy.themeSurface}</span><select onChange={event => update({ surface: event.target.value })} value={theme.surface}>{options.surfaces.map(item => <option key={item.value} value={item.value}>{label(item)}</option>)}</select></label>
          <label><span>{copy.themeFont}</span><select onChange={event => update({ font: event.target.value })} value={theme.font}>{options.fonts.map(item => <option key={item.value} value={item.value}>{label(item)}</option>)}</select></label>
        </div></details>
      </fieldset>
      {invalid && <p role="alert" className="theme-validation">{copy.themeContrastError}</p>}
      <div className="theme-preview theme-scene-preview work-page-themed" ref={previewRef}>
        <div className="theme-scene-banner"><span>{copy.themePreview}</span><span aria-hidden="true">PORTFOLIO / ∞</span></div>
        <div className="theme-scene-identity"><span aria-hidden="true">{(profile?.displayName || 'A').slice(0, 1)}</span><div><h3>{profile?.displayName || copy.themePreviewHeading}</h3><p>{copy.themePreviewBody}</p></div><span aria-hidden="true">↗</span></div>
        <div className="theme-scene-artworks">{[0, 1, 2].map(index => <div key={index} className={'theme-mini-art theme-mini-art-' + index}>{covers[index] ? <img alt="" src={covers[index]} loading="lazy" /> : <i aria-hidden="true" />}</div>)}</div>
        <div className="theme-scene-footer"><span>{copy.themePreviewLive}</span><button className="primary-action" type="button" tabIndex={-1} aria-hidden="true">{copy.themePreviewButton}<span>↗</span></button></div>
      </div>
      <div className="theme-editor-actions"><p role="status">{notice?.saved ? copy.themeSaved : notice?.error ? getApiErrorMessage(notice.error, copy, copy.themeSaveError) : copy.themeSaveHint}</p><div>
        <button className="secondary-action" disabled={busy} onClick={() => update(options.defaults)} type="button">{copy.themeReset}</button>
        {dirty && <button className="secondary-action" disabled={busy} onClick={() => { setTheme(saved); setNotice(null) }} type="button">{copy.themeDiscard}</button>}
        <button className="primary-action" disabled={busy || invalid || !dirty} onClick={save} type="button">{busy ? copy.themeSaving : copy.themeSave}</button>
      </div></div>
      {notice?.saved && profile?.handle && <Link className="theme-view-profile" to={'/u/' + profile.handle}>{copy.accountProfileViewPublic}<span aria-hidden="true">↗</span></Link>}
    </section>
  )
}

// Authentication changes remount the editor, so late reads/saves cannot replace
// another creator's draft. Saving is still authorized on the server.
const ThemeEditor = props => <ThemeEditorSession key={props.authToken} {...props} />
export default ThemeEditor
