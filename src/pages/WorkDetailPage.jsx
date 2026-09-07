import { Suspense, lazy, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { getWork } from '../lib/api'
import { getApiErrorMessage, languages } from '../lib/i18n'

// One work. This is where 3D earns its place -- the subject IS three
// dimensional -- but the viewer is still opened deliberately rather than
// mounted with the page: ADR_PLATFORM_PIVOT §5 keeps three.js out of the first
// paint, and the description, the price and the file list are all readable
// before a single byte of the engine is fetched.
const ModelPreview = lazy(() => import('../components/ModelPreview'))

const LanguageSwitch = ({ language, onLanguageChange, copy }) => (
  <div className="language-switch" aria-label={copy.toggleLanguage}>
    {languages.map((item) => (
      <button
        key={item.code}
        type="button"
        className={language === item.code ? 'language-switch-active' : 'language-switch-button'}
        onClick={() => onLanguageChange(item.code)}
        title={item.label}
      >
        {item.shortLabel}
      </button>
    ))}
  </div>
)

const localized = (work, field, language) => {
  const suffix = { en: 'En', ja: 'Ja', zh: 'Zh' }[language]
  return (suffix && work[`${field}${suffix}`]) || work[field] || ''
}

const formatBytes = (bytes) => {
  if (!bytes) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
}

const WorkDetailPage = ({ authToken, copy, language, onLanguageChange, visitorUser }) => {
  const { handle = '', slug = '' } = useParams()
  // The loaded work is stored WITH the address that produced it, so "loading"
  // is derived rather than assigned. That keeps the effect free of a
  // synchronous setState and means navigating between two works never shows
  // the previous one under the new URL.
  const requestKey = `${handle}/${slug}`
  const [loaded, setLoaded] = useState({ key: '', message: '', status: 'loading', work: null })
  const [viewerOpen, setViewerOpen] = useState(false)

  useEffect(() => {
    let isMounted = true

    // The token is sent when there is one: it is the only thing that lets an
    // owner open their own draft here instead of having to publish it to see
    // what it looks like.
    getWork(handle, slug, authToken)
      .then((payload) => {
        if (!isMounted) return
        setLoaded({ key: requestKey, message: '', status: 'ready', work: payload.work })
      })
      .catch((error) => {
        if (!isMounted) return
        setLoaded({
          key: requestKey,
          message: error.code ? getApiErrorMessage(error, copy) : copy.workNotFoundBody,
          status: 'missing',
          work: null,
        })
      })

    return () => {
      isMounted = false
    }
  }, [authToken, copy, handle, slug, requestKey])

  const status = loaded.key === requestKey ? loaded.status : 'loading'
  const work = status === 'loading' ? null : loaded.work
  const message = loaded.message

  if (status === 'loading') {
    return (
      <main className="work-page c-space">
        <p className="text-neutral-400">{copy.workLoading}</p>
      </main>
    )
  }

  if (status === 'missing' || !work) {
    return (
      <main className="work-page c-space">
        <h1 className="text-heading">{copy.workNotFoundTitle}</h1>
        <p className="text-neutral-400">{message || copy.workNotFoundBody}</p>
        <Link className="secondary-action" to="/explore">
          {copy.workBackToExplore}
        </Link>
      </main>
    )
  }

  const isOwner = Boolean(visitorUser?.id) && visitorUser.id === work.creator?.id
  const title = localized(work, 'title', language)

  return (
    <main className="work-page c-space">
      <header className="work-header">
        <Link className="secondary-action" to="/explore">
          {copy.workBackToExplore}
        </Link>
        <LanguageSwitch copy={copy} language={language} onLanguageChange={onLanguageChange} />
      </header>

      {/* Only the owner ever reaches a draft here, so the notice explains why
          they can see something nobody else can rather than implying it is
          live. */}
      {isOwner && work.status !== 'published' && (
        <p className="work-draft-notice">{copy.workDraftNotice}</p>
      )}

      <div className="work-layout">
        <div className="work-media">
          {work.image ? (
            <img alt="" decoding="async" src={work.image} />
          ) : (
            <span className="explore-card-placeholder" />
          )}
          {work.modelUrl ? (
            <button className="primary-action" onClick={() => setViewerOpen(true)} type="button">
              {copy.openModelViewer}
            </button>
          ) : (
            <p className="text-neutral-400">{copy.workNoPreview}</p>
          )}
        </div>

        <div className="work-info">
          <h1 className="text-heading">{title}</h1>
          {work.creator?.handle && (
            <Link className="work-creator" to={`/u/${work.creator.handle}`}>
              {copy.exploreBy} {work.creator.displayName || `@${work.creator.handle}`}
            </Link>
          )}

          <p className="work-price">
            {work.priceCents > 0
              ? `${(work.priceCents / 100).toFixed(2)} ${String(work.currency || 'usd').toUpperCase()}`
              : copy.exploreFree}
          </p>

          <p>{localized(work, 'summary', language)}</p>
          {localized(work, 'workflow', language) && (
            <p className="text-neutral-400">{localized(work, 'workflow', language)}</p>
          )}

          {work.tags?.length > 0 && (
            <ul className="work-tags">
              {work.tags.map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
          )}

          {work.publishedAt && (
            <small className="text-neutral-400">
              {copy.workPublishedOn} {new Date(work.publishedAt).toLocaleDateString()}
            </small>
          )}

          {work.assets?.length > 0 && (
            <section className="work-files">
              <h2>{copy.workFilesTitle}</h2>
              <ul>
                {work.assets.map((asset) => (
                  <li key={asset.id}>
                    <span className="work-file-kind">{asset.kind}</span>
                    <span className="work-file-name">{asset.fileName}</span>
                    <span className="work-file-size">{formatBytes(asset.bytes)}</span>
                    {/* fileUrl is null for a protected asset unless the viewer
                        owns it. Rendering the label instead of a dead link is
                        the honest version of "you cannot have this yet". */}
                    {asset.fileUrl ? (
                      <a href={asset.fileUrl} rel="noreferrer" target="_blank">
                        {copy.communityOpenFile}
                      </a>
                    ) : (
                      <span className="work-file-locked">{copy.workFileLocked}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      {viewerOpen && work.modelUrl && (
        <Suspense fallback={<p className="text-neutral-400">{copy.workLoading}</p>}>
          {/* A work carries the same field names a project does -- that is why
              the mapper kept them -- so the existing viewer takes one without
              a translation layer. */}
          <ModelPreview
            copy={copy}
            key={work.id}
            language={language}
            onClose={() => setViewerOpen(false)}
            project={work}
          />
        </Suspense>
      )}
    </main>
  )
}

export default WorkDetailPage
