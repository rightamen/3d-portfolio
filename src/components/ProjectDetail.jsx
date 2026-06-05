import { lazy, Suspense, useEffect, useState } from 'react'
import {
  addProjectComment,
  getProject,
  getProjectInteractions,
  requestProjectDownload,
  toggleProjectLike,
} from '../lib/api'
import { getAssetCategoryProfile } from '../lib/assetCategories'

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

const ProjectDetail = ({ slug, onClose }) => {
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

  return (
    <div className="detail-overlay" role="dialog" aria-modal="true">
      <article className="detail-panel">
        <div className="detail-header">
          <div>
            <div className="section-kicker mb-1">作品详情</div>
            <h3 className="text-2xl font-semibold text-white">
              {project?.title || '正在加载作品'}
            </h3>
          </div>
          <button type="button" className="secondary-action" onClick={onClose}>
            关闭
          </button>
        </div>

        {status === 'loading' && (
          <div className="p-6 text-neutral-400">正在加载作品详情...</div>
        )}

        {status === 'error' && (
          <div className="p-6 text-coral">作品详情加载失败。</div>
        )}

        {project && (
          <div className="detail-body">
            <div className="detail-media">
              <img src={project.image} alt="" className="h-full w-full object-cover" />
            </div>

            <div className="detail-content">
              <div
                className="detail-category-banner"
                style={{ '--category-accent': getAssetCategoryProfile(project).accent }}
              >
                <span>{getAssetCategoryProfile(project).label}</span>
                <p>{getAssetCategoryProfile(project).description}</p>
              </div>

              <p className="leading-relaxed text-neutral-300">{project.summary}</p>

              <div className="detail-stat-grid">
                <div className="detail-stat">
                  <span>年份</span>
                  <strong>{project.year}</strong>
                </div>
                <div className="detail-stat">
                  <span>格式</span>
                  <strong>{project.format || '模型预览'}</strong>
                </div>
                <div className="detail-stat">
                  <span>模型大小</span>
                  <strong>{project.modelSize || '预览资产'}</strong>
                </div>
                <div className="detail-stat">
                  <span>下载权限</span>
                  <strong>{project.downloadPolicy || '按申请开放'}</strong>
                </div>
              </div>

              <section>
                <h4 className="detail-subtitle">制作流程</h4>
                <p className="leading-relaxed text-neutral-400">
                  {project.workflow ||
                    '该作品围绕模型结构、材质贴图和展示效果进行整理。'}
                </p>
              </section>

              <section>
                <h4 className="detail-subtitle">预览功能</h4>
                <div className="flex flex-wrap gap-2">
                  {(project.viewerFeatures || []).map((feature) => (
                    <span key={feature} className="skill-pill">
                      {feature}
                    </span>
                  ))}
                </div>
              </section>

              <section>
                <h4 className="detail-subtitle">制作标签</h4>
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
                    打开模型查看器
                  </button>
                )}
                <button
                  type="button"
                  className="secondary-action flex-1"
                  onClick={() => setIsRequestOpen((current) => !current)}
                >
                  申请下载
                </button>
              </div>

              {isRequestOpen && (
                <section className="download-request-panel">
                  <div>
                    <h4 className="detail-subtitle mb-1">下载申请</h4>
                    <p className="text-sm leading-relaxed text-neutral-400">
                      请简单说明用途。通过审核后，我会再开放对应的下载链接。
                    </p>
                  </div>

                  <form className="comment-form" onSubmit={submitDownloadRequest}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        className="field-input field-input-focus"
                        name="name"
                        placeholder="名称"
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
                        placeholder="邮箱"
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
                      placeholder="用途说明"
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
                      {downloadStatus === 'saving' ? '提交中...' : '提交申请'}
                    </button>
                    {downloadStatus === 'sent' && (
                      <p className="text-sm text-mint">
                        申请已收到。我会先查看用途说明，再决定是否开放下载。
                      </p>
                    )}
                    {downloadStatus === 'error' && (
                      <p className="text-sm text-coral">
                        申请提交失败，请检查内容后重试。
                      </p>
                    )}
                  </form>
                </section>
              )}

              <section className="interaction-panel">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="detail-subtitle mb-1">互动</h4>
                    <p className="text-sm text-neutral-400">
                      {interactions.likeCount} 个赞 / {interactions.comments.length} 条评论
                    </p>
                  </div>
                  <button
                    type="button"
                    className={liked ? 'primary-action' : 'secondary-action'}
                    onClick={submitLike}
                    disabled={interactionStatus === 'saving'}
                  >
                    {liked ? '已点赞' : '点赞'}
                  </button>
                </div>

                <form className="comment-form" onSubmit={submitComment}>
                  <input
                    className="field-input field-input-focus"
                    name="author"
                    placeholder="名称"
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
                    placeholder="评论"
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
                    {interactionStatus === 'saving' ? '保存中...' : '发布评论'}
                  </button>
                  {interactionStatus === 'error' && (
                    <p className="text-sm text-coral">互动保存失败，请重试。</p>
                  )}
                </form>

                <div className="comment-list">
                  {interactions.comments.length === 0 && (
                    <p className="text-sm text-neutral-500">
                      暂无评论，欢迎留下第一条反馈。
                    </p>
                  )}
                  {interactions.comments.map((comment) => (
                    <article key={comment.id} className="comment-item">
                      <div className="flex items-center justify-between gap-3">
                        <strong>{comment.author}</strong>
                        <span>
                          {new Date(comment.createdAt).toLocaleDateString('zh-CN')}
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
          <ModelPreview project={project} onClose={() => setIsPreviewOpen(false)} />
        </Suspense>
      )}
    </div>
  )
}

export default ProjectDetail
