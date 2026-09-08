import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import WorkComments from '../components/WorkComments'
import WorkPurchase from '../components/WorkPurchase'
import { getWork, getWorkLikes, toggleWorkLike } from '../lib/api'
import { getApiErrorMessage, languages } from '../lib/i18n'
import { applyTheme } from '../lib/theme'
import { formatWorkPrice, localizedWorkField as localized } from '../lib/works'

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

  const [likes, setLikes] = useState({ key: '', likeCount: 0, liked: false })
  const [likeBusy, setLikeBusy] = useState(false)

  useEffect(() => {
    let isMounted = true

    getWorkLikes(handle, slug, authToken)
      .then((payload) => {
        if (isMounted) setLikes({ key: requestKey, likeCount: payload.likeCount, liked: payload.liked })
      })
      // A failed like count is not worth an error state: the page is still
      // readable without it, and zero is what a work with no likes shows.
      .catch(() => {})

    return () => {
      isMounted = false
    }
  }, [authToken, handle, requestKey, slug])

  const status = loaded.key === requestKey ? loaded.status : 'loading'
  const work = status === 'loading' ? null : loaded.work
  const message = loaded.message

  // The creator's theme, scoped to this page. Written onto the page element
  // rather than :root so it cannot follow the visitor to /explore, and removed
  // on unmount -- a theme that outlives its page is a bug that only shows up
  // two navigations later.
  const pageRef = useRef(null)
  const themeTokens = work?.creator?.themeTokens
  useEffect(() => applyTheme(pageRef.current, themeTokens), [themeTokens])

  if (status === 'loading') {
    return (
      <main className="work-page c-space" ref={pageRef}>
        <p className="text-neutral-400">{copy.workLoading}</p>
      </main>
    )
  }

  if (status === 'missing' || !work) {
    return (
      <main className="work-page c-space" ref={pageRef}>
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
    <main className="work-page c-space work-page-themed" ref={pageRef}>
      <header className="auth-nav">
        <Link className="text-xl font-bold text-neutral-300 hover:text-white" to="/">
          mrright.blog
        </Link>
        <LanguageSwitch copy={copy} language={language} onLanguageChange={onLanguageChange} />
      </header>

      <div className="work-header">
        <Link className="secondary-action" to="/explore">
          {copy.workBackToExplore}
        </Link>
      </div>

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
          {work.creator?.handle &&
            (work.creator.profilePublic ? (
              <Link className="work-creator" to={`/u/${work.creator.handle}`}>
                {copy.exploreBy} {work.creator.displayName || `@${work.creator.handle}`}
              </Link>
            ) : (
              <span className="work-creator">
                {copy.exploreBy} {work.creator.displayName || `@${work.creator.handle}`}
              </span>
            ))}

          <div className="work-price-row">
            <p className="work-price">{formatWorkPrice(work, copy)}</p>
            {/* Anonymous visitors can like: the server issues a signed cookie
                so it survives a reload and cannot be minted per request. */}
            <button
              className={`work-like${likes.liked ? ' work-like-active' : ''}`}
              disabled={likeBusy}
              onClick={() => {
                if (likeBusy) return
                setLikeBusy(true)
                toggleWorkLike(handle, slug, authToken)
                  .then((payload) =>
                    setLikes({ key: requestKey, likeCount: payload.likeCount, liked: payload.liked }),
                  )
                  .catch(() => {})
                  .finally(() => setLikeBusy(false))
              }}
              type="button"
            >
              ♥ {likes.key === requestKey ? likes.likeCount : 0}
              <span className="explore-search-label">{copy.workLike}</span>
            </button>
          </div>

          {/* Immediately under the price, because that is the question the
              price raises. */}
          <WorkPurchase
            authToken={authToken}
            copy={copy}
            handle={handle}
            isOwner={isOwner}
            slug={slug}
            work={work}
          />

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

          {/* The fields ProjectDetail shows and this page did not. They are
              already on the work object -- the mapper kept the project field
              names -- so leaving them out was just an omission. */}
          {(localized(work, 'format', language) ||
            localized(work, 'modelSize', language) ||
            work.stack?.length > 0 ||
            work.viewerFeatures?.length > 0) && (
            <section className="work-specs">
              <h2>{copy.workDetailsTitle}</h2>
              <dl>
                {localized(work, 'format', language) && (
                  <div>
                    <dt>{copy.workFormat}</dt>
                    <dd>{localized(work, 'format', language)}</dd>
                  </div>
                )}
                {localized(work, 'modelSize', language) && (
                  <div>
                    <dt>{copy.workSize}</dt>
                    <dd>{localized(work, 'modelSize', language)}</dd>
                  </div>
                )}
                {work.stack?.length > 0 && (
                  <div>
                    <dt>{copy.workStack}</dt>
                    <dd>{work.stack.join(' · ')}</dd>
                  </div>
                )}
                {work.viewerFeatures?.length > 0 && (
                  <div>
                    <dt>{copy.workViewerFeatures}</dt>
                    <dd>{work.viewerFeatures.join(' · ')}</dd>
                  </div>
                )}
              </dl>
            </section>
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

      {/* Only on a published work: a draft has nothing public to discuss, and
          the API refuses comments on one anyway. */}
      {work.status === 'published' && (
        <WorkComments
          authToken={authToken}
          copy={copy}
          handle={handle}
          isOwner={isOwner}
          slug={slug}
          visitorUser={visitorUser}
        />
      )}

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
