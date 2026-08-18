import { Suspense, lazy, useState } from 'react'
import AdminIcon from './AdminIcon'
import ModelErrorBoundary from '../ModelErrorBoundary'
import { useAdminI18n } from '../../lib/admin/i18nAdmin'
import { useDocumentVisible, useMediaQuery, usePrefersReducedMotion } from '../../lib/admin/motion'

// The dashboard's map of itself, in whichever form this browser can draw.
//
// Three states, one component: the WebGL scene, the flat map it falls back to,
// and the flat map again while the scene's chunk is still in flight. They are
// deliberately the same object in different clothes -- every node is clickable
// and carries the same numbers in all three, so an operator on a machine that
// cannot start WebGL is not looking at a decoration with a apology on it.
const AdminGalaxyScene = lazy(() => import('./AdminGalaxyScene'))

const viewModeKey = 'mrright-admin-galaxy-mode'

// Module scope, not render: asking the browser for a context is a side effect,
// and the answer cannot change while the page is open.
const webglSupported = (() => {
  if (typeof document === 'undefined') return false

  try {
    const canvas = document.createElement('canvas')

    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
})()

// Flat is not "3D minus the depth": the same eleven nodes are laid out on one
// ellipse, sized by the same volume and coloured by the same queue state. It
// is the map, drawn with CSS.
const FlatMap = ({ busyLabel, idleLabel, nodes, onSelect }) => {
  const scale = Math.max(1, ...nodes.map((node) => node.value || 0))

  return (
    <div className="admin-galaxy-flat">
      <span className="admin-galaxy-flat-core" />
      {nodes.map((node, index) => {
        const angle = (index / nodes.length) * Math.PI * 2 - Math.PI / 2
        const ring = index % 2 === 0 ? 1 : 0.66
        const size = 14 + Math.min(1, (node.value || 0) / scale) * 20

        return (
          <button
            className={
              node.pending ? 'admin-galaxy-dot admin-galaxy-dot-busy' : 'admin-galaxy-dot'
            }
            key={node.key}
            onClick={() => onSelect(node)}
            style={{
              '--dot-size': `${size}px`,
              '--stagger-index': index,
              left: `${50 + Math.cos(angle) * 38 * ring}%`,
              top: `${50 + Math.sin(angle) * 36 * ring}%`,
            }}
            title={node.label}
            type="button"
          >
            <i />
            <span>
              <strong>{node.label}</strong>
              <small>{node.pending ? busyLabel(node) : idleLabel(node)}</small>
            </span>
          </button>
        )
      })}
    </div>
  )
}

const AdminGalaxy = ({ days = 30, nodes = [], onNavigate, total = 0 }) => {
  const { fmt, t } = useAdminI18n()
  const reducedMotion = usePrefersReducedMotion()
  const visible = useDocumentVisible()
  // Narrow stages get the same scene at a wider field of view and without the
  // permanent labels: six pills over a 400px-wide canvas overlap each other
  // and the readout, which is worse than no labels at all. The flat map is the
  // labelled one at this width, and it is one tap away.
  const compact = useMediaQuery('(max-width: 640px)')
  const [mode, setMode] = useState(() => {
    if (typeof window === 'undefined') return '3d'

    return window.localStorage.getItem(viewModeKey) === 'flat' ? 'flat' : '3d'
  })

  const busyLabel = (node) => t('galaxy.nodeWaiting', { count: fmt.formatNumber(node.pending) })
  const idleLabel = (node) =>
    node.value ? `${fmt.formatNumber(node.value)}` : t('galaxy.nodeIdle')

  const select = (node) => onNavigate?.(node.section)
  const flat = (
    <FlatMap busyLabel={busyLabel} idleLabel={idleLabel} nodes={nodes} onSelect={select} />
  )

  const showScene = webglSupported && mode === '3d'

  const setViewMode = (next) => {
    setMode(next)
    window.localStorage.setItem(viewModeKey, next)
  }

  return (
    <section className="admin-galaxy">
      <div className="admin-galaxy-head">
        <div>
          <h2>{t('galaxy.title')}</h2>
          <span>{webglSupported ? t('galaxy.subtitle') : t('galaxy.unsupported')}</span>
        </div>
        {webglSupported ? (
          <button
            className="admin-chip-button"
            onClick={() => setViewMode(mode === '3d' ? 'flat' : '3d')}
            type="button"
          >
            {mode === '3d' ? t('galaxy.viewFlat') : t('galaxy.view3d')}
          </button>
        ) : null}
      </div>

      <div className={showScene ? 'admin-galaxy-stage' : 'admin-galaxy-stage admin-galaxy-stage-flat'}>
        <div className="admin-galaxy-readout">
          <span>{t('galaxy.core')}</span>
          <strong>{fmt.formatNumber(total)}</strong>
          <small>{t('galaxy.coreNote', { days, total: fmt.formatNumber(total) })}</small>
        </div>

        {showScene ? (
          // The boundary is the one that wraps the public model viewer: a lost
          // WebGL context throws from inside the canvas tree, where nothing
          // else in this page can catch it, and the flat map is a working
          // answer rather than an error card.
          <ModelErrorBoundary fallback={flat}>
            <Suspense fallback={flat}>
              <AdminGalaxyScene
                compact={compact}
                nodes={nodes.map((node) => ({
                  ...node,
                  pendingLabel: busyLabel(node),
                  valueLabel: idleLabel(node),
                }))}
                onSelect={select}
                running={visible}
                spin={!reducedMotion && visible}
              />
            </Suspense>
          </ModelErrorBoundary>
        ) : (
          flat
        )}
      </div>

      <ul className="admin-galaxy-legend">
        <li className="admin-galaxy-legend-busy">
          <i />
          {t('galaxy.legendWaiting')}
        </li>
        <li className="admin-galaxy-legend-idle">
          <i />
          {t('galaxy.legendClear')}
        </li>
        <li className="admin-galaxy-legend-note">
          <AdminIcon name="dashboard" size={14} />
          {t('galaxy.legendSize')}
        </li>
      </ul>
    </section>
  )
}

export default AdminGalaxy
