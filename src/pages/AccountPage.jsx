import { useEffect, useMemo, useState } from 'react'
import { assetCategoryProfiles, getAssetCategoryProfile } from '../lib/assetCategories'
import {
  createCommunityPost,
  deleteAccountCommunityPost,
  deleteAccountCommunityUpload,
  getAccountComments,
  getAccountCommunity,
  getAccountDownloads,
  uploadCommunityResource,
} from '../lib/api'
import { languages, getAccessLevelLabel } from '../lib/i18n'

const emptyUploadForm = {
  assetCategory: 'generic',
  description: '',
  file: null,
  title: '',
}

const emptyPostForm = {
  message: '',
  title: '',
  topic: 'general',
}

const topicKeys = ['general', 'showcase', 'help', 'feedback']

const accountTabs = [
  { key: 'overview', labelKey: 'accountNavOverview' },
  { key: 'downloads', labelKey: 'accountNavDownloads' },
  { key: 'comments', labelKey: 'accountNavComments' },
  { key: 'community', labelKey: 'accountNavCommunity' },
  { key: 'settings', labelKey: 'accountNavSettings' },
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

const formatFileSize = (size) => {
  if (!Number.isFinite(size) || size <= 0) return ''
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`
  return `${(size / 1024 / 1024).toFixed(size > 20 * 1024 * 1024 ? 0 : 1)} MB`
}

const formatDate = (value) => (value ? new Date(value).toLocaleString() : '')

const getTopicLabel = (copy, topic) =>
  copy[`communityTopic${topic[0].toUpperCase()}${topic.slice(1)}`] || topic

const getStatusLabel = (copy, status) => copy[`accountStudioStatus${status}`] || status

const getInitials = (name = '', email = '') => {
  const source = String(name || email || '?').trim()
  if (!source) return '?'
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

const AccountShell = ({ children, copy, language, onLanguageChange }) => (
  <main className="auth-page">
    <nav className="auth-nav">
      <a href="/" className="text-xl font-bold text-neutral-300 hover:text-white">
        mrright.blog
      </a>
      <LanguageSwitch language={language} onLanguageChange={onLanguageChange} copy={copy} />
    </nav>
    {children}
  </main>
)

const StatusPill = ({ ok, copy }) => (
  <span className={`status-pill ${ok ? 'status-approved' : 'status-pending'}`}>
    {ok ? copy.accountStatusVerified : copy.accountStatusUnverified}
  </span>
)

const SkeletonRows = ({ count = 3 }) => (
  <div className="admin-table">
    {Array.from({ length: count }).map((_, index) => (
      <div key={index} className="account-skeleton-row" aria-hidden="true">
        <span className="account-skeleton-line w-1/3" />
        <span className="account-skeleton-line w-2/3" />
        <span className="account-skeleton-line w-1/4" />
      </div>
    ))}
  </div>
)

const EmptyState = ({ title, body }) => (
  <div className="asset-empty-state">
    <strong>{title}</strong>
    <span>{body}</span>
  </div>
)

const AccountPage = ({
  authToken,
  copy,
  language,
  onLanguageChange,
  onLogout,
  visitorLoading,
  visitorUser,
}) => {
  const [activeTab, setActiveTab] = useState('overview')
  const [dashboard, setDashboard] = useState({ posts: [], uploads: [] })
  const [dashboardStatus, setDashboardStatus] = useState('idle')
  const [dashboardMessage, setDashboardMessage] = useState('')
  const [downloads, setDownloads] = useState([])
  const [downloadsStatus, setDownloadsStatus] = useState('idle')
  const [downloadsMessage, setDownloadsMessage] = useState('')
  const [comments, setComments] = useState([])
  const [likeCount, setLikeCount] = useState(0)
  const [commentsStatus, setCommentsStatus] = useState('idle')
  const [commentsMessage, setCommentsMessage] = useState('')
  const [uploadForm, setUploadForm] = useState(emptyUploadForm)
  const [uploadState, setUploadState] = useState({ phase: 'idle', message: '', progress: 0 })
  const [postForm, setPostForm] = useState(emptyPostForm)
  const [postState, setPostState] = useState({ phase: 'idle', message: '' })
  const [deletingId, setDeletingId] = useState('')

  const categories = useMemo(
    () =>
      assetCategoryProfiles.map((category) =>
        getAssetCategoryProfile({ assetCategory: category.value }, language),
      ),
    [language],
  )

  const pendingCount = dashboard.uploads.filter((upload) => upload.status === 'pending').length
  const approvedCount = dashboard.uploads.filter((upload) => upload.status === 'approved').length
  const canDownload = Boolean(visitorUser?.emailVerified)

  const refreshDashboard = async () => {
    if (!authToken || !visitorUser) return

    setDashboardStatus('loading')
    setDashboardMessage('')

    try {
      const payload = await getAccountCommunity(authToken)
      setDashboard({
        posts: payload.posts || [],
        uploads: payload.uploads || [],
      })
      setDashboardStatus('ready')
    } catch (error) {
      setDashboardStatus('error')
      setDashboardMessage(error.message || copy.accountStudioLoadError)
    }
  }

  const refreshDownloads = async () => {
    if (!authToken || !visitorUser) return

    setDownloadsStatus('loading')
    setDownloadsMessage('')

    try {
      const payload = await getAccountDownloads(authToken)
      setDownloads(payload.requests || [])
      setDownloadsStatus('ready')
    } catch (error) {
      setDownloadsStatus('error')
      setDownloadsMessage(error.message || copy.accountDownloadsLoadError)
    }
  }

  const refreshComments = async () => {
    if (!authToken || !visitorUser) return

    setCommentsStatus('loading')
    setCommentsMessage('')

    try {
      const payload = await getAccountComments(authToken)
      setComments(payload.comments || [])
      setLikeCount(payload.likeCount || 0)
      setCommentsStatus('ready')
    } catch (error) {
      setCommentsStatus('error')
      setCommentsMessage(error.message || copy.accountCommentsLoadError)
    }
  }

  useEffect(() => {
    refreshDashboard()
    refreshDownloads()
    refreshComments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, visitorUser?.id])

  const submitUpload = async (event) => {
    event.preventDefault()
    if (!authToken || !uploadForm.file) return

    setUploadState({ phase: 'uploading', message: copy.communityUploading, progress: 0 })

    try {
      await uploadCommunityResource(authToken, uploadForm, uploadForm.file, (progress) => {
        setUploadState({
          phase: 'uploading',
          message: `${copy.communityUploading} ${progress}%`,
          progress,
        })
      })
      setUploadForm(emptyUploadForm)
      setUploadState({ phase: 'done', message: copy.communitySubmitted, progress: 100 })
      await refreshDashboard()
    } catch (error) {
      setUploadState({
        phase: 'error',
        message: error.message || copy.communitySubmitError,
        progress: 0,
      })
    }
  }

  const submitPost = async (event) => {
    event.preventDefault()
    if (!authToken) return

    setPostState({ phase: 'saving', message: copy.saving })

    try {
      const payload = await createCommunityPost(authToken, postForm)
      setDashboard((current) => ({ ...current, posts: [payload.post, ...current.posts] }))
      setPostForm(emptyPostForm)
      setPostState({ phase: 'done', message: copy.communityPostSubmitted })
    } catch (error) {
      setPostState({ phase: 'error', message: error.message || copy.communityPostError })
    }
  }

  const deleteUpload = async (id) => {
    if (!authToken) return

    setDeletingId(id)
    try {
      await deleteAccountCommunityUpload(authToken, id)
      setDashboard((current) => ({
        ...current,
        uploads: current.uploads.filter((upload) => upload.id !== id),
      }))
    } catch (error) {
      setDashboardMessage(error.message || copy.accountStudioDeleteError)
    } finally {
      setDeletingId('')
    }
  }

  const deletePost = async (id) => {
    if (!authToken) return

    setDeletingId(id)
    try {
      await deleteAccountCommunityPost(authToken, id)
      setDashboard((current) => ({
        ...current,
        posts: current.posts.filter((post) => post.id !== id),
      }))
    } catch (error) {
      setDashboardMessage(error.message || copy.accountStudioDeleteError)
    } finally {
      setDeletingId('')
    }
  }

  if (visitorLoading) {
    return (
      <AccountShell copy={copy} language={language} onLanguageChange={onLanguageChange}>
        <section className="account-state-card">
          <p className="section-kicker">{copy.account}</p>
          <h1>{copy.accountCheckingTitle}</h1>
          <p>{copy.accountChecking}</p>
          <SkeletonRows count={2} />
        </section>
      </AccountShell>
    )
  }

  if (!visitorUser) {
    return (
      <AccountShell copy={copy} language={language} onLanguageChange={onLanguageChange}>
        <section className="account-state-card">
          <p className="section-kicker">{copy.account}</p>
          <h1>{copy.accountLoginRequiredTitle}</h1>
          <p>{copy.accountLoginRequired}</p>
          <div className="account-center-actions">
            <a href="/login?mode=login" className="primary-action">
              {copy.authLogin}
            </a>
            <a href="/" className="secondary-action">
              {copy.accountBackHome}
            </a>
          </div>
        </section>
      </AccountShell>
    )
  }

  const metrics = [
    ['overview', copy.accountStatLikes, likeCount],
    ['comments', copy.accountStatComments, comments.length],
    ['downloads', copy.accountStatDownloads, downloads.length],
    ['community', copy.accountStatResources, dashboard.uploads.length],
    ['community', copy.accountStatPosts, dashboard.posts.length],
  ]

  const renderOverview = () => (
    <div className="account-section-stack">
      <section className="admin-section">
        <div className="admin-section-header">
          <h2>{copy.accountProfileTitle}</h2>
        </div>
        <article className="account-profile-card">
          <span className="account-avatar" aria-hidden="true">
            {getInitials(visitorUser.displayName, visitorUser.email)}
          </span>
          <div className="account-profile-meta">
            <strong>{visitorUser.displayName}</strong>
            <span>{visitorUser.email}</span>
            <div className="account-profile-pills">
              <span className="account-tag">
                {getAccessLevelLabel(visitorUser.accessLevel, language)}
              </span>
              <StatusPill ok={visitorUser.emailVerified} copy={copy} />
            </div>
            <small>
              {copy.accountMemberSince}: {formatDate(visitorUser.createdAt)}
            </small>
          </div>
        </article>
      </section>

      <section className="admin-section">
        <div className="admin-section-header">
          <h2>{copy.accountStatusTitle}</h2>
        </div>
        <div className="account-stat-grid">
          <article className="account-center-card">
            <span>{copy.authEmailStatus}</span>
            <strong>
              {visitorUser.emailVerified ? copy.accountStatusVerified : copy.accountStatusUnverified}
            </strong>
          </article>
          <article className="account-center-card">
            <span>{copy.accountCanDownload}</span>
            <strong>{canDownload ? copy.accountCanDownloadYes : copy.accountCanDownloadNo}</strong>
          </article>
          <article className="account-center-card">
            <span>{copy.accountStatComments}</span>
            <strong>{commentsStatus === 'loading' ? copy.loading : comments.length}</strong>
          </article>
          <article className="account-center-card">
            <span>{copy.accountStatLikes}</span>
            <strong>{commentsStatus === 'loading' ? copy.loading : likeCount}</strong>
          </article>
          <article className="account-center-card">
            <span>{copy.accountStatDownloads}</span>
            <strong>{downloadsStatus === 'loading' ? copy.loading : downloads.length}</strong>
          </article>
          <article className="account-center-card">
            <span>{copy.accountStatResources}</span>
            <strong>{dashboardStatus === 'loading' ? copy.loading : dashboard.uploads.length}</strong>
          </article>
        </div>
      </section>
    </div>
  )

  const renderDownloads = () => (
    <section className="admin-section">
      <div className="admin-section-header">
        <h2>{copy.accountDownloadsTitle}</h2>
        <div className="flex items-center gap-3">
          <span>{downloads.length}</span>
          <button
            type="button"
            className="secondary-action"
            disabled={downloadsStatus === 'loading'}
            onClick={refreshDownloads}
          >
            {downloadsStatus === 'loading' ? copy.loading : copy.accountStudioRefresh}
          </button>
        </div>
      </div>
      <p className="account-section-intro">{copy.accountDownloadsIntro}</p>
      {downloadsMessage && <p className="text-coral">{downloadsMessage}</p>}
      {downloadsStatus === 'loading' && <SkeletonRows count={3} />}
      {downloadsStatus !== 'loading' && (
        <div className="admin-table">
          {downloads.map((item) => (
            <article key={item.id} className="admin-row">
              <div>
                <div className="admin-row-title">
                  <strong>{item.projectTitle}</strong>
                </div>
                {item.purpose && <p>{item.purpose}</p>}
                <small>{formatDate(item.createdAt)}</small>
              </div>
              <div className="admin-actions">
                <span className={`status-pill status-${item.status}`}>
                  {getStatusLabel(copy, item.status)}
                </span>
              </div>
            </article>
          ))}
          {downloadsStatus === 'ready' && downloads.length === 0 && (
            <EmptyState
              title={copy.accountDownloadsEmptyTitle}
              body={copy.accountDownloadsEmptyBody}
            />
          )}
        </div>
      )}
    </section>
  )

  const renderComments = () => (
    <section className="admin-section">
      <div className="admin-section-header">
        <h2>{copy.accountCommentsTitle}</h2>
        <div className="flex items-center gap-3">
          <span>{comments.length}</span>
          <button
            type="button"
            className="secondary-action"
            disabled={commentsStatus === 'loading'}
            onClick={refreshComments}
          >
            {commentsStatus === 'loading' ? copy.loading : copy.accountStudioRefresh}
          </button>
        </div>
      </div>
      <p className="account-section-intro">{copy.accountCommentsIntro}</p>
      {commentsMessage && <p className="text-coral">{commentsMessage}</p>}
      {commentsStatus === 'loading' && <SkeletonRows count={3} />}
      {commentsStatus !== 'loading' && (
        <div className="admin-table">
          {comments.map((item) => (
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
          {commentsStatus === 'ready' && comments.length === 0 && (
            <EmptyState
              title={copy.accountCommentsEmptyTitle}
              body={copy.accountCommentsEmptyBody}
            />
          )}
        </div>
      )}
    </section>
  )

  const renderCommunity = () => (
    <div className="account-section-stack">
      <section className="admin-section">
        <div className="admin-section-header">
          <h2>{copy.accountStudioTitle}</h2>
          <button
            type="button"
            className="secondary-action"
            disabled={dashboardStatus === 'loading'}
            onClick={refreshDashboard}
          >
            {dashboardStatus === 'loading' ? copy.loading : copy.accountStudioRefresh}
          </button>
        </div>
        <p className="account-section-intro">{copy.accountStudioIntro}</p>

        <div className="account-stat-grid">
          <article className="account-center-card">
            <span>{copy.accountStudioResources}</span>
            <strong>{dashboard.uploads.length}</strong>
          </article>
          <article className="account-center-card">
            <span>{copy.accountStudioPosts}</span>
            <strong>{dashboard.posts.length}</strong>
          </article>
          <article className="account-center-card">
            <span>{copy.accountStudioPending}</span>
            <strong>{pendingCount}</strong>
          </article>
          <article className="account-center-card">
            <span>{copy.accountStudioApproved}</span>
            <strong>{approvedCount}</strong>
          </article>
        </div>

        {dashboardMessage && <p className="text-coral">{dashboardMessage}</p>}

        <div className="visitor-studio-forms">
          <form
            id="visitor-studio-upload"
            className="community-upload-form scroll-mt-24"
            onSubmit={submitUpload}
          >
            <h3 className="visitor-studio-form-title">{copy.communityUploadTitle}</h3>
            <label className="field-label">
              {copy.communityResourceTitle}
              <input
                className="field-input field-input-focus"
                value={uploadForm.title}
                onChange={(event) =>
                  setUploadForm((current) => ({ ...current, title: event.target.value }))
                }
                required
              />
            </label>
            <label className="field-label">
              {copy.communityCategory}
              <select
                className="field-input field-input-focus"
                value={uploadForm.assetCategory}
                onChange={(event) =>
                  setUploadForm((current) => ({ ...current, assetCategory: event.target.value }))
                }
              >
                {categories.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label md:col-span-2">
              {copy.communityDescription}
              <textarea
                className="field-input field-input-focus min-h-24 resize-none"
                value={uploadForm.description}
                onChange={(event) =>
                  setUploadForm((current) => ({ ...current, description: event.target.value }))
                }
                required
              />
            </label>
            <label className="field-label md:col-span-2">
              {copy.communityFile}
              <input
                className="field-input field-input-focus"
                type="file"
                onChange={(event) =>
                  setUploadForm((current) => ({
                    ...current,
                    file: event.target.files?.[0] || null,
                  }))
                }
                required
              />
              <span className="text-xs text-neutral-500">{copy.communityChooseFile}</span>
            </label>
            <button
              type="submit"
              className="primary-action md:col-span-2"
              disabled={uploadState.phase === 'uploading'}
            >
              {uploadState.phase === 'uploading' ? copy.communityUploading : copy.communitySubmit}
            </button>
            {uploadState.phase !== 'idle' && (
              <p
                className={`community-submit-message ${
                  uploadState.phase === 'error' ? 'text-coral' : 'text-neutral-300'
                }`}
              >
                {uploadState.message}
              </p>
            )}
          </form>

          <form className="community-post-form" onSubmit={submitPost}>
            <h3 className="visitor-studio-form-title">{copy.communityPostSubmit}</h3>
            <label className="field-label">
              {copy.communityPostTopic}
              <select
                className="field-input field-input-focus"
                value={postForm.topic}
                onChange={(event) =>
                  setPostForm((current) => ({ ...current, topic: event.target.value }))
                }
              >
                {topicKeys.map((topic) => (
                  <option key={topic} value={topic}>
                    {getTopicLabel(copy, topic)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              {copy.communityPostTitle}
              <input
                className="field-input field-input-focus"
                value={postForm.title}
                onChange={(event) =>
                  setPostForm((current) => ({ ...current, title: event.target.value }))
                }
                required
              />
            </label>
            <label className="field-label md:col-span-2">
              {copy.communityPostMessage}
              <textarea
                className="field-input field-input-focus min-h-32 resize-none"
                value={postForm.message}
                onChange={(event) =>
                  setPostForm((current) => ({ ...current, message: event.target.value }))
                }
                required
              />
            </label>
            <button
              type="submit"
              className="primary-action md:col-span-2"
              disabled={postState.phase === 'saving'}
            >
              {postState.phase === 'saving' ? copy.saving : copy.communityPostSubmit}
            </button>
            {postState.phase !== 'idle' && (
              <p
                className={`community-submit-message ${
                  postState.phase === 'error' ? 'text-coral' : 'text-neutral-300'
                }`}
              >
                {postState.message}
              </p>
            )}
          </form>
        </div>
      </section>

      <section className="admin-section">
        <div className="admin-section-header">
          <h2>{copy.accountStudioMyResources}</h2>
          <span>{dashboardStatus === 'loading' ? copy.loading : dashboard.uploads.length}</span>
        </div>
        {dashboardStatus === 'loading' && <SkeletonRows count={2} />}
        {dashboardStatus !== 'loading' && (
          <div className="admin-table">
            {dashboard.uploads.map((upload) => {
              const category = getAssetCategoryProfile(
                { assetCategory: upload.assetCategory },
                language,
              )

              return (
                <article key={upload.id} className="admin-row">
                  <div>
                    <div className="admin-row-title">
                      <strong>{upload.title}</strong>
                      <span>{category.label}</span>
                    </div>
                    <p>{upload.description}</p>
                    <small>
                      {upload.fileName} · {formatFileSize(upload.fileSize)} ·{' '}
                      {formatDate(upload.createdAt)}
                    </small>
                  </div>
                  <div className="admin-actions">
                    <span className={`status-pill status-${upload.status}`}>
                      {getStatusLabel(copy, upload.status)}
                    </span>
                    <a
                      className="secondary-action"
                      href={upload.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {copy.communityOpenFile}
                    </a>
                    <button
                      type="button"
                      className="danger-action"
                      disabled={deletingId === upload.id}
                      onClick={() => deleteUpload(upload.id)}
                    >
                      {deletingId === upload.id ? copy.loading : copy.accountStudioDelete}
                    </button>
                  </div>
                </article>
              )
            })}
            {dashboardStatus === 'ready' && dashboard.uploads.length === 0 && (
              <EmptyState
                title={copy.accountStudioNoResourcesTitle}
                body={copy.accountStudioNoResourcesBody}
              />
            )}
          </div>
        )}
      </section>

      <section className="admin-section">
        <div className="admin-section-header">
          <h2>{copy.accountStudioMyPosts}</h2>
          <span>{dashboardStatus === 'loading' ? copy.loading : dashboard.posts.length}</span>
        </div>
        {dashboardStatus === 'loading' && <SkeletonRows count={2} />}
        {dashboardStatus !== 'loading' && (
          <div className="admin-table">
            {dashboard.posts.map((post) => (
              <article key={post.id} className="admin-row">
                <div>
                  <div className="admin-row-title">
                    <strong>{post.title}</strong>
                    <span>{getTopicLabel(copy, post.topic)}</span>
                  </div>
                  <p>{post.message}</p>
                  <small>{formatDate(post.createdAt)}</small>
                </div>
                <div className="admin-actions">
                  <button
                    type="button"
                    className="danger-action"
                    disabled={deletingId === post.id}
                    onClick={() => deletePost(post.id)}
                  >
                    {deletingId === post.id ? copy.loading : copy.accountStudioDelete}
                  </button>
                </div>
              </article>
            ))}
            {dashboardStatus === 'ready' && dashboard.posts.length === 0 && (
              <EmptyState
                title={copy.accountStudioNoPostsTitle}
                body={copy.accountStudioNoPostsBody}
              />
            )}
          </div>
        )}
      </section>
    </div>
  )

  const renderSettings = () => (
    <section className="admin-section">
      <div className="admin-section-header">
        <h2>{copy.accountSettingsTitle}</h2>
      </div>
      <p className="account-section-intro">{copy.accountSettingsIntro}</p>
      <div className="account-stat-grid">
        <article className="account-center-card">
          <span>{copy.authDisplayName}</span>
          <strong>{visitorUser.displayName}</strong>
        </article>
        <article className="account-center-card">
          <span>{copy.authEmail}</span>
          <strong>{visitorUser.email}</strong>
        </article>
        <article className="account-center-card">
          <span>{copy.accessLevel}</span>
          <strong>{getAccessLevelLabel(visitorUser.accessLevel, language)}</strong>
        </article>
        <article className="account-center-card">
          <span>{copy.accountMemberSince}</span>
          <strong>{formatDate(visitorUser.createdAt)}</strong>
        </article>
      </div>
      <div className="asset-editor-note">
        <strong>{copy.authEmailStatus}</strong>
        <span>
          {visitorUser.emailVerified
            ? copy.accountSettingsVerifiedHint
            : copy.accountSettingsVerifyHint}
        </span>
      </div>
      <div className="account-center-actions">
        {!visitorUser.emailVerified && (
          <a href="/login?mode=verify" className="primary-action">
            {copy.accountSettingsVerifyAction}
          </a>
        )}
        <a href="/" className="secondary-action">
          {copy.accountBackHome}
        </a>
        <button type="button" className="danger-action" onClick={onLogout}>
          {copy.accountSignOut}
        </button>
      </div>
    </section>
  )

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'downloads':
        return renderDownloads()
      case 'comments':
        return renderComments()
      case 'community':
        return renderCommunity()
      case 'settings':
        return renderSettings()
      default:
        return renderOverview()
    }
  }

  return (
    <main className="admin-shell account-shell">
      <header className="admin-header">
        <div>
          <p className="section-kicker mb-1">{copy.accountCenterKicker}</p>
          <h1 className="text-3xl font-semibold text-white">{copy.accountCenter}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <LanguageSwitch language={language} onLanguageChange={onLanguageChange} copy={copy} />
          <a href="/" className="secondary-action">
            {copy.accountBackHome}
          </a>
          <button type="button" className="danger-action" onClick={onLogout}>
            {copy.accountSignOut}
          </button>
        </div>
      </header>

      <section className="admin-metrics">
        {metrics.map(([tab, label, value], index) => (
          <button
            key={`${label}-${index}`}
            type="button"
            className={`admin-metric ${activeTab === tab ? 'admin-metric-active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            <span>{label}</span>
            <strong>{value}</strong>
          </button>
        ))}
      </section>

      <div className="account-layout">
        <nav className="account-nav admin-tabs">
          {accountTabs.map((tab) => (
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

        <div className="account-content">{renderActiveTab()}</div>
      </div>
    </main>
  )
}

export default AccountPage
