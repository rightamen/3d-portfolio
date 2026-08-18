import { getAssetCategoryProfile } from '../../lib/assetCategories'
import { translateAccessLevel, translateStatus, useAdminI18n } from '../../lib/admin/i18nAdmin'
import { stagger } from '../../lib/admin/motion'

// Three lists that share one screen because they share one audience: what the
// community posted, what it uploaded, and what it said underneath.
const AdminCommunitySection = ({
  comments,
  onDeleteComment,
  onDeletePost,
  onDeleteUpload,
  onUpdateUploadStatus,
  posts,
  uploads,
}) => {
  const { fmt, language, t } = useAdminI18n()

  const byline = (user) =>
    user
      ? `${user.displayName} · ${user.email} · ${translateAccessLevel(t, user.accessLevel)}`
      : t('community.unknownVisitor')

  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <h2>{t('community.title')}</h2>
        <span>
          {t('community.meta', {
            posts: fmt.formatNumber(posts.length),
            uploads: fmt.formatNumber(uploads.length),
          })}
        </span>
      </div>
      <div className="admin-table">
        <div className="admin-subsection-title">
          <strong>{t('community.posts')}</strong>
          <span>{fmt.formatNumber(posts.length)}</span>
        </div>
        {posts.map((post, index) => (
          <article className="admin-row admin-animate-in" key={post.id} style={stagger(index)}>
            <div>
              <div className="admin-row-title">
                <strong>{post.title}</strong>
                <span>{post.topic}</span>
              </div>
              <p>{post.message}</p>
              <small>{byline(post.user)}</small>
              <small>{t('community.postedAt', { date: fmt.formatDate(post.createdAt) })}</small>
            </div>
            <div className="admin-actions">
              <button className="danger-action" onClick={() => onDeletePost(post)} type="button">
                {t('common.delete')}
              </button>
            </div>
          </article>
        ))}
        {posts.length === 0 && (
          <p className="text-sm text-neutral-500">{t('community.emptyPosts')}</p>
        )}

        <div className="admin-subsection-title">
          <strong>{t('community.uploads')}</strong>
          <span>{fmt.formatNumber(uploads.length)}</span>
        </div>
        {uploads.map((upload, index) => {
          const category = getAssetCategoryProfile({ assetCategory: upload.assetCategory }, language)

          return (
            <article
              className="admin-row admin-animate-in"
              key={upload.id}
              style={{ ...stagger(index), '--category-accent': category.accent }}
            >
              <div>
                <div className="admin-row-title">
                  <strong>{upload.title}</strong>
                  <span>{category.label}</span>
                </div>
                <span>
                  {upload.fileName} · {upload.fileType} · {fmt.formatFileSize(upload.fileSize)}
                </span>
                <p>{upload.description}</p>
                <small>{byline(upload.user)}</small>
                <small>
                  {t('community.submittedAt', {
                    created: fmt.formatDate(upload.createdAt),
                    updated: fmt.formatDate(upload.updatedAt),
                  })}
                </small>
                <a href={upload.fileUrl} rel="noreferrer" target="_blank">
                  {upload.fileUrl}
                </a>
              </div>
              <div className="admin-actions">
                <span className={`status-pill status-${upload.status}`}>
                  {translateStatus(t, upload.status)}
                </span>
                <button
                  className="secondary-action"
                  onClick={() => onUpdateUploadStatus(upload.id, 'approved')}
                  type="button"
                >
                  {t('common.approve')}
                </button>
                <button
                  className="secondary-action"
                  onClick={() => onUpdateUploadStatus(upload.id, 'rejected')}
                  type="button"
                >
                  {t('common.reject')}
                </button>
                <button
                  className="danger-action"
                  onClick={() => onDeleteUpload(upload)}
                  type="button"
                >
                  {t('common.delete')}
                </button>
              </div>
            </article>
          )
        })}
        {uploads.length === 0 && (
          <p className="text-sm text-neutral-500">{t('community.emptyUploads')}</p>
        )}

        <div className="admin-subsection-title">
          <strong>{t('community.comments')}</strong>
          <span>{fmt.formatNumber(comments.length)}</span>
        </div>
        {comments.map((comment, index) => (
          <article className="admin-row admin-animate-in" key={comment.id} style={stagger(index)}>
            <div>
              <div className="admin-row-title">
                <strong>{comment.author}</strong>
                <span>{comment.parentId ? t('community.reply') : t('community.comment')}</span>
              </div>
              <p>{comment.message}</p>
              <small>
                {t('community.onPost', {
                  likes: fmt.formatNumber(comment.likeCount),
                  title: comment.postTitle || comment.postId,
                })}
              </small>
              <small>{byline(comment.user)}</small>
              <small>{t('community.postedAt', { date: fmt.formatDate(comment.createdAt) })}</small>
            </div>
            <div className="admin-actions">
              <button
                className="danger-action"
                onClick={() => onDeleteComment(comment)}
                type="button"
              >
                {t('common.delete')}
              </button>
            </div>
          </article>
        ))}
        {comments.length === 0 && (
          <p className="text-sm text-neutral-500">{t('community.emptyComments')}</p>
        )}
      </div>
    </section>
  )
}

export default AdminCommunitySection
