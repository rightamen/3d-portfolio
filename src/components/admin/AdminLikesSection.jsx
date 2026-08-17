import { formatDate } from '../../lib/admin/format'

// Read-only. There is nothing to moderate here; it exists to answer "who liked
// what" without opening the database.
const AdminLikesSection = ({ likes }) => (
  <section className="admin-section">
    <div className="admin-section-header">
      <h2>Likes</h2>
      <span>{likes.length}</span>
    </div>
    <div className="admin-table">
      {likes.map((like) => (
        <article
          key={`${like.projectSlug}-${like.visitorId}`}
          className="admin-row"
        >
          <div>
            <strong>{like.projectSlug}</strong>
            <span>{like.visitorId}</span>
            <p>
              {like.user
                ? `${like.user.displayName} (${like.user.email}) liked this project.`
                : 'Guest visitor liked this project.'}
            </p>
            {like.user && <small>Access level: {like.user.accessLevel}</small>}
            <small>{formatDate(like.createdAt)}</small>
          </div>
        </article>
      ))}
      {likes.length === 0 && (
        <p className="text-sm text-neutral-500">No likes match this search.</p>
      )}
    </div>
  </section>
)

export default AdminLikesSection
