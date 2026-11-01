import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { exhibitionSources } from '../../server/exhibition.js'
import { Link } from 'react-router-dom'
import useDialogAccessibility from '../hooks/useDialogAccessibility'
import ModelErrorBoundary from './ModelErrorBoundary'
import { assetCategoryLabel, formatWorkPrice, localizedWorkField } from '../lib/works'
const StudioScene = lazy(() => import('../three/scenes/StudioScene'))
const canRender3D = () => {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    if (!gl) return false
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch { return false }
}
const SpatialGallery = ({ works = [], copy, language, status = 'ready', exhibition = false }) => {
  const [selectedId, setSelectedId] = useState('')
  const [focused, setFocused] = useState(false)
  const [lighting, setLighting] = useState('silver')
  const thumbnailsRef = useRef(null)
  const galleryRef = useRef(null)
  const focusButtonRef = useRef(null)
  useDialogAccessibility({ dialogRef: galleryRef, initialFocusRef: focusButtonRef, open: focused, onClose: () => setFocused(false) })
  const [mode, setMode] = useState('spatial')
  const [revision, setRevision] = useState(0)
  const [supported] = useState(canRender3D)
  const found = works.findIndex((work) => work.id === selectedId)
  const index = found < 0 ? 0 : found
  const work = works[index]
  useEffect(() => {
    const strip = thumbnailsRef.current
    const active = strip?.querySelector('[aria-pressed="true"]')
    if (!strip || !active) return
    const reveal = () => {
      const bounds = strip.getBoundingClientRect()
      const item = active.getBoundingClientRect()
      const left = item.left < bounds.left ? item.left - bounds.left - 2 : item.right > bounds.right ? item.right - bounds.right + 2 : 0
      if (left) strip.scrollBy({ left, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    }
    reveal()
    const observer = new ResizeObserver(reveal)
    observer.observe(strip)
    return () => observer.disconnect()
  }, [index, works])
  const select = (step) => {
    if (works.length) setSelectedId(works[(index + step + works.length) % works.length].id)
  }
  const poster = work && (work.thumbnail || work.image)
  const title = work ? localizedWorkField(work, 'title', language) : ''
  const fallback = poster ? <img className="spatial-poster" src={poster} alt={title} /> : null
  const isSpatial = mode === 'spatial' && supported
  return (
    <section className={`spatial-gallery${focused ? ' spatial-is-focused' : ''}`} ref={galleryRef} data-lighting={lighting} role={focused ? 'dialog' : undefined} aria-modal={focused ? true : undefined} aria-label={exhibition ? copy.exhibitionTitle : copy.spatialLabel} tabIndex={work ? 0 : undefined} onKeyDown={(event) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault(); select(event.key === 'ArrowRight' ? 1 : -1)
      }
      if (event.key.toLowerCase() === 'r') setRevision((value) => value + 1)
    }}>
      <div className="spatial-toolbar">
        <span className="spatial-live"><i />{exhibition ? copy.exhibitionKicker : copy.studioPlayground}</span>
        {work && <div className="spatial-toolbar-actions">
          {work && <span className="spatial-counter" aria-label={copy.spatialPosition.replace('{current}', index + 1).replace('{total}', works.length)}>{String(index + 1).padStart(2, '0')}<i>/</i>{String(works.length).padStart(2, '0')}</span>}
          <div className="spatial-mode" role="group" aria-label={copy.spatialView}>
          <button type="button" aria-pressed={isSpatial} disabled={!supported} onClick={() => setMode('spatial')}>3D</button>
          <button type="button" aria-pressed={!isSpatial} onClick={() => setMode('image')}>{copy.spatialImage}</button>
          </div>
          <button type="button" className="spatial-focus" ref={focusButtonRef} aria-label={focused ? copy.spatialFocusExit : copy.spatialFocus} title={focused ? copy.spatialFocusExit : copy.spatialFocus} onClick={() => setFocused((value) => !value)}><span aria-hidden="true">{focused ? '↙' : '⛶'}</span><span>{focused ? copy.spatialFocusExit : copy.spatialFocus}</span></button>
        </div>}
      </div>
      <div className="spatial-stage">
        <div className="spatial-stage-grid" aria-hidden="true" />
        {isSpatial && work && <div className="spatial-lighting" role="group" aria-label={copy.spatialLighting}>
          <span>{copy.spatialLighting}</span>
          {['silver', 'amber'].map((value) => <button key={value} type="button" data-light={value} aria-pressed={lighting === value} aria-label={value === 'silver' ? copy.spatialSilver : copy.spatialAmber} title={value === 'silver' ? copy.spatialSilver : copy.spatialAmber} onClick={() => setLighting(value)}><i aria-hidden="true" /><span>{value === 'silver' ? copy.spatialSilver : copy.spatialAmber}</span></button>)}
        </div>}
        {work ? isSpatial ? (
          <ModelErrorBoundary resetKey={work.id} fallback={fallback}>
            <Suspense fallback={fallback}>
              <StudioScene key={revision} works={works} selectedIndex={index} onSelect={setSelectedId} label={copy.studioDrag} lighting={lighting} />
            </Suspense>
          </ModelErrorBoundary>
        ) : fallback : (
          <div className="spatial-empty"><span aria-hidden="true">◇</span><p>{status === 'loading' ? copy.loading : status === 'error' ? copy.exploreLoadError : exhibition ? copy.exhibitionEmptyTitle : copy.exploreEmptyTitle}</p>{exhibition && status === 'ready' && <small>{copy.exhibitionEmptyBody}</small>}</div>
        )}
        {work && <div className="spatial-stage-caption"><span>{isSpatial ? copy.studioDrag : copy.spatialFlatHint}</span><span className="spatial-axis" aria-hidden="true"><i>X</i><i>Y</i><i>Z</i></span></div>}
      </div>
      {work && <>
        <div className="spatial-selection" aria-live="polite">
          <div><small>{assetCategoryLabel(work.assetCategory, language)}</small><h2>{title}</h2><p>{work.creator?.displayName || work.creator?.handle || ''}</p></div>
          <div className="spatial-selection-action">
            {exhibition && <div className="spatial-recommendation"><small>{exhibitionSources(work).community ? copy.exhibitionCommunity : copy.exhibitionCurator}</small><strong>{exhibitionSources(work).community ? work.ratings.average.toFixed(1) : work.curation.score}<em>{exhibitionSources(work).community ? '/5' : '/100'}</em></strong></div>}
            <span>{formatWorkPrice(work, copy)}</span><Link className="primary-action" to={work.url}>{copy.spatialOpen}<span aria-hidden="true">↗</span></Link></div>
        </div>
        <div className="spatial-navigation">
          <div className="spatial-arrows"><button type="button" onClick={() => select(-1)} aria-label={copy.explorePrevious}>←</button><button type="button" onClick={() => select(1)} aria-label={copy.exploreNext}>→</button></div>
          <div className="spatial-dots" ref={thumbnailsRef} role="group" aria-label={copy.spatialSelect}>
            {works.map((item, at) => <button type="button" key={item.id} aria-label={localizedWorkField(item, 'title', language)} aria-pressed={index === at} onClick={() => setSelectedId(item.id)}><span className="spatial-thumb-index" aria-hidden="true">{String(at + 1).padStart(2, '0')}</span>{(item.thumbnail || item.image) && <img alt="" src={item.thumbnail || item.image} loading="lazy" onError={(event) => { event.currentTarget.style.visibility = 'hidden' }} />}</button>)}
          </div>
          <button className="spatial-reset" type="button" onClick={() => setRevision((value) => value + 1)}>{copy.spatialReset}<span aria-hidden="true">↺</span></button>
        </div>
      </>}
    </section>
  )
}
export default SpatialGallery
