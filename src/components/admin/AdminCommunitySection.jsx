import { getAssetCategoryProfile } from '../../lib/assetCategories'
import { formatDate, formatFileSize } from '../../lib/admin/format'

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
}) => (
  <section className="admin-section">
    <div className="admin-section-header">
      <h2>Community</h2>
      <span>
        {posts.length} posts · {uploads.length} uploads
      </span>
    </div>
    <div className="admin-table">
      <div className="admin-subsection-title">
        <strong>Discussion Posts</strong>
        <span>{posts.length}</span>
      </div>
      {posts.map((post) => (
        <article key={post.id} className="admin-row">
          <div>
            <div className="admin-row-title">
              <strong>{post.title}</strong>
              <span>{post.topic}</span>
            </div>
            <p>{post.message}</p>
            <small>
              {post.user
                ? `${post.user.displayName} · ${post.user.email} · ${post.user.accessLevel}`
                : 'Unknown visitor'}
            </small>
            <small>Posted {formatDate(post.createdAt)}</small>
          </div>
          <div className="admin-actions">
            <button
              type="button"
              className="danger-action"
              onClick={() => onDeletePost(post)}
            >
              Delete
            </button>
          </div>
        </article>
      ))}
      {posts.length === 0 && (
        <p className="text-sm text-neutral-500">
          No community posts match this search.
        </p>
      )}

      <div className="admin-subsection-title">
        <strong>Resource Uploads</strong>
        <span>{uploads.length}</span>
      </div>
      {uploads.map((upload) => {
        const category = getAssetCategoryProfile(
          { assetCategory: upload.assetCategory },
          'en',
        )

        return (
          <article
            key={upload.id}
            className="admin-row"
            style={{ '--category-accent': category.accent }}
          >
            <div>
              <div className="admin-row-title">
                <strong>{upload.title}</strong>
                <span>{category.label}</span>
              </div>
              <span>
                {upload.fileName} · {upload.fileType} · {formatFileSize(upload.fileSize)}
              </span>
              <p>{upload.description}</p>
              <small>
                {upload.user
                  ? `${upload.user.displayName} · ${upload.user.email} · ${upload.user.accessLevel}`
                  : 'Unknown visitor'}
              </small>
              <small>
                Submitted {formatDate(upload.createdAt)} · updated {formatDate(upload.updatedAt)}
              </small>
              <a href={upload.fileUrl} target="_blank" rel="noreferrer">
                {upload.fileUrl}
              </a>
            </div>
            <div className="admin-actions">
              <span className={`status-pill status-${upload.status}`}>
                {upload.status}
              </span>
              <button
                type="button"
                className="secondary-action"
                onClick={() => onUpdateUploadStatus(upload.id, 'approved')}
              >
                Approve
              </button>
              <button
                type="button"
                className="secondary-action"
                onClick={() => onUpdateUploadStatus(upload.id, 'rejected')}
              >
                Reject
              </button>
              <button
                type="button"
                className="danger-action"
                onClick={() => onDeleteUpload(upload)}
              >
                Delete
              </button>
            </div>
          </article>
        )
      })}
      {uploads.length === 0 && (
        <p className="text-sm text-neutral-500">
          No community uploads match this search.
        </p>
      )}

      <div className="admin-subsection-title">
        <strong>Post Comments</strong>
        <span>{comments.length}</span>
      </div>
      {comments.map((comment) => (
        <article key={comment.id} className="admin-row">
          <div>
            <div className="admin-row-title">
              <strong>{comment.author}</strong>
              <span>{comment.parentId ? 'reply' : 'comment'}</span>
            </div>
            <p>{comment.message}</p>
            <small>
              On: {comment.postTitle || comment.postId} · {comment.likeCount} likes
            </small>
            <small>
              {comment.user
                ? `${comment.user.displayName} · ${comment.user.email} · ${comment.user.accessLevel}`
                : 'Unknown visitor'}
            </small>
            <small>Posted {formatDate(comment.createdAt)}</small>
          </div>
          <div className="admin-actions">
            <button
              type="button"
              className="danger-action"
              onClick={() => onDeleteComment(comment)}
            >
              Delete
            </button>
          </div>
        </article>
      ))}
      {comments.length === 0 && (
        <p className="text-sm text-neutral-500">
          No community comments match this search.
        </p>
      )}
    </div>
  </section>
)

export default AdminCommunitySection
