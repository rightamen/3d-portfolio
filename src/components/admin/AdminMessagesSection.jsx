import { useAdminI18n } from '../../lib/admin/i18nAdmin'
import { stagger } from '../../lib/admin/motion'

// Whatever came in through the contact form.
const AdminMessagesSection = ({ messages, onDelete }) => {
  const { fmt, t } = useAdminI18n()

  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <h2>{t('messages.title')}</h2>
        <span>{fmt.formatNumber(messages.length)}</span>
      </div>
      <div className="admin-table">
        {messages.map((message, index) => (
          <article className="admin-row admin-animate-in" key={message.id} style={stagger(index)}>
            <div>
              <strong>{message.name}</strong>
              <span>{message.email}</span>
              <p>{message.message}</p>
              <small>{fmt.formatDate(message.createdAt)}</small>
            </div>
            <div className="admin-actions">
              <button className="danger-action" onClick={() => onDelete(message)} type="button">
                {t('common.delete')}
              </button>
            </div>
          </article>
        ))}
        {messages.length === 0 && (
          <p className="text-sm text-neutral-500">{t('messages.empty')}</p>
        )}
      </div>
    </section>
  )
}

export default AdminMessagesSection
