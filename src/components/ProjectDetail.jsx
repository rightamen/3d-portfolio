import { lazy, Suspense, useEffect, useState } from 'react'
import {
  addProjectComment,
  getProject,
  getProjectInteractions,
  requestProjectDownload,
  toggleProjectLike,
} from '../lib/api'
import { getAssetCategoryProfile } from '../lib/assetCategories'
import { pickLocalized, translateKnownLabel } from '../lib/i18n'

const ModelPreview = lazy(() => import('./ModelPreview'))

const getVisitorId = () => {
  const key = 'mrright-visitor-id'
  const existing = window.localStorage.getItem(key)
  if (existing) return existing

  const created =
    window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  window.localStorage.setItem(key, created)
  return created
}

const ProjectDetail = ({ slug, onClose, language, copy }) => {
  const [project, setProject] = useState(null)
  const [interactions, setInteractions] = useState({ comments: [], likeCount: 0 })
  const [commentForm, setCommentForm] = useState({ author: '', message: '' })
  const [downloadForm, setDownloadForm] = useState({ name: '', email: '', purpose: '' })
  const [status, setStatus] = useState('loading')
  const [downloadStatus, setDownloadStatus] = useState('idle')
  const [interactionStatus, setInteractionStatus] = useState('idle')
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isRequestOpen, setIsRequestOpen] = useState(false)
  const [liked, setLiked] = useState(false)

  useEffect(() => {
    let isMounted = true

    Promise.all([getProject(slug), getProjectInteractions(slug)])
      .then(([projectPayload, interactionPayload]) => {
        if (!isMounted) return
        setProject(projectPayload.project)
        setInteractions(interactionPayload)
        setLiked(window.localStorage.getItem(`mrright-liked-${slug}`) === 'true')
        setStatus('ready')
      })
      .catch(() => {
        if (isMounted) setStatus('error')
      })

    return () => {
      isMounted = false
    }
  }, [slug])

  const submitLike = async () => {
    setInteractionStatus('saving')
    try {
      const result = await toggleProjectLike(slug, getVisitorId())
      setLiked(result.liked)
      setInteractions((current) => ({
        ...current,
        likeCount: result.likeCount,
      }))
      window.localStorage.setItem(`mrright-liked-${slug}`, String(result.liked))
      setInteractionStatus('idle')
    } catch {
      setInteractionStatus('error')
    }
  }

  const submitComment = async (event) => {
    event.preventDefault()
    setInteractionStatus('saving')

    try {
      const payload = await addProjectComment(slug, commentForm)
      setInteractions((current) => ({
        ...current,
        comments: [...current.comments, payload.comment],
      }))
      setCommentForm((current) => ({ ...current, message: '' }))
      setInteractionStatus('idle')
    } catch {
      setInteractionStatus('error')
    }
  }

  const submitDownloadRequest = async (event) => {
    event.preventDefault()
    setDownloadStatus('saving')

    try {
      await requestProjectDownload(slug, downloadForm)
      setDownloadForm({ name: '', email: '', purpose: '' })
      setDownloadStatus('sent')
    } catch {
      setDownloadStatus('error')
    }
  }

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const category = project ? getAssetCategoryProfile(project, language) : null
  const projectTitle = project ? pickLocalized(project, 'title', language) : ''
  const projectSummary = project ? pickLocalized(project, 'summary', language) : ''
  const projectWorkflow = project ? pickLocalized(project, 'workflow', language) : ''
  const dateLocale = language === 'zh' ? 'zh-CN' : language === 'ja' ? 'ja-JP' : 'en-US'

  return (
    <div className="detail-overlay" role="dialog" aria-modal="true">
      <article className="detail-panel">
        <div className="detail-header">
          <div>
            <div className="section-kicker mb-1">{copy.detailKicker}</div>
            <h3 className="text-2xl font-semibold text-white">
              {projectTitle || copy.loadingProject}
            </h3>
          </div>
          <button type="button" className="secondary-action" onClick={onClose}>
            {copy.close}
          </button>
        </div>

        {status === 'loading' && (
          <div className="p-6 text-neutral-400">{copy.loadingProjectDetails}</div>
        )}

        {status === 'error' && (
          <div className="p-6 text-coral">{copy.projectLoadError}</div>
        )}

        {project && (
          <div className="detail-body">
            <div className="detail-media">
              <img src={project.image} alt="" className="h-full w-full object-cover" />
            </div>

            <div className="detail-content">
              <div
                className="detail-category-banner"
                style={{ '--category-accent': category.accent }}
              >
                <span>{category.label}</span>
                <p>{category.description}</p>
              </div>

              <p className="leading-relaxed text-neutral-300">{projectSummary}</p>

              <div className="detail-stat-grid">
                <div className="detail-stat">
                  <span>{copy.year}</span>
                  <strong>{project.year}</strong>
                </div>
                <div className="detail-stat">
                  <span>{copy.format}</span>
                  <strong>
                    {translateKnownLabel(
                      pickLocalized(project, 'format', language) || copy.modelPreviewFallback,
                      language,
                    )}
                  </strong>
                </div>
                <div className="detail-stat">
                  <span>{copy.modelSize}</span>
                  <strong>
                    {translateKnownLabel(
                      pickLocalized(project, 'modelSize', language) || copy.assetPreviewFallback,
                      language,
                    )}
                  </strong>
                </div>
                <div className="detail-stat">
                  <span>{copy.downloadPolicy}</span>
                  <strong>
                    {translateKnownLabel(
                      pickLocalized(project, 'downloadPolicy', language) || copy.requestOnly,
                      language,
                    )}
                  </strong>
                </div>
              </div>

              <section>
                <h4 className="detail-subtitle">{copy.workflow}</h4>
                <p className="leading-relaxed text-neutral-400">
                  {projectWorkflow || copy.workflowFallback}
                </p>
              </section>

              <section>
                <h4 className="detail-subtitle">{copy.viewerFeatures}</h4>
                <div className="flex flex-wrap gap-2">
                  {(project.viewerFeatures || []).map((feature) => (
                    <span key={feature} className="skill-pill">
                      {translateKnownLabel(feature, language)}
                    </span>
                  ))}
                </div>
              </section>

              <section>
                <h4 className="detail-subtitle">{copy.productionTags}</h4>
                <div className="flex flex-wrap gap-2">
                  {project.stack.map((tag) => (
                    <span key={tag} className="skill-pill">
                      {tag}
                    </span>
                  ))}
                </div>
              </section>

              <div className="flex flex-col gap-3 sm:flex-row">
                {project.modelUrl && (
                  <button
                    type="button"
                    className="primary-action flex-1"
                    onClick={() => setIsPreviewOpen(true)}
                  >
                    {copy.openModelViewer}
                  </button>
                )}
                <button
                  type="button"
                  className="secondary-action flex-1"
                  onClick={() => setIsRequestOpen((current) => !current)}
                >
                  {copy.requestDownload}
                </button>
              </div>

              {isRequestOpen && (
                <section className="download-request-panel">
                  <div>
                    <h4 className="detail-subtitle mb-1">{copy.downloadRequest}</h4>
                    <p className="text-sm leading-relaxed text-neutral-400">
                      {copy.downloadRequestHint}
                    </p>
                  </div>

                  <form className="comment-form" onSubmit={submitDownloadRequest}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        className="field-input field-input-focus"
                        name="name"
                        placeholder={copy.name}
                        value={downloadForm.name}
                        onChange={(event) =>
                          setDownloadForm((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        required
                      />
                      <input
                        className="field-input field-input-focus"
                        name="email"
                        placeholder={copy.email}
                        type="email"
                        value={downloadForm.email}
                        onChange={(event) =>
                          setDownloadForm((current) => ({
                            ...current,
                            email: event.target.value,
                          }))
                        }
                        required
                      />
                    </div>
                    <textarea
                      className="field-input field-input-focus min-h-28 resize-none"
                      name="purpose"
                      placeholder={copy.purpose}
                      value={downloadForm.purpose}
                      onChange={(event) =>
                        setDownloadForm((current) => ({
                          ...current,
                          purpose: event.target.value,
                        }))
                      }
                      required
                    />
                    <button
                      type="submit"
                      className="primary-action"
                      disabled={downloadStatus === 'saving'}
                    >
                      {downloadStatus === 'saving' ? copy.submitting : copy.submitRequest}
                    </button>
                    {downloadStatus === 'sent' && (
                      <p className="text-sm text-mint">
                        {copy.requestSent}
                      </p>
                    )}
                    {downloadStatus === 'error' && (
                      <p className="text-sm text-coral">
                        {copy.requestError}
                      </p>
                    )}
                  </form>
                </section>
              )}

              <section className="interaction-panel">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="detail-subtitle mb-1">{copy.interaction}</h4>
                    <p className="text-sm text-neutral-400">
                      {interactions.likeCount} {copy.likes} / {interactions.comments.length}{' '}
                      {copy.comments}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={liked ? 'primary-action' : 'secondary-action'}
                    onClick={submitLike}
                    disabled={interactionStatus === 'saving'}
                  >
                    {liked ? copy.liked : copy.like}
                  </button>
                </div>

                <form className="comment-form" onSubmit={submitComment}>
                  <input
                    className="field-input field-input-focus"
                    name="author"
                    placeholder={copy.name}
                    value={commentForm.author}
                    onChange={(event) =>
                      setCommentForm((current) => ({
                        ...current,
                        author: event.target.value,
                      }))
                    }
                    required
                  />
                  <textarea
                    className="field-input field-input-focus min-h-24 resize-none"
                    name="message"
                    placeholder={copy.comment}
                    value={commentForm.message}
                    onChange={(event) =>
                      setCommentForm((current) => ({
                        ...current,
                        message: event.target.value,
                      }))
                    }
                    required
                  />
                  <button
                    type="submit"
                    className="primary-action"
                    disabled={interactionStatus === 'saving'}
                  >
                    {interactionStatus === 'saving' ? copy.saving : copy.postComment}
                  </button>
                  {interactionStatus === 'error' && (
                    <p className="text-sm text-coral">{copy.interactionError}</p>
                  )}
                </form>

                <div className="comment-list">
                  {interactions.comments.length === 0 && (
                    <p className="text-sm text-neutral-500">
                      {copy.noComments}
                    </p>
                  )}
                  {interactions.comments.map((comment) => (
                    <article key={comment.id} className="comment-item">
                      <div className="flex items-center justify-between gap-3">
                        <strong>{comment.author}</strong>
                        <span>
                          {new Date(comment.createdAt).toLocaleDateString(dateLocale)}
                        </span>
                      </div>
                      <p>{comment.message}</p>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}
      </article>

      {project && isPreviewOpen && (
        <Suspense fallback={null}>
          <ModelPreview
            project={project}
            language={language}
            copy={copy}
            onClose={() => setIsPreviewOpen(false)}
          />
        </Suspense>
      )}
    </div>
  )
}

export default ProjectDetail
