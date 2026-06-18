import { useEffect, useMemo, useState } from 'react'
import {
  getPublicUserActivity,
  getPublicUserPosts,
  getPublicUserProfile,
  getPublicUserResources,
} from '../lib/api'
import { languages } from '../lib/i18n'

const publicProfileTabs = [
  { key: 'overview', labelKey: 'publicProfileTabOverview' },
  { key: 'resources', labelKey: 'publicProfileTabResources' },
  { key: 'posts', labelKey: 'publicProfileTabPosts' },
  { key: 'comments', labelKey: 'publicProfileTabComments' },
  { key: 'about', labelKey: 'publicProfileTabAbout' },
]

const privateActivityTabs = [
  { key: 'overview', labelKey: 'publicProfileTabOverview' },
  { key: 'about', labelKey: 'publicProfileTabAbout' },
]

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

const getInitials = (name = '', handle = '') => {
  const source = String(name || handle || '?').trim()
  if (!source) return '?'
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : '')

const PublicProfilePage = ({ copy, language, onLanguageChange }) => {
  const handle = decodeURIComponent(window.location.pathname.replace(/^\/u\/?/, '')).split('/')[0]
  const [activeTab, setActiveTab] = useState('overview')
  const [profile, setProfile] = useState(null)
  const [activity, setActivity] = useState({ comments: [], posts: [], resources: [] })
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
        setStatus('error')
        setMessage(error.message || copy.publicProfileLoadError)
      })

    return () => {
      isMounted = false
    }
  }, [copy.publicProfileLoadError, handle])

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
          {item.previewUrl && <img src={item.previewUrl} alt="" />}
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
    if (!activityPublic) {
      if (activeTab === 'about') return renderAbout()
      return (
        <div className="account-section-stack">
          <section className="admin-section">
            <div className="admin-section-header">
              <h2>{copy.publicProfileOverview}</h2>
            </div>
            {renderPrivateActivity()}
          </section>
        </div>
      )
    }

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
        <section className="admin-section">{renderResources()}</section>
      </div>
    )
  }

  return (
    <main className="admin-shell public-profile-shell">
      <header className="auth-nav">
        <a href="/" className="text-xl font-bold text-neutral-300 hover:text-white">
          mrright.blog
        </a>
        <LanguageSwitch language={language} onLanguageChange={onLanguageChange} copy={copy} />
      </header>

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
          <a href="/" className="secondary-action">
            {copy.accountBackHome}
          </a>
        </section>
      )}

      {status === 'private' && (
        <section className="account-state-card">
          <p className="section-kicker">{copy.publicProfileKicker}</p>
          <h1>{copy.publicProfilePrivateTitle}</h1>
          <p>{copy.publicProfilePrivateBody}</p>
          <a href="/" className="secondary-action">
            {copy.accountBackHome}
          </a>
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
            />
            <div className="public-profile-head">
              {profile.avatarUrl ? (
                <img className="public-profile-avatar" src={profile.avatarUrl} alt="" />
              ) : (
                <span className="public-profile-avatar public-profile-avatar-empty">
                  {getInitials(profile.displayName, profile.handle)}
                </span>
              )}
              <div className="public-profile-title">
                <h1>{profile.displayName}</h1>
                <span>@{profile.handle}</span>
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
        </>
      )}
    </main>
  )
}

export default PublicProfilePage
