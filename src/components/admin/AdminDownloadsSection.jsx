import { formatDate } from '../../lib/admin/format'

// The approval queue. Every row is somebody waiting on an answer, which is why
// it sits under Moderation rather than beside the read-only lists.
const AdminDownloadsSection = ({ onDelete, onUpdateStatus, requests }) => (
  <section className="admin-section">
    <div className="admin-section-header">
      <h2>Download Requests</h2>
      <span>{requests.length}</span>
    </div>
    <div className="admin-table">
      {requests.map((request) => (
        <article key={request.id} className="admin-row">
          <div>
            <strong>{request.name}</strong>
            <span>{request.email}</span>
            <p>{request.purpose}</p>
            <small>
              {request.projectTitle} · {formatDate(request.createdAt)}
            </small>
            <small>
              {request.user
                ? `${request.user.displayName} · ${request.user.email} · ${request.user.accessLevel}`
                : 'Guest request'}{' '}
              · submitted as {request.visitorAccessLevel || 'guest'}
            </small>
          </div>
          <div className="admin-actions">
            <span className={`status-pill status-${request.status}`}>
              {request.status}
            </span>
            <button
              type="button"
              className="secondary-action"
              onClick={() => onUpdateStatus(request.id, 'approved')}
            >
              Approve
            </button>
            <button
              type="button"
              className="secondary-action"
              onClick={() => onUpdateStatus(request.id, 'rejected')}
            >
              Reject
            </button>
            <button
              type="button"
              className="danger-action"
              onClick={() => onDelete(request)}
            >
              Delete
            </button>
          </div>
        </article>
      ))}
      {requests.length === 0 && (
        <p className="text-sm text-neutral-500">
          No download requests match this search.
        </p>
      )}
    </div>
  </section>
)

export default AdminDownloadsSection
