import { needsCommentReview } from '../../lib/admin/format'
import { translateAccessLevel, useAdminI18n } from '../../lib/admin/i18nAdmin'
import { stagger } from '../../lib/admin/motion'

// Project comments, with the ones waiting on a decision sorted to the top by
// the caller. Publish and Mark Spam sit beside Delete because a false positive
// used to be deletable and nothing else.
const AdminCommentsSection = ({ comments, onDelete, onUpdateStatus, pendingCount }) => {
  const { fmt, t } = useAdminI18n()

  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <h2>{t('comments.title')}</h2>
        <span>
          {pendingCount
            ? t('comments.waiting', {
                count: fmt.formatNumber(pendingCount),
                total: fmt.formatNumber(comments.length),
              })
            : fmt.formatNumber(comments.length)}
        </span>
      </div>
      <div className="admin-table">
        {comments.map((comment, index) => (
          <article className="admin-row admin-animate-in" key={comment.id} style={stagger(index)}>
            <div>
              <div className="admin-row-title">
                <strong>{comment.author}</strong>
                {needsCommentReview(comment) && (
                  <span className={`admin-state-chip admin-state-${comment.status}`}>
                    {comment.status === 'spam' ? t('comments.spam') : t('comments.awaitingReview')}
                  </span>
                )}
              </div>
              <span>{comment.projectSlug}</span>
              <p>{comment.message}</p>
              {comment.user && (
                <small>
                  {comment.user.displayName} · {comment.user.email} ·{' '}
                  {translateAccessLevel(t, comment.user.accessLevel)}
                </small>
              )}
              <small>{fmt.formatDate(comment.createdAt)}</small>
            </div>
            <div className="admin-actions">
              {comment.status !== 'published' && (
                <button
                  className="secondary-action"
                  onClick={() => onUpdateStatus(comment.id, 'published')}
                  type="button"
                >
                  {t('common.publish')}
                </button>
              )}
              {comment.status !== 'spam' && (
                <button
                  className="secondary-action"
                  onClick={() => onUpdateStatus(comment.id, 'spam')}
                  type="button"
                >
                  {t('common.markSpam')}
                </button>
              )}
              <button className="danger-action" onClick={() => onDelete(comment)} type="button">
                {t('common.delete')}
              </button>
            </div>
          </article>
        ))}
        {comments.length === 0 && (
          <p className="text-sm text-neutral-500">{t('comments.empty')}</p>
        )}
      </div>
    </section>
  )
}

export default AdminCommentsSection
