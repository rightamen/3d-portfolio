import { formatDate } from '../../lib/admin/format'

// Whatever came in through the contact form.
const AdminMessagesSection = ({ messages, onDelete }) => (
  <section className="admin-section">
    <div className="admin-section-header">
      <h2>Contact Messages</h2>
      <span>{messages.length}</span>
    </div>
    <div className="admin-table">
      {messages.map((message) => (
        <article key={message.id} className="admin-row">
          <div>
            <strong>{message.name}</strong>
            <span>{message.email}</span>
            <p>{message.message}</p>
            <small>{formatDate(message.createdAt)}</small>
          </div>
          <div className="admin-actions">
            <button
              type="button"
              className="danger-action"
              onClick={() => onDelete(message)}
            >
              Delete
            </button>
          </div>
        </article>
      ))}
      {messages.length === 0 && (
        <p className="text-sm text-neutral-500">
          No contact messages match this search.
        </p>
      )}
    </div>
  </section>
)

export default AdminMessagesSection
