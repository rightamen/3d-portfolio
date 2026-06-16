import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { assetCategoryProfiles, getAssetCategoryProfile } from '../lib/assetCategories'
import {
  createCommunityPost,
  getCommunityPost,
  getCommunityPosts,
  getCommunityUploads,
  uploadCommunityResource,
} from '../lib/api'
import { languages } from '../lib/i18n'

const CommentSection = lazy(() => import('../components/CommentSection'))

const emptyForm = {
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

const formatFileSize = (size) => {
  if (!Number.isFinite(size) || size <= 0) return ''
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`
  return `${(size / 1024 / 1024).toFixed(size > 20 * 1024 * 1024 ? 0 : 1)} MB`
}

const getTopicLabel = (copy, topic) =>
  copy[`communityTopic${topic[0].toUpperCase()}${topic.slice(1)}`] || topic

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

const CommunityShell = ({ children, copy, language, onLanguageChange }) => (
  <main className="auth-page">
    <nav className="auth-nav">
      <a href="/" className="text-xl font-bold text-neutral-300 hover:text-white">
        mrright.blog
      </a>
      <LanguageSwitch language={language} onLanguageChange={onLanguageChange} copy={copy} />
    </nav>
    <div className="community-page">{children}</div>
  </main>
)

const getPostIdFromPath = () => {
  const match = window.location.pathname.match(/^\/community\/([^/]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

const PostDetail = ({ authToken, copy, language, postId, visitorUser }) => {
  const [post, setPost] = useState(null)
  const [status, setStatus] = useState('loading')
  const dateLocale = language === 'zh' ? 'zh-CN' : language === 'ja' ? 'ja-JP' : 'en-US'

  useEffect(() => {
    let isMounted = true
    getCommunityPost(postId)
      .then((payload) => {
        if (!isMounted) return
        setPost(payload.post)
        setStatus('ready')
      })
      .catch(() => {
        if (isMounted) setStatus('error')
      })

    return () => {
      isMounted = false
    }
  }, [postId])

  if (status === 'loading') {
    return <p className="text-neutral-400">{copy.loading}</p>
  }

  if (status === 'error' || !post) {
    return (
      <div className="asset-empty-state">
        <strong>{copy.communityPostMissingTitle}</strong>
        <span>{copy.communityPostMissingBody}</span>
        <a className="secondary-action mt-4 w-fit" href="/community">
          {copy.communityBackToList}
        </a>
      </div>
    )
  }

  return (
    <div className="community-detail">
      <a className="community-back-link" href="/community">
        ← {copy.communityBackToList}
      </a>

      <article className="community-detail-post">
        <div className="community-post-meta">
          <span>{getTopicLabel(copy, post.topic)}</span>
          <small>{new Date(post.createdAt).toLocaleString(dateLocale)}</small>
        </div>
        <h1 className="community-detail-title">{post.title}</h1>
        <p className="community-detail-message">{post.message}</p>
        <small className="community-detail-author">
          {post.user?.displayName || copy.accountGuest}
        </small>
      </article>

      <Suspense fallback={<p className="text-sm text-neutral-500">{copy.loading}</p>}>
        <CommentSection
          authToken={authToken}
          copy={copy}
          language={language}
          postId={post.id}
          visitorUser={visitorUser}
        />
      </Suspense>
    </div>
  )
}

const PostList = ({ authToken, copy, language, visitorUser }) => {
  const [uploads, setUploads] = useState([])
  const [posts, setPosts] = useState([])
  const [status, setStatus] = useState('loading')
  const [form, setForm] = useState(emptyForm)
  const [postForm, setPostForm] = useState(emptyPostForm)
  const [submitState, setSubmitState] = useState({ phase: 'idle', progress: 0, message: '' })
  const [postState, setPostState] = useState({ phase: 'idle', message: '' })
  const dateLocale = language === 'zh' ? 'zh-CN' : language === 'ja' ? 'ja-JP' : 'en-US'

  const categories = useMemo(
    () =>
      assetCategoryProfiles.map((category) =>
        getAssetCategoryProfile({ assetCategory: category.value }, language),
      ),
    [language],
  )

  useEffect(() => {
    let isMounted = true

    Promise.all([getCommunityUploads(), getCommunityPosts()])
      .then(([uploadsPayload, postsPayload]) => {
        if (!isMounted) return
        setUploads(uploadsPayload.uploads || [])
        setPosts(postsPayload.posts || [])
        setStatus('ready')
      })
      .catch(() => {
        if (isMounted) setStatus('error')
      })

    return () => {
      isMounted = false
    }
  }, [])

  const submitUpload = async (event) => {
    event.preventDefault()
    if (!authToken || !form.file) return

    setSubmitState({ phase: 'uploading', progress: 0, message: copy.communityUploading })
    try {
      await uploadCommunityResource(authToken, form, form.file, (progress) => {
        setSubmitState({
          phase: 'uploading',
          progress,
          message: `${copy.communityUploading} ${progress}%`,
        })
      })
      setForm(emptyForm)
      setSubmitState({ phase: 'done', progress: 100, message: copy.communitySubmitted })
    } catch (error) {
      setSubmitState({
        phase: 'error',
        progress: 0,
        message: error.message || copy.communitySubmitError,
      })
    }
  }

  const submitPost = async (event) => {
    event.preventDefault()
    if (!authToken) return

    setPostState({ phase: 'saving', message: copy.saving })
    try {
      const payload = await createCommunityPost(authToken, postForm)
      setPosts((current) => [payload.post, ...current])
      setPostForm(emptyPostForm)
      setPostState({ phase: 'done', message: copy.communityPostSubmitted })
    } catch (error) {
      setPostState({ phase: 'error', message: error.message || copy.communityPostError })
    }
  }

  return (
    <div className="community-list-view">
      <header className="community-page-heading">
        <p className="section-kicker">{copy.communityKicker}</p>
        <h1 className="text-heading">{copy.communityTitle}</h1>
        <p>{copy.communityIntro}</p>
      </header>

      <div className="community-discussion">
        <div className="community-list-header">
          <h3>{copy.communityDiscussionTitle}</h3>
          <span>{status === 'ready' ? posts.length : copy.loading}</span>
        </div>

        {visitorUser ? (
          <form className="community-post-form" onSubmit={submitPost}>
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
                className="field-input field-input-focus min-h-24 resize-none"
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
        ) : (
          <div className="community-login-required">
            <strong>{copy.communityPostLoginTitle}</strong>
            <p>{copy.communityPostLoginRequired}</p>
            <a className="secondary-action w-fit" href="/login">
              {copy.authLogin}
            </a>
          </div>
        )}

        <div className="community-post-list">
          {posts.map((post) => (
            <a key={post.id} className="community-post-card community-post-link" href={`/community/${post.id}`}>
              <div className="community-post-meta">
                <span>{getTopicLabel(copy, post.topic)}</span>
                <small>{new Date(post.createdAt).toLocaleDateString(dateLocale)}</small>
              </div>
              <h4>{post.title}</h4>
              <p>{post.message}</p>
              <small>{post.user?.displayName || copy.accountGuest}</small>
              <span className="community-post-open">{copy.communityViewPost} →</span>
            </a>
          ))}
          {status === 'ready' && posts.length === 0 && (
            <div className="asset-empty-state">
              <strong>{copy.communityNoPostsTitle}</strong>
              <span>{copy.communityNoPostsBody}</span>
            </div>
          )}
        </div>
      </div>

      <div className="community-panel">
        <div className="community-upload-copy">
          <p className="section-kicker">{copy.communityUploadKicker}</p>
          <h3>{copy.communityUploadTitle}</h3>
          <p>{copy.communityUploadHint}</p>
        </div>

        {visitorUser ? (
          <form className="community-upload-form" onSubmit={submitUpload}>
            <label className="field-label">
              {copy.communityResourceTitle}
              <input
                className="field-input field-input-focus"
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
                required
              />
            </label>
            <label className="field-label">
              {copy.communityCategory}
              <select
                className="field-input field-input-focus"
                value={form.assetCategory}
                onChange={(event) =>
                  setForm((current) => ({ ...current, assetCategory: event.target.value }))
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
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
                required
              />
            </label>
            <label className="field-label md:col-span-2">
              {copy.communityFile}
              <span
                className={`asset-upload-control ${form.file ? 'asset-upload-control-done' : ''}`}
              >
                {form.file
                  ? `${form.file.name} · ${formatFileSize(form.file.size)}`
                  : copy.communityChooseFile}
                <input
                  type="file"
                  accept=".glb,.gltf,.fbx,.obj,.zip,.jpg,.jpeg,.png,.webp,.gif"
                  onChange={(event) =>
                    setForm((current) => ({ ...current, file: event.target.files?.[0] || null }))
                  }
                  required
                />
              </span>
              {submitState.phase !== 'idle' && (
                <span className="asset-upload-progress">
                  <span style={{ width: `${submitState.progress}%` }} />
                </span>
              )}
            </label>
            <button
              type="submit"
              className="primary-action md:col-span-2"
              disabled={submitState.phase === 'uploading'}
            >
              {submitState.phase === 'uploading' ? copy.communityUploading : copy.communitySubmit}
            </button>
            {submitState.phase !== 'idle' && (
              <p
                className={`community-submit-message ${
                  submitState.phase === 'error' ? 'text-coral' : 'text-neutral-300'
                }`}
              >
                {submitState.message}
              </p>
            )}
          </form>
        ) : (
          <div className="community-login-required">
            <strong>{copy.communityLoginRequiredTitle}</strong>
            <p>{copy.communityLoginRequired}</p>
          </div>
        )}
      </div>

      <div className="community-list-header">
        <h3>{copy.communityApprovedTitle}</h3>
        <span>{status === 'ready' ? uploads.length : copy.loading}</span>
      </div>

      {status === 'error' && <p className="text-coral">{copy.communityLoadError}</p>}
      {status === 'ready' && uploads.length === 0 && (
        <div className="asset-empty-state">
          <strong>{copy.communityEmptyTitle}</strong>
          <span>{copy.communityEmptyBody}</span>
        </div>
      )}
      {uploads.length > 0 && (
        <div className="community-grid">
          {uploads.map((upload) => {
            const category = getAssetCategoryProfile(
              { assetCategory: upload.assetCategory },
              language,
            )

            return (
              <article
                key={upload.id}
                className="community-card"
                style={{ '--category-accent': category.accent }}
              >
                {upload.previewUrl ? (
                  <img src={upload.previewUrl} alt="" />
                ) : (
                  <div className="community-file-preview">{upload.fileType}</div>
                )}
                <div>
                  <span className="project-category-badge">{category.label}</span>
                  <h4>{upload.title}</h4>
                  <p>{upload.description}</p>
                  <small>
                    {upload.user?.displayName || copy.accountGuest} ·{' '}
                    {formatFileSize(upload.fileSize)}
                  </small>
                  <a
                    className="secondary-action"
                    href={upload.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {copy.communityOpenFile}
                  </a>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

const CommunityPage = ({
  authToken,
  copy,
  language,
  onLanguageChange,
  visitorLoading,
  visitorUser,
}) => {
  const [postId, setPostId] = useState(getPostIdFromPath)

  useEffect(() => {
    const handlePopState = () => setPostId(getPostIdFromPath())
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  return (
    <CommunityShell copy={copy} language={language} onLanguageChange={onLanguageChange}>
      {postId ? (
        <PostDetail
          authToken={authToken}
          copy={copy}
          key={postId}
          language={language}
          postId={postId}
          visitorUser={visitorLoading ? null : visitorUser}
        />
      ) : (
        <PostList
          authToken={authToken}
          copy={copy}
          language={language}
          visitorUser={visitorLoading ? null : visitorUser}
        />
      )}
    </CommunityShell>
  )
}

export default CommunityPage
