import { translateAccessLevel, translateStatus, useAdminI18n } from '../../lib/admin/i18nAdmin'
import { stagger } from '../../lib/admin/motion'

// The approval queue. Every row is somebody waiting on an answer, which is why
// it sits under Moderation rather than beside the read-only lists.
const AdminDownloadsSection = ({ onDelete, onUpdateStatus, requests }) => {
  const { fmt, t } = useAdminI18n()

  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <h2>{t('downloads.title')}</h2>
        <span>{fmt.formatNumber(requests.length)}</span>
      </div>
      <div className="admin-table">
        {requests.map((request, index) => (
          <article className="admin-row admin-animate-in" key={request.id} style={stagger(index)}>
            <div>
              <strong>{request.name}</strong>
              <span>{request.email}</span>
              <p>{request.purpose}</p>
              <small>
                {request.projectTitle} · {fmt.formatDate(request.createdAt)}
              </small>
              <small>
                {request.user
                  ? `${request.user.displayName} · ${request.user.email} · ${translateAccessLevel(t, request.user.accessLevel)}`
                  : t('downloads.guestRequest')}{' '}
                ·{' '}
                {t('downloads.submittedAs', {
                  level: translateAccessLevel(t, request.visitorAccessLevel),
                })}
              </small>
            </div>
            <div className="admin-actions">
              <span className={`status-pill status-${request.status}`}>
                {translateStatus(t, request.status)}
              </span>
              <button
                className="secondary-action"
                onClick={() => onUpdateStatus(request.id, 'approved')}
                type="button"
              >
                {t('common.approve')}
              </button>
              <button
                className="secondary-action"
                onClick={() => onUpdateStatus(request.id, 'rejected')}
                type="button"
              >
                {t('common.reject')}
              </button>
              <button className="danger-action" onClick={() => onDelete(request)} type="button">
                {t('common.delete')}
              </button>
            </div>
          </article>
        ))}
        {requests.length === 0 && (
          <p className="text-sm text-neutral-500">{t('downloads.empty')}</p>
        )}
      </div>
    </section>
  )
}

export default AdminDownloadsSection
