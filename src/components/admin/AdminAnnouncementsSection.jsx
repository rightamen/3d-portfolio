import { useState } from 'react'

import { useAdminI18n } from '../../lib/admin/i18nAdmin'
import { stagger } from '../../lib/admin/motion'

// Site announcements: the operator publishes, everyone reads.
//
// Drafts are the reason `published` is a separate flag rather than "it exists,
// therefore it is live". An announcement is the one thing on this console that
// reaches every account at once, and writing it in the box that also sends it
// is how a half-finished sentence goes out to the whole site.

const AdminAnnouncementsSection = ({
  announcements,
  onCreate,
  onDelete,
  onUpdate,
}) => {
  const { fmt, t } = useAdminI18n()
  const [draft, setDraft] = useState({ body: '', link: '', title: '' })
  const [busy, setBusy] = useState(false)

  const submit = async (published) => {
    if (!draft.title.trim() || busy) return
    setBusy(true)
    try {
      await onCreate({ ...draft, published })
      setDraft({ body: '', link: '', title: '' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <h2>{t('announcements.title')}</h2>
        <span>{fmt.formatNumber(announcements.length)}</span>
      </div>
      <p className="admin-order-hint">{t('announcements.hint')}</p>

      <div className="admin-announcement-form">
        <input
          maxLength={120}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          placeholder={t('announcements.titlePlaceholder')}
          type="text"
          value={draft.title}
        />
        <textarea
          maxLength={2000}
          onChange={(event) => setDraft({ ...draft, body: event.target.value })}
          placeholder={t('announcements.bodyPlaceholder')}
          rows={3}
          value={draft.body}
        />
        <input
          maxLength={300}
          onChange={(event) => setDraft({ ...draft, link: event.target.value })}
          placeholder={t('announcements.linkPlaceholder')}
          type="text"
          value={draft.link}
        />
        <div className="admin-actions">
          {/* Draft first, and it is the plain button: the safe action should not
              be the one that needs more care to hit. */}
          <button
            className="secondary-action"
            disabled={busy || !draft.title.trim()}
            onClick={() => submit(false)}
            type="button"
          >
            {t('announcements.saveDraft')}
          </button>
          <button
            className="primary-action"
            disabled={busy || !draft.title.trim()}
            onClick={() => submit(true)}
            type="button"
          >
            {t('announcements.publish')}
          </button>
        </div>
      </div>

      <div className="admin-table">
        {announcements.length === 0 && (
          <p className="admin-empty-note">{t('announcements.empty')}</p>
        )}

        {announcements.map((announcement, index) => (
          <article className="admin-row admin-animate-in" key={announcement.id} style={stagger(index)}>
            <div>
              <div className="admin-row-title">
                <strong>{announcement.title}</strong>
                <span
                  className={`status-pill status-${announcement.published ? 'approved' : 'pending'}`}
                >
                  {t(announcement.published ? 'announcements.live' : 'announcements.draft')}
                </span>
              </div>
              {announcement.body && <p className="admin-order-note">{announcement.body}</p>}
              <small>
                {announcement.published
                  ? fmt.formatDate(announcement.publishedAt)
                  : fmt.formatDate(announcement.createdAt)}
                {announcement.link ? ` · ${announcement.link}` : ''}
              </small>
            </div>
            <div className="admin-actions">
              <button
                className="secondary-action"
                onClick={() => onUpdate(announcement.id, { published: !announcement.published })}
                type="button"
              >
                {t(announcement.published ? 'announcements.unpublish' : 'announcements.publish')}
              </button>
              <button
                className="danger-action"
                onClick={() => onDelete(announcement)}
                type="button"
              >
                {t('announcements.delete')}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

export default AdminAnnouncementsSection
