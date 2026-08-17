import { formatDate, needsCommentReview } from '../../lib/admin/format'

// Project comments, with the ones waiting on a decision sorted to the top by
// the caller. Publish and Mark Spam sit beside Delete because a false positive
// used to be deletable and nothing else.
const AdminCommentsSection = ({ comments, onDelete, onUpdateStatus, pendingCount }) => (
  <section className="admin-section">
    <div className="admin-section-header">
      <h2>Comments</h2>
      <span>
        {pendingCount
          ? `${pendingCount} waiting · ${comments.length}`
          : comments.length}
      </span>
    </div>
    <div className="admin-table">
      {comments.map((comment) => (
        <article key={comment.id} className="admin-row">
          <div>
            <div className="admin-row-title">
              <strong>{comment.author}</strong>
              {needsCommentReview(comment) && (
                <span className={`admin-state-chip admin-state-${comment.status}`}>
                  {comment.status === 'spam' ? 'Spam' : 'Awaiting review'}
                </span>
              )}
            </div>
            <span>{comment.projectSlug}</span>
            <p>{comment.message}</p>
            {comment.user && (
              <small>
                {comment.user.displayName} · {comment.user.email} · {comment.user.accessLevel}
              </small>
            )}
            <small>{formatDate(comment.createdAt)}</small>
          </div>
          <div className="admin-actions">
            {comment.status !== 'published' && (
              <button
                type="button"
                className="secondary-action"
                onClick={() => onUpdateStatus(comment.id, 'published')}
              >
                Publish
              </button>
            )}
            {comment.status !== 'spam' && (
              <button
                type="button"
                className="secondary-action"
                onClick={() => onUpdateStatus(comment.id, 'spam')}
              >
                Mark Spam
              </button>
            )}
            <button
              type="button"
              className="danger-action"
              onClick={() => onDelete(comment)}
            >
              Delete
            </button>
          </div>
        </article>
      ))}
      {comments.length === 0 && (
        <p className="text-sm text-neutral-500">No comments match this search.</p>
      )}
    </div>
  </section>
)

export default AdminCommentsSection
