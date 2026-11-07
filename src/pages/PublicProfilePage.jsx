import SocialActions from '../components/SocialActions'
import ReportButton from '../components/ReportButton'
import { readInterfaceMotion } from '../hooks/useInterfacePreferences'
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import CreatorProfileContent from '../components/CreatorProfileContent'
import CreatorWorksGallery from '../components/CreatorWorksGallery'
import CreatorThemeBrowser from '../components/CreatorThemeBrowser'
import { THEME_PRESETS, themeToTokens } from '../../server/themes.js'

// The site owner's own pages. They used to sit on the homepage, which stopped
// making sense once the front door became a marketplace: an about-me, a career
// timeline and a contact form are one person's, and one person's things belong
// on their profile.
//
// Lazy, because they are only ever rendered for one profile out of all of
// them, and nobody visiting somebody else's page should pay for the code.
const Contact = lazy(() => import('../sections/Contact'))
import {
  getProfile,
  getPublicUserActivity,
  getPublicUserPosts,
  getPublicUserProfile,
  getPublicUserResources,
} from '../lib/api'
import { initials } from '../lib/initials'
import { applyTheme } from '../lib/theme'
import { useCreatorScrollEffects } from '../hooks/useCreatorScrollEffects'

const publicProfileTabs = [
  { key: 'overview', labelKey: 'publicProfileTabOverview' },
  { key: 'works', labelKey: 'publicProfileTabWorks' },
  { key: 'resources', labelKey: 'publicProfileTabResources' },
  { key: 'posts', labelKey: 'publicProfileTabPosts' },
  { key: 'comments', labelKey: 'publicProfileTabComments' },
  { key: 'about', labelKey: 'publicProfileTabAbout' },
]

// Works stay listed even when a visitor has made their activity private.
// Posts, comments and uploads are activity; a PUBLISHED work is a listing the
// creator chose to make public, and it is already on /explore under their
// handle -- hiding it only here would be incoherent, not private.
const privateActivityTabs = [
  { key: 'overview', labelKey: 'publicProfileTabOverview' },
  { key: 'works', labelKey: 'publicProfileTabWorks' },
  { key: 'about', labelKey: 'publicProfileTabAbout' },
]

const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : '')

const CreatorProfile = ({ copy, language, handle, authToken, visitorUser }) => {
  const [activeTab, setActiveTab] = useState('overview')
  const [previewTheme, setPreviewTheme] = useState('')
  const [profile, setProfile] = useState(null)
  const [notices, setNotices] = useState([])
  const [activity, setActivity] = useState({ comments: [], posts: [], resources: [] })
  const [worksTotal, setWorksTotal] = useState(null)
  const [profileAttempt, setProfileAttempt] = useState(0)
  const [activityAttempt, setActivityAttempt] = useState(0)
  const [activityStatus, setActivityStatus] = useState('loading')
  const [status, setStatus] = useState(() => `loading:${handle}`)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let current = true
    getPublicUserProfile(handle)
      .then(payload => {
        if (!current) return
        setProfile(payload.profile)
        setNotices(payload.notices || [])
        setStatus(payload.profile?.profilePublic === false ? 'private' : 'ready')
      })
      .catch(error => {
        if (!current) return
        setStatus(error.code === 'PROFILE_ADMIN_DISABLED' ? 'admin-disabled' : 'error')
        setMessage(error.status === 404 ? 'missing' : 'unavailable')
      })
    return () => { current = false }
  }, [handle, profileAttempt])

  // A failed activity service must not hide a creator or their published work.
  useEffect(() => {
    if (!profile || profile.profilePublic === false || profile.activityPublic === false) return undefined
    let current = true
    Promise.all([getPublicUserResources(handle), getPublicUserPosts(handle), getPublicUserActivity(handle)])
      .then(([resources, posts, activity]) => {
        if (!current) return
        setActivity({ comments: activity.comments || [], posts: posts.posts || activity.posts || [], resources: resources.resources || activity.resources || [] })
        setActivityStatus('ready')
      })
      .catch(() => { if (current) setActivityStatus('error') })
    return () => { current = false }
  }, [activityAttempt, handle, profile])

  // The static content.js record, fetched only for the one profile it belongs
  // to. `siteOwner` is decided by the server, by matching the account's email
  // against content.js -- the client never learns which email that is.
  const [ownerContent, setOwnerContent] = useState(null)
  const isSiteOwner = profile?.siteOwner === true

  useEffect(() => {
    if (!isSiteOwner) return undefined
    let isMounted = true

    getProfile()
      .then((profilePayload) => {
        if (!isMounted) return
        setOwnerContent({
          profile: profilePayload.profile,
        })
      })
      // Soft-fails: a profile without its about section is still a profile.
      .catch(() => {})

    return () => {
      isMounted = false
    }
  }, [isSiteOwner])

  // Scoped to this page, not :root, so it cannot follow the visitor onward.
  const pageRef = useRef(null)
  useCreatorScrollEffects(pageRef, status === 'ready')
  const themeTokens = useMemo(() => {
    const preset = THEME_PRESETS.find(item => item.id === previewTheme)
    return preset ? themeToTokens(preset.theme) : profile?.themeTokens
  }, [previewTheme, profile?.themeTokens])
  useEffect(() => applyTheme(pageRef.current, themeTokens), [themeTokens])

  const isLoading = status === `loading:${handle}`
  const activityPublic = profile?.activityPublic !== false
  const visibleTabs = activityPublic ? publicProfileTabs : privateActivityTabs

  const stats = profile?.stats || {
    commentCount: activity.comments.length,
    downloadRequestCount: 0,
    likeCount: 0,
    postCount: activity.posts.length,
    uploadCount: activity.resources.length,
  }

  const visibleLinks = useMemo(() => {
    const links = profile?.contactLinks || {}
    return Object.entries(links).filter(([, item]) => item?.url || item?.value)
  }, [profile])

  const renderEmpty = (title, body) => (
    <div className="asset-empty-state">
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  )

  const renderPrivateActivity = () =>
    renderEmpty(copy.publicProfileActivityPrivateTitle, copy.publicProfileActivityPrivateBody)

  const renderResources = () => (
    <div className="public-profile-grid">
      {activity.resources.map((item) => (
        <article key={item.id} className="public-profile-item">
          {item.previewUrl && (
            <img
              src={item.previewUrl}
              alt={`${item.title} preview`}
              decoding="async"
              loading="lazy"
            />
          )}
          <div>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
            <small>{formatDate(item.createdAt)}</small>
          </div>
          {item.fileUrl && (
            <a href={item.fileUrl} className="secondary-action" target="_blank" rel="noreferrer">
              {copy.communityOpenFile}
            </a>
          )}
        </article>
      ))}
      {activity.resources.length === 0 &&
        renderEmpty(copy.publicProfileNoResourcesTitle, copy.publicProfileNoResourcesBody)}
    </div>
  )

  const renderPosts = () => (
    <div className="admin-table">
      {activity.posts.map((item) => (
        <article key={item.id} className="admin-row">
          <div>
            <div className="admin-row-title">
              <strong>{item.title}</strong>
              <span>{item.topic}</span>
            </div>
            <p>{item.message}</p>
            <small>{formatDate(item.createdAt)}</small>
          </div>
        </article>
      ))}
      {activity.posts.length === 0 &&
        renderEmpty(copy.publicProfileNoPostsTitle, copy.publicProfileNoPostsBody)}
    </div>
  )

  const renderComments = () => (
    <div className="admin-table">
      {activity.comments.map((item) => (
        <article key={item.id} className="admin-row">
          <div>
            <div className="admin-row-title">
              <strong>
                {copy.accountCommentOnProject}: {item.projectSlug}
              </strong>
            </div>
            <p>{item.message}</p>
            <small>{formatDate(item.createdAt)}</small>
          </div>
        </article>
      ))}
      {activity.comments.length === 0 &&
        renderEmpty(copy.publicProfileNoCommentsTitle, copy.publicProfileNoCommentsBody)}
    </div>
  )

  const renderAbout = () => (
    <div className="public-profile-about">
      <article>
        <span>{copy.accountProfileBio}</span>
        <p>{profile?.bio || copy.publicProfileNoBio}</p>
      </article>
      {profile?.location && (
        <article>
          <span>{copy.accountProfileLocation}</span>
          <p>{profile.location}</p>
        </article>
      )}
      {profile?.website && (
        <article>
          <span>{copy.accountProfileWebsite}</span>
          <a href={profile.website} target="_blank" rel="noreferrer">
            {profile.website}
          </a>
        </article>
      )}
      {visibleLinks.length > 0 && (
        <article>
          <span>{copy.accountProfileContacts}</span>
          <div className="public-profile-links">
            {visibleLinks.map(([key, item]) => (
              <a key={key} href={item.url || undefined} target="_blank" rel="noreferrer">
                {item.label || key}
              </a>
            ))}
          </div>
        </article>
      )}
    </div>
  )

  const renderTab = () => {
    if (activeTab === 'works') return null
    if (activeTab === 'about') return renderAbout()
    if (!activityPublic) return renderPrivateActivity()
    if (activityStatus === 'loading') return <p role="status">{copy.loading}</p>
    if (activityStatus === 'error') return (
      <div className="profile-activity-state" role="status">
        <p>{copy.profileActivityError}</p>
        <button className="secondary-action" type="button" onClick={() => { setActivityStatus('loading'); setActivityAttempt(value => value + 1) }}>{copy.profileRetry}</button>
      </div>
    )
    if (activeTab === 'resources') return renderResources()
    if (activeTab === 'posts') return renderPosts()
    if (activeTab === 'comments') return renderComments()
    return (
      <section className="profile-activity-preview">
        <div className="profile-section-heading"><h2>{copy.profileActivityTitle}</h2><button type="button" onClick={() => setActiveTab('resources')}>{copy.publicProfileTabResources}<span aria-hidden="true">↗</span></button></div>
        <div className="profile-activity-metrics">
          {[['resources', copy.accountStatResources, stats.uploadCount], ['posts', copy.accountStatPosts, stats.postCount], ['comments', copy.accountStatComments, stats.commentCount]].map(([key, label, count]) => (
            <button key={key} type="button" onClick={() => setActiveTab(key)}><span>{label}</span><strong>{count}</strong><i aria-hidden="true">↗</i></button>
          ))}
        </div>
      </section>
    )
  }

  return (
    <main className="admin-shell public-profile-shell creator-studio work-page-themed" ref={pageRef} data-author-theme-preview={previewTheme?'true':undefined}>
      {isLoading && (
        <section className="account-state-card">
          <p className="section-kicker">{copy.publicProfileKicker}</p>
          <h1>{copy.loading}</h1>
        </section>
      )}

      {status === 'error' && (
        <section className="account-state-card">
          <p className="section-kicker">{copy.publicProfileKicker}</p>
          <h1>{message === 'missing' ? copy.publicProfileMissingTitle : copy.profileUnavailableTitle}</h1>
          <p>{message === 'missing' ? copy.publicProfileMissingBody : copy.publicProfileLoadError}</p>
          {message !== 'missing' && <button type="button" className="primary-action" onClick={() => { setStatus('loading:' + handle); setProfileAttempt(value => value + 1) }}>{copy.profileRetry}</button>}
          <Link to="/" className="secondary-action">
            {copy.accountBackHome}
          </Link>
        </section>
      )}

      {status === 'private' && (
        <section className="account-state-card">
          <p className="section-kicker">{copy.publicProfileKicker}</p>
          <h1>{copy.publicProfilePrivateTitle}</h1>
          <p>{copy.publicProfilePrivateBody}</p>
          <Link to="/" className="secondary-action">
            {copy.accountBackHome}
          </Link>
        </section>
      )}

      {status === 'admin-disabled' && (
        <section className="account-state-card">
          <p className="section-kicker">{copy.publicProfileKicker}</p>
          <h1>{copy.publicProfileAdminDisabledTitle}</h1>
          <p>{copy.publicProfileAdminDisabledBody}</p>
          <Link to="/" className="secondary-action">
            {copy.accountBackHome}
          </Link>
        </section>
      )}

      {status === 'ready' && profile && (
        <>
          <section className="public-profile-hero">
            <div
              className="public-profile-banner"
              style={
                profile.bannerUrl ? { backgroundImage: `url(${profile.bannerUrl})` } : undefined
              }
            >
              <div className="public-profile-banner-glow" />
              <div className="profile-banner-caption"><span>{copy.profileStudioKicker}</span><span aria-hidden="true">PORTFOLIO / ∞</span></div>
            </div>
            <div className="public-profile-head">
              {profile.avatarUrl ? (
                <img
                  className="public-profile-avatar"
                  src={profile.avatarUrl}
                  alt={`${profile.displayName} avatar`}
                  decoding="async"
                />
              ) : (
                <span className="public-profile-avatar public-profile-avatar-empty">
                  {initials(profile.displayName, profile.handle)}
                </span>
              )}
              <div className="public-profile-title">
                <span className="profile-identity-label">{copy.publicProfileKicker}</span>
                <h1 tabIndex={-1}>{profile.displayName}</h1>
                <div className="public-profile-meta-line">
                  <span>@{profile.handle}</span>
                  {profile.location && <span>{profile.location}</span>}
                </div>
                {profile.bio && <p>{profile.bio}</p>}
                <SocialActions key={authToken+handle} handle={handle} authToken={authToken} copy={copy}/>
                {visitorUser?.handle!==handle && <ReportButton authToken={authToken} copy={copy} targetType="user" targetId={handle}/>}
                <div className="public-profile-links">
                  {profile.website && (
                    <a href={profile.website} target="_blank" rel="noreferrer">
                      {copy.accountProfileWebsite}
                    </a>
                  )}
                  {profile.publicEmail && <span>{profile.publicEmail}</span>}
                  {visibleLinks.map(([key, item]) => (
                    <a key={key} href={item.url || undefined} target="_blank" rel="noreferrer">
                      {item.label || key}
                    </a>
                  ))}
                </div>
              </div>
              <div className="profile-hero-summary">
                <div><strong>{worksTotal ?? '—'}</strong><span>{copy.accountStatWorks}</span></div>
                {activityPublic && <div><strong>{stats.likeCount}</strong><span>{copy.accountStatLikes}</span></div>}
              </div>
            </div>
          </section>

          <CreatorThemeBrowser copy={copy} language={language} selectedId={previewTheme} onSelect={setPreviewTheme} />

          <nav className="admin-tabs public-profile-tabs" aria-label={copy.profileNavigation}>
            <span className="profile-scroll-progress" aria-hidden="true" />
            {visibleTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={activeTab === tab.key ? 'admin-tab-active' : 'admin-tab'}
                aria-current={activeTab === tab.key ? 'page' : undefined}
                onClick={() => setActiveTab(tab.key)}
              >
                {copy[tab.labelKey]}
              </button>
            ))}
          </nav>

          <section className="public-profile-content">
            <div className="profile-work-panel" hidden={!['overview', 'works'].includes(activeTab)}>
              <CreatorWorksGallery handle={handle} copy={copy} language={language} onTotal={setWorksTotal} />
            </div>
            {renderTab()}
          </section>

          <button className="profile-back-top" type="button" aria-label={copy.profileBackTop} title={copy.profileBackTop} onClick={() => {
            const page = pageRef.current
            const headerHeight = document.querySelector('.topbar')?.getBoundingClientRect().height || 0
            page?.querySelector('.public-profile-title h1')?.focus({ preventScroll: true })
            window.scrollTo({ top: Math.max(0, window.scrollY + page.getBoundingClientRect().top - headerHeight), behavior: readInterfaceMotion()==='off' ? 'instant' : 'smooth' })
          }}><span aria-hidden="true">↑</span></button>

          {/* Below the tabs rather than inside one: these are not activity,
              they are who this person is, and burying them behind a tab is how
              the homepage's About came to be the thing nobody scrolled to.
              For EVERY creator now, from what they wrote -- it used to be the
              site owner's only, out of content.js, behind an isSiteOwner
              check. */}
          {/* The creator's own notices, above the introduction: "commissions
              open" is the thing a visitor came to find out, and an introduction
              is the thing they can read afterwards. */}
          {notices.length > 0 && (
            <section className="owner-section creator-notices">
              <p className="section-kicker">{copy.creatorNoticesKicker}</p>
              <ul>
                {notices.map((notice) => (
                  <li key={notice.id}>
                    <p>{notice.body}</p>
                    <time>{formatDate(notice.createdAt)}</time>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <CreatorProfileContent
            content={profile}
            copy={copy}
            displayName={profile?.displayName || `@${handle}`}
          />

          {/* The contact form stays owner-only: it posts to the site's own
              inbox, which is not a thing another creator has. */}
          {isSiteOwner && ownerContent && (
            <Suspense fallback={null}>
              <Contact copy={copy} profile={ownerContent.profile} />
            </Suspense>
          )}
        </>
      )}
    </main>
  )
}

// Remount on creator navigation so late responses, themes and selected tabs
// from the previous profile cannot appear under a new handle.
const PublicProfilePage = props => {
  const { handle = '' } = useParams()
  return <CreatorProfile key={handle} {...props} handle={handle} />
}

export default PublicProfilePage
