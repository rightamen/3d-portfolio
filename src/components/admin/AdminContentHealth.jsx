import { useEffect, useState } from 'react'
import AdminIcon from './AdminIcon'
import { getAdminContentHealth } from '../../lib/api'
import { useAdminI18n } from '../../lib/admin/i18nAdmin'
import { stagger } from '../../lib/admin/motion'

// Findings first, inventory second.
//
// The temptation with a checker is to render the catalogue and hang a status
// dot off each row, which buries the one broken thing among the nine fine
// ones. This opens on the problems, in severity order, each one saying what a
// visitor experiences and what to do about it. The per-project detail is
// underneath for when someone wants to confirm a file really is there.

const severityOrder = ['critical', 'warning', 'note']

const severityLabelKey = {
  critical: 'health.critical',
  note: 'health.noteLabel',
  warning: 'health.warning',
}

// A finding's own words, in the reading language when there is a translation
// for its code and in the server's English when there is not. The severity
// step exists for `upload-missing-file`, which says two different things at
// two different severities.
// The server sends a finished English sentence *and*, where the sentence has a
// path or a byte count in it, the raw values behind it. A dictionary entry can
// only be written for the second kind, so the values are handed to the
// translator and the English sentence stays as the fallback.
const findingText = (t, finding, field) => {
  const values = finding.values || {}

  const bySeverity = t(`finding.${finding.code}.${finding.severity}.${field}`, values)
  if (!bySeverity.startsWith('finding.')) return bySeverity

  const byCode = t(`finding.${finding.code}.${field}`, values)
  if (!byCode.startsWith('finding.')) return byCode

  return finding[field] || ''
}

const AssetLine = ({ asset, label }) => {
  const { fmt, t } = useAdminI18n()

  if (!asset) {
    return (
      <div className="admin-asset-line">
        <span>{label}</span>
        <em>{t('health.noneAttached')}</em>
      </div>
    )
  }

  return (
    <div className="admin-asset-line">
      <span>{label}</span>
      <code>{asset.url}</code>
      {asset.exists ? (
        <em>
          {t('health.servedFrom', {
            kind: asset.kind,
            root: asset.root,
            size: fmt.formatBytes(asset.bytes),
          })}
        </em>
      ) : (
        <em className="admin-asset-missing">{t('health.notFound')}</em>
      )}
    </div>
  )
}

const AdminContentHealth = ({ onNavigate, token }) => {
  const { fmt, t } = useAdminI18n()
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
  for (const upload of health?.communityUploads || []) {
    for (const issue of upload.issues) {
      findings.push({ ...issue, scope: upload.title || upload.url, slug: null, uploads: true })
    }
  }
  findings.sort((a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity))

  const counts = health?.counts || { critical: 0, note: 0, warning: 0 }
  const actionable = findings.filter((finding) => finding.severity !== 'note')
  const notes = findings.filter((finding) => finding.severity === 'note')

  const FindingRow = ({ finding, index }) => (
    <li
      className={`admin-finding-${finding.severity} admin-animate-in`}
      style={stagger(index)}
    >
      <span className="admin-finding-tag">{t(severityLabelKey[finding.severity])}</span>
      <div>
        <p>
          <strong>{finding.scope}</strong> — {findingText(t, finding, 'message')}
        </p>
        <small>{findingText(t, finding, 'hint')}</small>
      </div>
      {finding.slug ? (
        <button className="admin-chip-button" onClick={() => onNavigate?.('projects')} type="button">
          {t('health.openProject')}
        </button>
      ) : finding.uploads ? (
        <button
          className="admin-chip-button"
          onClick={() => onNavigate?.('community')}
          type="button"
        >
          {t('health.openCommunity')}
        </button>
      ) : null}
    </li>
  )

  return (
    <section className="admin-dashboard">
      <div className="admin-panel admin-animate-in">
        <div className="admin-panel-head">
          <h2>{t('health.title')}</h2>
          <span>
            {status === 'loading'
              ? t('health.checking')
              : health?.checkedAt
                ? t('health.checked', { age: fmt.formatAge(health.checkedAt) })
                : t('common.dash')}
          </span>
        </div>

        <p className="admin-panel-note">{t('health.note')}</p>

        <div className="admin-health-summary">
          {severityOrder.map((severity) => (
            <div className={`admin-health-count admin-health-${severity}`} key={severity}>
              <strong>{fmt.formatNumber(counts[severity] || 0)}</strong>
              <span>{t(severityLabelKey[severity])}</span>
            </div>
          ))}
          <button className="admin-chip-button" onClick={recheck} type="button">
            {t('health.recheck')}
          </button>
        </div>
      </div>

      {status === 'error' ? <p className="admin-empty-note">{t('health.error')}</p> : null}

      <div className="admin-panel admin-animate-in">
        <div className="admin-panel-head">
          <h2>{t('health.findings')}</h2>
          <span>
            {actionable.length
              ? t('health.actionable', { count: fmt.formatNumber(actionable.length) })
              : t('health.nothingBroken')}
          </span>
        </div>

        {actionable.length ? (
          <ul className="admin-findings">
            {actionable.map((finding, index) => (
              <FindingRow finding={finding} index={index} key={`${finding.code}-${index}`} />
            ))}
          </ul>
        ) : (
          <p className="admin-empty-note admin-empty-good">
            {status === 'loading' ? t('health.openingFiles') : t('health.allGood')}
          </p>
        )}

        {showNotes && notes.length ? (
          <ul className="admin-findings">
            {notes.map((finding, index) => (
              <FindingRow finding={finding} index={index} key={`${finding.code}-${index}`} />
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
              ? t('health.hideNotes', { count: notes.length })
              : t('health.showNotes', { count: notes.length })}
          </button>
        ) : null}
      </div>

      <div className="admin-panel admin-animate-in">
        <div className="admin-panel-head">
          <h2>{t('health.perProject')}</h2>
          <span>{fmt.formatNumber(health?.projects?.length || 0)}</span>
        </div>

        <div className="admin-table">
          {(health?.projects || []).map((project, index) => {
            const worst = severityOrder.find((severity) =>
              project.issues.some((issue) => issue.severity === severity),
            )
            const isOpen = expanded.has(project.slug)

            return (
              <article
                className="admin-row admin-health-row admin-animate-in"
                key={project.slug}
                style={stagger(index)}
              >
                <div>
                  <div className="admin-row-title">
                    <strong>{project.title || project.slug}</strong>
                    {/* The chip inherits the project's category accent by
                        default, which paints the word "Broken" the same
                        friendly aqua as every other tag. Severity overrides it. */}
                    <span className={`admin-health-chip admin-health-chip-${worst || 'ok'}`}>
                      {worst ? t(severityLabelKey[worst]) : t('health.ok')}
                    </span>
                  </div>
                  <span>
                    {project.slug} · {t(`status.${project.isPublic ? 'public' : 'hidden'}`)} ·{' '}
                    {project.issues.length
                      ? t('health.findingsCount', { count: project.issues.length })
                      : t('health.noFindings')}
                  </span>

                  {isOpen ? (
                    <div className="admin-asset-detail admin-animate-in">
                      <AssetLine asset={project.image} label={t('health.previewImage')} />
                      <AssetLine asset={project.model} label={t('health.model3d')} />
                      {project.glb ? (
                        <div className="admin-asset-line">
                          <span>{t('health.gltf')}</span>
                          <em>
                            {t('health.glbSummary', {
                              images: project.glb.images,
                              materials: project.glb.materials,
                              meshes: project.glb.meshes,
                              version: project.glb.version,
                            })}
                            {project.glb.extensionsRequired?.length
                              ? t('health.glbRequires', {
                                  extensions: project.glb.extensionsRequired.join(', '),
                                })
                              : ''}
                          </em>
                        </div>
                      ) : null}
                      <div className="admin-asset-line">
                        <span>{t('health.localised')}</span>
                        <em>
                          {project.translations.complete
                            ? t('health.translationsComplete')
                            : Object.entries(project.translations.missing)
                                .map(([suffix, fields]) =>
                                  t('health.missingFields', {
                                    fields: fields.join('/'),
                                    suffix,
                                  }),
                                )
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
                    {isOpen ? t('health.hideFiles') : t('health.showFiles')}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </div>

      <div className="admin-panel admin-animate-in">
        <div className="admin-panel-head">
          <h2>{t('health.sharedAssets')}</h2>
          <span>{t('health.sharedAssetsMeta')}</span>
        </div>
        <ul className="admin-posture">
          {(health?.siteAssets || []).map((asset, index) => (
            <li
              className={`admin-animate-in ${
                asset.issue
                  ? `admin-posture-${asset.issue.severity === 'critical' ? 'bad' : 'warn'}`
                  : 'admin-posture-ok'
              }`}
              key={asset.url}
              style={stagger(index)}
            >
              <AdminIcon name={asset.issue ? 'alert' : 'ok'} size={17} />
              <div>
                <span>{asset.label}</span>
                <small>
                  {t('health.expectedFound', { expected: asset.expected, found: asset.found })}
                  {asset.bytes ? ` · ${fmt.formatBytes(asset.bytes)}` : ''}
                </small>
                {asset.issue ? <small>{findingText(t, asset.issue, 'message')}</small> : null}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="admin-panel admin-animate-in">
        <div className="admin-panel-head">
          <h2>{t('health.communityUploads')}</h2>
          <span>
            {health?.communityUploads?.length
              ? t('health.uploadsChecked', { count: health.communityUploads.length })
              : t('health.noneStored')}
          </span>
        </div>

        <p className="admin-panel-note">{t('health.uploadsNote')}</p>

        {health?.communityUploads?.length ? (
          <ul className="admin-posture">
            {health.communityUploads.map((upload, index) => (
              <li
                className={`admin-animate-in ${
                  upload.issues.length
                    ? `admin-posture-${
                        upload.issues.some((issue) => issue.severity === 'critical')
                          ? 'bad'
                          : 'warn'
                      }`
                    : 'admin-posture-ok'
                }`}
                key={upload.id}
                style={stagger(index)}
              >
                <AdminIcon name={upload.issues.length ? 'alert' : 'ok'} size={17} />
                <div>
                  <span>{upload.title || upload.url}</span>
                  <small>
                    {t(`status.${upload.status}`)} · {upload.fileType} ·{' '}
                    {upload.file?.exists
                      ? t('health.fileFound', { kind: upload.file.kind })
                      : t('health.fileMissing')}
                    {upload.file?.bytes ? ` · ${fmt.formatBytes(upload.file.bytes)}` : ''}
                  </small>
                  {upload.issues.map((issue) => (
                    <small key={issue.code}>{findingText(t, issue, 'message')}</small>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="admin-empty-note">{t('health.noUploads')}</p>
        )}
      </div>
    </section>
  )
}

export default AdminContentHealth
