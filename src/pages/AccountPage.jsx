import { useEffect, useMemo, useState } from 'react'
import { assetCategoryProfiles, getAssetCategoryProfile } from '../lib/assetCategories'
import {
  createCommunityPost,
  deleteAccountCommunityPost,
  deleteAccountCommunityUpload,
  getAccountCommunity,
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

const AccountPage = ({
  authToken,
  copy,
  language,
  onLanguageChange,
  onLogout,
  visitorLoading,
  visitorUser,
}) => {
  const [dashboard, setDashboard] = useState({ posts: [], uploads: [] })
  const [dashboardStatus, setDashboardStatus] = useState('idle')
  const [dashboardMessage, setDashboardMessage] = useState('')
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

  useEffect(() => {
    refreshDashboard()
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
        <section className="auth-card">
          <p className="section-kicker">{copy.account}</p>
          <h1>{copy.accountCheckingTitle}</h1>
          <p>{copy.accountChecking}</p>
        </section>
      </AccountShell>
    )
  }

  if (!visitorUser) {
    return (
      <AccountShell copy={copy} language={language} onLanguageChange={onLanguageChange}>
        <section className="auth-card">
          <p className="section-kicker">{copy.account}</p>
          <h1>{copy.accountLoginRequiredTitle}</h1>
          <p>{copy.accountLoginRequired}</p>
          <a href="/login?mode=login" className="primary-action">
            {copy.authLogin}
          </a>
        </section>
      </AccountShell>
    )
  }

  return (
    <main className="auth-page">
      <nav className="auth-nav">
        <a href="/" className="text-xl font-bold text-neutral-300 hover:text-white">
          mrright.blog
        </a>
        <div className="flex items-center gap-3">
          <a href="/" className="secondary-action">
            {copy.navHome}
          </a>
          <LanguageSwitch language={language} onLanguageChange={onLanguageChange} copy={copy} />
        </div>
      </nav>

      <section className="account-center">
        <div className="account-center-hero">
          <p className="section-kicker">{copy.accountCenterKicker}</p>
          <h1>{copy.accountCenterTitle}</h1>
          <p>{copy.accountCenterIntro}</p>
        </div>

        <div className="account-center-grid">
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
            <span>{copy.authEmailStatus}</span>
            <strong>{visitorUser.emailVerified ? copy.authVerified : copy.authUnverified}</strong>
          </article>
        </div>

        <div className="account-center-actions">
          <a href="#visitor-studio-upload" className="primary-action">
            {copy.accountStudioUploadNow}
          </a>
          <a href="#visitor-studio" className="secondary-action">
            {copy.accountStudioOpen}
          </a>
          <a href="/#community" className="secondary-action">
            {copy.navCommunity}
          </a>
          <button type="button" className="danger-action" onClick={onLogout}>
            {copy.authLogout}
          </button>
        </div>

        <section id="visitor-studio" className="visitor-studio">
          <div className="visitor-studio-header">
            <div>
              <p className="section-kicker">{copy.accountStudioKicker}</p>
              <h2>{copy.accountStudioTitle}</h2>
              <p>{copy.accountStudioIntro}</p>
            </div>
            <button
              type="button"
              className="secondary-action"
              disabled={dashboardStatus === 'loading'}
              onClick={refreshDashboard}
            >
              {dashboardStatus === 'loading' ? copy.loading : copy.accountStudioRefresh}
            </button>
          </div>

          <div className="visitor-studio-stats">
            <article>
              <span>{copy.accountStudioResources}</span>
              <strong>{dashboard.uploads.length}</strong>
            </article>
            <article>
              <span>{copy.accountStudioPosts}</span>
              <strong>{dashboard.posts.length}</strong>
            </article>
            <article>
              <span>{copy.accountStudioPending}</span>
              <strong>{pendingCount}</strong>
            </article>
            <article>
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

          <div className="visitor-studio-lists">
            <section>
              <div className="community-list-header">
                <h3>{copy.accountStudioMyResources}</h3>
                <span>{dashboardStatus === 'loading' ? copy.loading : dashboard.uploads.length}</span>
              </div>
              <div className="visitor-studio-list">
                {dashboard.uploads.map((upload) => {
                  const category = getAssetCategoryProfile(
                    { assetCategory: upload.assetCategory },
                    language,
                  )

                  return (
                    <article key={upload.id} className="visitor-studio-item">
                      <div>
                        <span className="project-category-badge">{category.label}</span>
                        <h4>{upload.title}</h4>
                        <p>{upload.description}</p>
                        <small>
                          {upload.fileName} · {formatFileSize(upload.fileSize)} ·{' '}
                          {formatDate(upload.createdAt)}
                        </small>
                      </div>
                      <div className="visitor-studio-item-actions">
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
                  <div className="asset-empty-state">
                    <strong>{copy.accountStudioNoResourcesTitle}</strong>
                    <span>{copy.accountStudioNoResourcesBody}</span>
                  </div>
                )}
              </div>
            </section>

            <section>
              <div className="community-list-header">
                <h3>{copy.accountStudioMyPosts}</h3>
                <span>{dashboardStatus === 'loading' ? copy.loading : dashboard.posts.length}</span>
              </div>
              <div className="visitor-studio-list">
                {dashboard.posts.map((post) => (
                  <article key={post.id} className="visitor-studio-item">
                    <div>
                      <span className="community-user-pill">{getTopicLabel(copy, post.topic)}</span>
                      <h4>{post.title}</h4>
                      <p>{post.message}</p>
                      <small>{formatDate(post.createdAt)}</small>
                    </div>
                    <div className="visitor-studio-item-actions">
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
                  <div className="asset-empty-state">
                    <strong>{copy.accountStudioNoPostsTitle}</strong>
                    <span>{copy.accountStudioNoPostsBody}</span>
                  </div>
                )}
              </div>
            </section>
          </div>
        </section>
      </section>
    </main>
  )
}

export default AccountPage
