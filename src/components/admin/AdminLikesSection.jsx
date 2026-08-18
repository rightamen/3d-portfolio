import { translateAccessLevel, useAdminI18n } from '../../lib/admin/i18nAdmin'
import { stagger } from '../../lib/admin/motion'

// Read-only. There is nothing to moderate here; it exists to answer "who liked
// what" without opening the database.
const AdminLikesSection = ({ likes }) => {
  const { fmt, t } = useAdminI18n()

  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <h2>{t('likes.title')}</h2>
        <span>{fmt.formatNumber(likes.length)}</span>
      </div>
      <div className="admin-table">
        {likes.map((like, index) => (
          <article
            className="admin-row admin-animate-in"
            key={`${like.projectSlug}-${like.visitorId}`}
            style={stagger(index)}
          >
            <div>
              <strong>{like.projectSlug}</strong>
              <span>{like.visitorId}</span>
              <p>
                {like.user
                  ? t('likes.byUser', { email: like.user.email, name: like.user.displayName })
                  : t('likes.byGuest')}
              </p>
              {like.user && (
                <small>{t('likes.accessLevel', { level: translateAccessLevel(t, like.user.accessLevel) })}</small>
              )}
              <small>{fmt.formatDate(like.createdAt)}</small>
            </div>
          </article>
        ))}
        {likes.length === 0 && <p className="text-sm text-neutral-500">{t('likes.empty')}</p>}
      </div>
    </section>
  )
}

export default AdminLikesSection
