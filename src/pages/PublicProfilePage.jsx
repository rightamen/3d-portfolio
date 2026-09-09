import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import WorkCard from '../components/WorkCard'

// The site owner's own pages. They used to sit on the homepage, which stopped
// making sense once the front door became a marketplace: an about-me, a career
// timeline and a contact form are one person's, and one person's things belong
// on their profile.
//
// Lazy, because they are only ever rendered for one profile out of all of
// them, and nobody visiting somebody else's page should pay for the code.
const About = lazy(() => import('../sections/About'))
const Experience = lazy(() => import('../sections/Experience'))
const Contact = lazy(() => import('../sections/Contact'))
import {
  getExperience,
  getProfile,
  getPublicUserActivity,
  getPublicUserPosts,
  getPublicUserProfile,
  getPublicUserResources,
  getWorks,
} from '../lib/api'
import { getApiErrorMessage } from '../lib/i18n'
import { applyTheme } from '../lib/theme'

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

const getInitials = (name = '', handle = '') => {
  const source = String(name || handle || '?').trim()
  if (!source) return '?'
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : '')

const PublicProfilePage = ({ copy, language }) => {
  const { handle = '' } = useParams()
  const [activeTab, setActiveTab] = useState('overview')
  const [profile, setProfile] = useState(null)
  const [activity, setActivity] = useState({ comments: [], posts: [], resources: [] })
  const [works, setWorks] = useState({ error: '', items: [], loaded: false })
  const [status, setStatus] = useState(() => `loading:${handle}`)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let isMounted = true

    getPublicUserProfile(handle)
      .then(async (payload) => {
        if (!isMounted) return
        setProfile(payload.profile)

        if (payload.profile?.profilePublic === false) {
          setActivity({ comments: [], posts: [], resources: [] })
          setStatus('private')
          return
        }

        if (payload.profile?.activityPublic === false) {
          setActivity({ comments: [], posts: [], resources: [] })
          setActiveTab((current) =>
            ['resources', 'posts', 'comments'].includes(current) ? 'overview' : current,
          )
          setStatus('ready')
          return
        }

        const [resourcesPayload, postsPayload, activityPayload] = await Promise.all([
          getPublicUserResources(handle),
          getPublicUserPosts(handle),
          getPublicUserActivity(handle),
        ])
        if (!isMounted) return
        setActivity({
          comments: activityPayload.comments || [],
          posts: postsPayload.posts || activityPayload.posts || [],
          resources: resourcesPayload.resources || activityPayload.resources || [],
        })
        setStatus('ready')
      })
      .catch((error) => {
        if (!isMounted) return
        setStatus(error.code === 'PROFILE_ADMIN_DISABLED' ? 'admin-disabled' : 'error')
        setMessage(error.code ? getApiErrorMessage(error, copy) : copy.publicProfileLoadError)
      })

    return () => {
      isMounted = false
    }
  }, [copy, handle])

  // Its own effect on purpose. /api/works is public and does not depend on the
  // profile lookup; folding it into that chain would mean one failure takes
  // both down, and a private-activity profile would silently lose its works.
  useEffect(() => {
    let isMounted = true

    getWorks({ creator: handle, limit: 24 })
      .then((payload) => {
        if (isMounted) setWorks({ error: '', items: payload.works || [], loaded: true })
      })
      .catch(() => {
        if (isMounted) setWorks({ error: copy.publicProfileWorksLoadError, items: [], loaded: true })
      })

    return () => {
      isMounted = false
    }
  }, [copy, handle])

  // The static content.js record, fetched only for the one profile it belongs
  // to. `siteOwner` is decided by the server, by matching the account's email
  // against content.js -- the client never learns which email that is.
  const [ownerContent, setOwnerContent] = useState(null)
  const isSiteOwner = profile?.siteOwner === true

  useEffect(() => {
    if (!isSiteOwner) return undefined
    let isMounted = true

    Promise.all([getProfile(), getExperience()])
      .then(([profilePayload, experiencePayload]) => {
        if (!isMounted) return
        setOwnerContent({
          experience: experiencePayload.experience || [],
          profile: profilePayload.profile,
          skills: profilePayload.skills || [],
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
  const themeTokens = profile?.themeTokens
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

  const renderWorks = () => {
    if (works.error) return <p className="text-coral">{works.error}</p>
    if (!works.loaded) return <p className="text-neutral-400">{copy.exploreLoading}</p>
    if (works.items.length === 0) {
      return renderEmpty(copy.publicProfileNoWorksTitle, copy.publicProfileNoWorksBody)
    }

    return (
      <div className="explore-grid">
        {works.items.map((work) => (
          // showCreator off: every card here has the same author, and saying
          // so once per card is noise on the author's own page.
          <WorkCard copy={copy} key={work.id} language={language} showCreator={false} work={work} />
        ))}
      </div>
    )
  }

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
    if (!activityPublic) {
      if (activeTab === 'works') return renderWorks()
      if (activeTab === 'about') return renderAbout()
      return (
        <div className="account-section-stack">
          <section className="admin-section">
            <div className="admin-section-header">
              <h2>{copy.publicProfileOverview}</h2>
            </div>
            {renderPrivateActivity()}
          </section>
          <section className="admin-section">{renderWorks()}</section>
        </div>
      )
    }

    if (activeTab === 'works') return renderWorks()
    if (activeTab === 'resources') return renderResources()
    if (activeTab === 'posts') return renderPosts()
    if (activeTab === 'comments') return renderComments()
    if (activeTab === 'about') return renderAbout()
    return (
      <div className="account-section-stack">
        <section className="admin-section">
          <div className="admin-section-header">
            <h2>{copy.publicProfileOverview}</h2>
          </div>
          <div className="account-stat-grid">
            <article className="account-center-card">
              <span>{copy.accountStatWorks}</span>
              <strong>{works.items.length}</strong>
            </article>
            <article className="account-center-card">
              <span>{copy.accountStatResources}</span>
              <strong>{stats.uploadCount}</strong>
            </article>
            <article className="account-center-card">
              <span>{copy.accountStatPosts}</span>
              <strong>{stats.postCount}</strong>
            </article>
            <article className="account-center-card">
              <span>{copy.accountStatComments}</span>
              <strong>{stats.commentCount}</strong>
            </article>
            <article className="account-center-card">
              <span>{copy.accountStatLikes}</span>
              <strong>{stats.likeCount}</strong>
            </article>
          </div>
        </section>
        {/* Works first: on a marketplace profile they are what someone came
            for, and the community resource list is the older, smaller thing. */}
        <section className="admin-section">{renderWorks()}</section>
        <section className="admin-section">{renderResources()}</section>
      </div>
    )
  }

  return (
    <main className="admin-shell public-profile-shell work-page-themed" ref={pageRef}>
      {isLoading && (
        <section className="account-state-card">
          <p className="section-kicker">{copy.publicProfileKicker}</p>
          <h1>{copy.loading}</h1>
        </section>
      )}

      {status === 'error' && (
        <section className="account-state-card">
          <p className="section-kicker">{copy.publicProfileKicker}</p>
          <h1>{copy.publicProfileMissingTitle}</h1>
          <p>{message || copy.publicProfileMissingBody}</p>
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
                  {getInitials(profile.displayName, profile.handle)}
                </span>
              )}
              <div className="public-profile-title">
                <h1>{profile.displayName}</h1>
                <div className="public-profile-meta-line">
                  <span>@{profile.handle}</span>
                  {profile.location && <span>{profile.location}</span>}
                </div>
                {profile.bio && <p>{profile.bio}</p>}
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
            </div>
          </section>

          <nav className="admin-tabs public-profile-tabs">
            {visibleTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={activeTab === tab.key ? 'admin-tab-active' : 'admin-tab'}
                onClick={() => setActiveTab(tab.key)}
              >
                {copy[tab.labelKey]}
              </button>
            ))}
          </nav>

          <section className="public-profile-content">{renderTab()}</section>

          {/* Below the tabs rather than inside one: these are not activity,
              they are who this person is, and burying them behind a tab is how
              the homepage's About came to be the thing nobody scrolled to. */}
          {isSiteOwner && ownerContent && (
            <Suspense fallback={null}>
              <About
                copy={copy}
                language={language}
                profile={ownerContent.profile}
                skills={ownerContent.skills}
              />
              <Experience
                copy={copy}
                experience={ownerContent.experience}
                language={language}
                skills={ownerContent.skills}
              />
              <Contact copy={copy} profile={ownerContent.profile} />
            </Suspense>
          )}
        </>
      )}
    </main>
  )
}

export default PublicProfilePage
