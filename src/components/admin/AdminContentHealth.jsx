import { useEffect, useState } from 'react'
import AdminIcon from './AdminIcon'
import { getAdminContentHealth } from '../../lib/api'
import { formatAge, formatBytes, formatNumber } from './charts'

// Findings first, inventory second.
//
// The temptation with a checker is to render the catalogue and hang a status
// dot off each row, which buries the one broken thing among the nine fine
// ones. This opens on the problems, in severity order, each one saying what a
// visitor experiences and what to do about it. The per-project detail is
// underneath for when someone wants to confirm a file really is there.

const severityCopy = {
  critical: { label: 'Broken', tone: 'critical' },
  note: { label: 'Note', tone: 'note' },
  warning: { label: 'Degraded', tone: 'warning' },
}

const severityOrder = ['critical', 'warning', 'note']

const AssetLine = ({ asset, label }) => {
  if (!asset) {
    return (
      <div className="admin-asset-line">
        <span>{label}</span>
        <em>none attached</em>
      </div>
    )
  }

  return (
    <div className="admin-asset-line">
      <span>{label}</span>
      <code>{asset.url}</code>
      {asset.exists ? (
        <em>
          {asset.kind} · {formatBytes(asset.bytes)} · served from {asset.root}/
        </em>
      ) : (
        <em className="admin-asset-missing">not found</em>
      )}
    </div>
  )
}

const AdminContentHealth = ({ onNavigate, token }) => {
  const [health, setHealth] = useState(null)
  const [status, setStatus] = useState('loading')
  const [nonce, setNonce] = useState(0)
  const [expanded, setExpanded] = useState(() => new Set())
  const [showNotes, setShowNotes] = useState(false)

  // The fetch lives in the effect rather than in a callback the effect calls,
  // so nothing sets state synchronously during the effect body. Re-checking
  // bumps `nonce`, which is the input the effect is synchronised to -- the
  // button is a request for fresh data, not a second code path.
  useEffect(() => {
    if (!token) return undefined

    let cancelled = false

    getAdminContentHealth(token)
      .then((payload) => {
        if (cancelled) return

        setHealth(payload?.health || null)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [nonce, token])

  const recheck = () => {
    setStatus('loading')
    setNonce((current) => current + 1)
  }

  const toggle = (slug) =>
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)

      return next
    })

  // One flat, severity-ordered list built from both sources, so a broken
  // site-wide asset cannot hide below a project note.
  const findings = []
  for (const project of health?.projects || []) {
    for (const issue of project.issues) {
      findings.push({ ...issue, scope: project.title || project.slug, slug: project.slug })
    }
  }
  for (const asset of health?.siteAssets || []) {
    if (asset.issue) findings.push({ ...asset.issue, scope: asset.label, slug: null })
  }
  findings.sort(
    (a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity),
  )

  const counts = health?.counts || { critical: 0, note: 0, warning: 0 }
  const actionable = findings.filter((finding) => finding.severity !== 'note')
  const notes = findings.filter((finding) => finding.severity === 'note')

  return (
    <section className="admin-dashboard">
      <div className="admin-panel">
        <div className="admin-panel-head">
          <h2>What the site actually serves</h2>
          <span>
            {status === 'loading'
              ? 'checking…'
              : health?.checkedAt
                ? `checked ${formatAge(health.checkedAt)}`
                : '—'}
          </span>
        </div>

        <p className="admin-panel-note">
          Every URL in the catalogue is opened on the server and identified by its file header, not
          its extension. Files are looked for in the built <code>dist/</code> directory, because
          that is the one visitors are served — anything found only in <code>public/</code> is
          reported as unbuilt.
        </p>

        <div className="admin-health-summary">
          {severityOrder.map((severity) => (
            <div className={`admin-health-count admin-health-${severity}`} key={severity}>
              <strong>{formatNumber(counts[severity] || 0)}</strong>
              <span>{severityCopy[severity].label.toLowerCase()}</span>
            </div>
          ))}
          <button className="admin-chip-button" onClick={recheck} type="button">
            Re-check
          </button>
        </div>
      </div>

      {status === 'error' ? (
        <p className="admin-empty-note">
          The check could not be run. It reads files on the server, so this usually means the
          service is mid-restart.
        </p>
      ) : null}

      <div className="admin-panel">
        <div className="admin-panel-head">
          <h2>Findings</h2>
          <span>{actionable.length ? `${actionable.length} actionable` : 'nothing broken'}</span>
        </div>

        {actionable.length ? (
          <ul className="admin-findings">
            {actionable.map((finding, index) => (
              <li className={`admin-finding-${finding.severity}`} key={`${finding.code}-${index}`}>
                <span className="admin-finding-tag">{severityCopy[finding.severity].label}</span>
                <div>
                  <p>
                    <strong>{finding.scope}</strong> — {finding.message}
                  </p>
                  <small>{finding.hint}</small>
                </div>
                {finding.slug ? (
                  <button
                    className="admin-chip-button"
                    onClick={() => onNavigate?.('projects')}
                    type="button"
                  >
                    Open project
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="admin-empty-note admin-empty-good">
            {status === 'loading'
              ? 'Opening every referenced file…'
              : 'Every referenced image and model resolves, is the format it claims to be, and has the decoder it needs.'}
          </p>
        )}

        {showNotes && notes.length ? (
          <ul className="admin-findings">
            {notes.map((finding, index) => (
              <li className="admin-finding-note" key={`${finding.code}-${index}`}>
                <span className="admin-finding-tag">{severityCopy.note.label}</span>
                <div>
                  <p>
                    <strong>{finding.scope}</strong> — {finding.message}
                  </p>
                  <small>{finding.hint}</small>
                </div>
                {finding.slug ? (
                  <button
                    className="admin-chip-button"
                    onClick={() => onNavigate?.('projects')}
                    type="button"
                  >
                    Open project
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {/* Notes are things that are true, not things that are wrong -- five
            "no 3D preview attached" lines push the two real failures off the
            top of the list, which is the whole problem this page exists to
            avoid. They are one click away and stay one click away. */}
        {notes.length ? (
          <button
            className="admin-chip-button"
            onClick={() => setShowNotes((current) => !current)}
            type="button"
          >
            {showNotes
              ? `Hide ${notes.length} note${notes.length === 1 ? '' : 's'}`
              : `Show ${notes.length} note${notes.length === 1 ? '' : 's'}`}
          </button>
        ) : null}
      </div>

      <div className="admin-panel">
        <div className="admin-panel-head">
          <h2>Per project</h2>
          <span>{health?.projects?.length || 0}</span>
        </div>

        <div className="admin-table">
          {(health?.projects || []).map((project) => {
            const worst = severityOrder.find((severity) =>
              project.issues.some((issue) => issue.severity === severity),
            )
            const isOpen = expanded.has(project.slug)

            return (
              <article className="admin-row admin-health-row" key={project.slug}>
                <div>
                  <div className="admin-row-title">
                    <strong>{project.title || project.slug}</strong>
                    {/* The chip inherits the project's category accent by
                        default, which paints the word "Broken" the same
                        friendly aqua as every other tag. Severity overrides it. */}
                    <span className={`admin-health-chip admin-health-chip-${worst || 'ok'}`}>
                      {worst ? severityCopy[worst].label : 'OK'}
                    </span>
                  </div>
                  <span>
                    {project.slug} · {project.isPublic ? 'public' : 'hidden'} ·{' '}
                    {project.issues.length
                      ? `${project.issues.length} finding${project.issues.length === 1 ? '' : 's'}`
                      : 'no findings'}
                  </span>

                  {isOpen ? (
                    <div className="admin-asset-detail">
                      <AssetLine asset={project.image} label="Preview image" />
                      <AssetLine asset={project.model} label="3D model" />
                      {project.glb ? (
                        <div className="admin-asset-line">
                          <span>glTF</span>
                          <em>
                            v{project.glb.version} · {project.glb.meshes} mesh
                            {project.glb.meshes === 1 ? '' : 'es'} · {project.glb.materials} material
                            {project.glb.materials === 1 ? '' : 's'} · {project.glb.images} texture
                            {project.glb.images === 1 ? '' : 's'}
                            {project.glb.extensionsRequired?.length
                              ? ` · requires ${project.glb.extensionsRequired.join(', ')}`
                              : ''}
                          </em>
                        </div>
                      ) : null}
                      <div className="admin-asset-line">
                        <span>Localised</span>
                        <em>
                          {project.translations.complete
                            ? 'Chinese and Japanese copy present'
                            : Object.entries(project.translations.missing)
                                .map(([suffix, fields]) => `${suffix} missing ${fields.join('/')}`)
                                .join(' · ')}
                        </em>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="admin-actions">
                  <button
                    className="secondary-action"
                    onClick={() => toggle(project.slug)}
                    type="button"
                  >
                    {isOpen ? 'Hide files' : 'Show files'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </div>

      <div className="admin-panel">
        <div className="admin-panel-head">
          <h2>Shared assets</h2>
          <span>belong to no project</span>
        </div>
        <ul className="admin-posture">
          {(health?.siteAssets || []).map((asset) => (
            <li
              className={asset.issue ? `admin-posture-${asset.issue.severity === 'critical' ? 'bad' : 'warn'}` : 'admin-posture-ok'}
              key={asset.url}
            >
              <AdminIcon name={asset.issue ? 'alert' : 'ok'} size={17} />
              <div>
                <span>{asset.label}</span>
                <small>
                  expected {asset.expected} · found {asset.found}
                  {asset.bytes ? ` · ${formatBytes(asset.bytes)}` : ''}
                </small>
                {asset.issue ? <small>{asset.issue.message}</small> : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export default AdminContentHealth
