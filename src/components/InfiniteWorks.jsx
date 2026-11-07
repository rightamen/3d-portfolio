import { readInterfaceMotion } from '../hooks/useInterfacePreferences'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { assetCategoryLabel, formatWorkPrice, localizedWorkField } from '../lib/works'

const wrap = (value, size) => ((value % size) + size) % size

// A bounded pool of tiles wraps around the viewport. Panning never grows the DOM
// or requests more copies of the catalogue.
const InfiniteWorks = ({ works, copy, language }) => {
  const navigate = useNavigate()
  const helpId = useId()
  const viewportRef = useRef(null)
  const nodes = useRef([])
  const controls = useRef(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [following, setFollowing] = useState(() => readInterfaceMotion()!=='off')
  const [selectedId, setSelectedId] = useState('')
  const [reducedMotion, setReducedMotion] = useState(() => readInterfaceMotion()!=='full')
  const motion = useRef({ x: 0, y: 0, vx: 0, vy: 0, aimX: 0, aimY: 0, inside: false, down: null, dragged: false, pointerX: 0, pointerY: 0, pointerPresent: false })
  const selected = works.find(work => work.id === selectedId) || works[0]
  const layout = useMemo(() => {
    const narrow = size.width < 640
    const width = narrow ? 180 : 258
    const height = narrow ? 208 : 270
    const stepX = width + (narrow ? 26 : 46)
    const stepY = height + (narrow ? 32 : 44)
    const cols = Math.ceil(size.width / stepX) + 2
    const rows = Math.max(Math.ceil(size.height / stepY) + 3, Math.ceil(works.length / cols))
    return { width, height, stepX, stepY, cols, rows, periodX: cols * stepX, periodY: rows * stepY }
  }, [size, works.length])
  const tiles = useMemo(() => Array.from({ length: layout.cols * layout.rows }, (_, index) => ({
    column: index % layout.cols,
    row: Math.floor(index / layout.cols),
    // Offset rows when the column count would otherwise repeat one work vertically.
    work: works[(index + (layout.cols % works.length === 0 ? Math.floor(index / layout.cols) : 0)) % works.length],
  })), [layout, works])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => {
      const reduced=media.matches || readInterfaceMotion()!=='full'
      setReducedMotion(reduced)
      if (reduced) {
        setFollowing(false)
        motion.current.inside = false
        motion.current.vx = 0; motion.current.vy = 0
      }
    }
    media.addEventListener('change', update)
    window.addEventListener('mrright-interface-change', update)
    return () => {media.removeEventListener('change', update);window.removeEventListener('mrright-interface-change', update)}
  }, [])

  useEffect(() => {
    const viewport = viewportRef.current
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let frame = 0
    let last = 0
    let visible = true
    let centeredNode = null
    const state = motion.current
    const paint = () => {
      state.x = wrap(state.x, layout.periodX)
      state.y = wrap(state.y, layout.periodY)
      let nearest = Infinity
      let current = null
      let nextCenter = null
      tiles.forEach((tile, index) => {
        const x = wrap(tile.column * layout.stepX - state.x + layout.stepX, layout.periodX) - layout.stepX
        const stagger = tile.column % 2 ? layout.stepY * .38 : 0
        const y = wrap(tile.row * layout.stepY + stagger - state.y + layout.stepY, layout.periodY) - layout.stepY
        const node = nodes.current[index]
        if (node) {
          node.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)'
          const lit = !reducedMotion && state.pointerPresent && !state.down && state.pointerX >= x && state.pointerX <= x + layout.width && state.pointerY >= y && state.pointerY <= y + layout.height - 40
          node.dataset.lit = lit ? 'true' : 'false'
          if (lit) {
            const px = (state.pointerX - x) / layout.width
            const py = (state.pointerY - y) / (layout.height - 40)
            node.style.setProperty('--tile-light-x', (px * 100).toFixed(1) + '%')
            node.style.setProperty('--tile-light-y', (py * 100).toFixed(1) + '%')
            node.style.setProperty('--tile-tilt-x', ((.5 - py) * 6).toFixed(2) + 'deg')
            node.style.setProperty('--tile-tilt-y', ((px - .5) * 6).toFixed(2) + 'deg')
          }
        }
        const distance = Math.hypot(x + layout.width / 2 - size.width / 2, y + layout.height / 2 - size.height / 2)
        if (distance < nearest) { nearest = distance; current = tile.work; nextCenter = node }
      })
      if (centeredNode !== nextCenter) {
        if (centeredNode) delete centeredNode.dataset.centered
        if (nextCenter) nextCenter.dataset.centered = 'true'
        centeredNode = nextCenter
      }
      if (current) setSelectedId(current.id)
      if (viewportRef.current) {
        const viewport = viewportRef.current
        viewport.dataset.pointer = state.pointerPresent && !reducedMotion ? 'true' : 'false'
        viewport.style.setProperty('--pointer-x', state.pointerX + 'px')
        viewport.style.setProperty('--pointer-y', state.pointerY + 'px')
        viewport.style.setProperty('--parallax-x', ((state.pointerX / (size.width || 1) - .5) * -22).toFixed(2) + 'px')
        viewport.style.setProperty('--parallax-y', ((state.pointerY / (size.height || 1) - .5) * -18).toFixed(2) + 'px')
        viewport.style.setProperty('--motion-bend', (reducedMotion ? 0 : -state.vx / 600).toFixed(3) + 'deg')
        viewportRef.current.dataset.panX = state.x.toFixed(1)
        viewportRef.current.dataset.panY = state.y.toFixed(1)
      }
    }
    const tick = (time) => {
      frame = 0
      const dt = Math.min((time - last) / 1000 || 1 / 60, .04)
      last = time
      const active = following && state.inside && !state.down && visible && !document.hidden
      const targetX = active ? state.aimX * 340 : 0
      const targetY = active ? state.aimY * 280 : 0
      state.vx += (targetX - state.vx) * (1 - Math.exp(-dt * 7))
      state.vy += (targetY - state.vy) * (1 - Math.exp(-dt * 7))
      state.x += state.vx * dt
      state.y += state.vy * dt
      paint()
      if (active && (Math.abs(targetX) + Math.abs(targetY) > .1) || Math.abs(state.vx) + Math.abs(state.vy) > .5) frame = requestAnimationFrame(tick)
    }
    const wake = () => {
      if (!frame && visible && !document.hidden) { last = 0; frame = requestAnimationFrame(tick) }
    }
    controls.current = { wake, paint }
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) wake()
      else { cancelAnimationFrame(frame); frame = 0; state.vx = 0; state.vy = 0; state.pointerPresent = false; paint() }
    })
    observer.observe(viewportRef.current)
    const onVisibility = () => {
      state.inside = false
      state.pointerPresent = false
      state.vx = 0; state.vy = 0
      if (document.hidden) { cancelAnimationFrame(frame); frame = 0; paint() }
    }
    document.addEventListener('visibilitychange', onVisibility)
    paint()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      if (centeredNode) delete centeredNode.dataset.centered
      document.removeEventListener('visibilitychange', onVisibility)
      controls.current = null
    }
  }, [following, layout, reducedMotion, size, tiles])

  const reset = () => {
    Object.assign(motion.current, { x: 0, y: 0, vx: 0, vy: 0, inside: false, down: null, pointerPresent: false })
    controls.current?.paint()
  }
  return (
    <div className="infinite-exhibit">
      <div className="infinite-exhibit-bar">
        <span><i aria-hidden="true" />{copy.infiniteCount.replace('{count}', works.length)}</span>
        <div>
          <button type="button" aria-pressed={following} onClick={() => { setFollowing(value => !value); motion.current.inside = false }}>{following ? copy.infinitePause : copy.infiniteFollow}</button>
          <button type="button" onClick={reset}>{copy.spatialReset}<span aria-hidden="true">↺</span></button>
        </div>
      </div>
      <div className="infinite-viewport" ref={viewportRef} tabIndex={0} role="region" aria-label={copy.infiniteLabel} aria-describedby={helpId} data-effects={reducedMotion ? 'reduced' : 'full'}
        onPointerEnter={(event) => { if (event.pointerType === 'mouse') motion.current.inside = true }}
        onPointerMove={(event) => {
          const state = motion.current
          if (event.pointerType === 'mouse') {
            const bounds = event.currentTarget.getBoundingClientRect()
            state.pointerX = event.clientX - bounds.left
            state.pointerY = event.clientY - bounds.top
            state.pointerPresent = true
          }
          if (state.down) {
            const dx = event.clientX - state.down.x, dy = event.clientY - state.down.y
            if (Math.hypot(dx, dy) > 6) state.dragged = true
            if (state.dragged) {
              event.currentTarget.setPointerCapture(event.pointerId)
              state.x = state.down.panX - dx; state.y = state.down.panY - dy
              state.vx = 0; state.vy = 0
              controls.current?.paint()
            }
            return
          }
          if (event.pointerType !== 'mouse') return
          const rect = event.currentTarget.getBoundingClientRect()
          const nx = (event.clientX - rect.left - rect.width / 2) / (rect.width / 2)
          const ny = (event.clientY - rect.top - rect.height / 2) / (rect.height / 2)
          const aim = value => Math.abs(value) < .08 ? 0 : Math.sign(value) * (Math.abs(value) - .08) / .92
          state.aimX = aim(nx); state.aimY = aim(ny); state.inside = true
          controls.current?.wake()
        }}
        onPointerLeave={(event) => {
          motion.current.inside = false
          motion.current.pointerPresent = false
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) motion.current.down = null
          controls.current?.wake()
        }}
        onFocus={() => { motion.current.inside = false; motion.current.vx = 0; motion.current.vy = 0 }}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          const state = motion.current
          state.down = { x: event.clientX, y: event.clientY, panX: state.x, panY: state.y }
          state.dragged = false; state.vx = 0; state.vy = 0
        }}
        onPointerUp={(event) => {
          motion.current.down = null
          motion.current.inside = false
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
          controls.current?.wake()
        }}
        onPointerCancel={() => { motion.current.down = null; motion.current.inside = false; motion.current.vx = 0; motion.current.vy = 0 }}
        onLostPointerCapture={() => { motion.current.down = null }}
        onClickCapture={(event) => {
          if (motion.current.dragged) { event.preventDefault(); event.stopPropagation(); motion.current.dragged = false }
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return
          const shifts = { ArrowRight: [160, 0], ArrowLeft: [-160, 0], ArrowDown: [0, 140], ArrowUp: [0, -140] }
          if (shifts[event.key]) {
            event.preventDefault()
            const [x, y] = shifts[event.key]
            motion.current.inside = false; motion.current.vx = 0; motion.current.vy = 0
            motion.current.x += x; motion.current.y += y
            controls.current?.paint()
          }
          if (event.key === 'Enter' && selected) { event.preventDefault(); navigate(selected.url) }
          if (event.key === 'Home') { event.preventDefault(); reset() }
        }}>
        <div className="infinite-atmosphere" aria-hidden="true" />
        <div className="infinite-stardust" aria-hidden="true" />
        <div className="infinite-plane">
          {tiles.map((tile, index) => <Link className="infinite-work" ref={node => { nodes.current[index] = node }} key={index} tabIndex={-1} to={tile.work.url}
            aria-label={localizedWorkField(tile.work, 'title', language)} style={{ width: layout.width, height: layout.height }} draggable={false}>
            <div className="infinite-work-image">
              {(tile.work.thumbnail || tile.work.image) && <img src={tile.work.thumbnail || tile.work.image} alt="" draggable={false} decoding="async" />}
              <span>{formatWorkPrice(tile.work, copy)}</span>
            </div>
            <div className="infinite-work-meta"><h3>{localizedWorkField(tile.work, 'title', language)}</h3><span>{assetCategoryLabel(tile.work.assetCategory, language)}</span></div>
          </Link>)}
        </div>
        <div className="infinite-pointer-light" aria-hidden="true" />
        <div className="infinite-vignette" aria-hidden="true" />
        <div className="infinite-corner" aria-hidden="true">∞</div>
      </div>
      <div className="infinite-exhibit-footer">
        <p id={helpId}>{copy.infiniteHint}</p>
        {selected && <Link to={selected.url} className="infinite-current" aria-label={copy.infiniteOpen.replace('{title}', localizedWorkField(selected, 'title', language))}><span>{localizedWorkField(selected, 'title', language)}</span><i aria-hidden="true">↗</i></Link>}
      </div>
    </div>
  )
}
export default InfiniteWorks
