import { visitorAccessPresets, visitorDetailTabs } from '../../lib/admin/sections'
import { useAdminI18n } from '../../lib/admin/i18nAdmin'
import { stagger } from '../../lib/admin/motion'

// The list of accounts on the left, one account's whole history on the right.
// Every moderation action here writes to the audit trail, so the buttons ask
// for a reason before they fire -- that prompt lives in the parent.
const AdminMembersSection = ({
  actionStatus,
  content,
  detailStatus,
  detailTab,
  filters,
  onApplyFilters,
  onChangeAccess,
  onCloseDetail,
  onDelete,
  onFiltersChange,
  onModerate,
  onSelect,
  onSelectTab,
  onToggleVerification,
  pagination,
  selected,
  visitors,
}) => {
  const { fmt, t } = useAdminI18n()

  const clearFields = [
    ['avatar', t('members.clearAvatar')],
    ['banner', t('members.clearBanner')],
    ['bio', t('members.clearBio')],
    ['contacts', t('members.clearContacts')],
  ]

  const profileState = (visitor) =>
    visitor.profileAdminDisabled ? 'disabled' : visitor.profilePublic ? 'public' : 'private'

  return (
    <section className="admin-section admin-visitors-section">
      <div className="admin-section-header">
        <div>
          <h2>{t('members.title')}</h2>
          <small>{t('members.subtitle')}</small>
        </div>
        <span>{fmt.formatNumber(pagination.total || 0)}</span>
      </div>

      <div className="visitor-filter-grid">
        <input
          className="field-input"
          onChange={(event) =>
            onFiltersChange((current) => ({ ...current, query: event.target.value }))
          }
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              onApplyFilters({ page: 1, query: event.currentTarget.value })
            }
          }}
          placeholder={t('members.searchPlaceholder')}
          value={filters.query}
        />
        <select
          className="field-input"
          onChange={(event) => onApplyFilters({ page: 1, verified: event.target.value })}
          value={filters.verified}
        >
          <option value="">{t('members.allVerification')}</option>
          <option value="true">{t('status.verified')}</option>
          <option value="false">{t('status.unverified')}</option>
        </select>
        <select
          className="field-input"
          onChange={(event) => onApplyFilters({ page: 1, profileStatus: event.target.value })}
          value={filters.profileStatus}
        >
          <option value="">{t('members.allProfiles')}</option>
          <option value="public">{t('status.public')}</option>
          <option value="private">{t('status.private')}</option>
          <option value="disabled">{t('members.profileDisabled')}</option>
        </select>
        <select
          className="field-input"
          onChange={(event) => onApplyFilters({ page: 1, accessLevel: event.target.value })}
          value={filters.accessLevel}
        >
          <option value="">{t('members.allAccess')}</option>
          {visitorAccessPresets.map((level) => (
            <option key={level.value} value={level.value}>
              {t(level.labelKey)}
            </option>
          ))}
        </select>
        <select
          className="field-input"
          onChange={(event) => onApplyFilters({ page: 1, sort: event.target.value })}
          value={filters.sort}
        >
          <option value="createdAt">{t('members.sortCreated')}</option>
          <option value="lastLoginAt">{t('members.sortLogin')}</option>
          <option value="updatedAt">{t('members.sortUpdated')}</option>
          <option value="displayName">{t('members.sortName')}</option>
        </select>
        <button
          className="secondary-action"
          onClick={() => onApplyFilters({ page: 1 })}
          type="button"
        >
          {t('common.search')}
        </button>
      </div>

      <div className="visitor-management-layout">
        <div className="admin-table visitor-list">
          {visitors.map((visitor, index) => (
            <button
              className={`admin-row visitor-row admin-animate-in ${
                selected?.id === visitor.id ? 'visitor-row-active' : ''
              }`}
              key={visitor.id}
              onClick={() => onSelect(visitor)}
              style={stagger(index)}
              type="button"
            >
              <span className="visitor-avatar">
                {visitor.avatarUrl ? (
                  <img
                    alt=""
                    decoding="async"
                    loading="lazy"
                    src={visitor.avatarUrl}
                  />
                ) : (
                  visitor.displayName?.slice(0, 1)
                )}
              </span>
              <span className="visitor-row-main">
                <strong>{visitor.displayName}</strong>
                <span>
                  {visitor.handle ? `@${visitor.handle}` : t('members.noHandle')} · {visitor.email}
                </span>
                <small>
                  {t('members.joined', {
                    date: fmt.formatDate(visitor.createdAt),
                    login: visitor.lastLoginAt
                      ? fmt.formatDate(visitor.lastLoginAt)
                      : t('common.never'),
                  })}
                </small>
                <span className="visitor-stat-line">
                  {t('members.stats', {
                    comments: visitor.stats?.commentCount || 0,
                    downloads: visitor.stats?.downloadRequestCount || 0,
                    posts: visitor.stats?.postCount || 0,
                    uploads: visitor.stats?.uploadCount || 0,
                  })}
                </span>
              </span>
              <span className="visitor-row-status">
                <span
                  className={`status-pill ${
                    visitor.emailVerified ? 'status-approved' : 'status-pending'
                  }`}
                >
                  {visitor.emailVerified ? t('status.verified') : t('status.unverified')}
                </span>
                <span
                  className={`status-pill ${
                    visitor.profileAdminDisabled
                      ? 'status-rejected'
                      : visitor.profilePublic
                        ? 'status-approved'
                        : 'status-pending'
                  }`}
                >
                  {t(`status.${profileState(visitor)}`)}
                </span>
              </span>
            </button>
          ))}
          {visitors.length === 0 && (
            <p className="text-sm text-neutral-500">{t('members.empty')}</p>
          )}
          <div className="visitor-pagination">
            <button
              className="secondary-action"
              disabled={!pagination.hasPrevious}
              onClick={() => onApplyFilters({ page: filters.page - 1 })}
              type="button"
            >
              {t('common.previous')}
            </button>
            <span>
              {t('common.pageOf', { page: pagination.page || 1, pages: pagination.pages || 1 })}
            </span>
            <button
              className="secondary-action"
              disabled={!pagination.hasNext}
              onClick={() => onApplyFilters({ page: filters.page + 1 })}
              type="button"
            >
              {t('common.next')}
            </button>
          </div>
        </div>

        <aside className="visitor-detail-panel">
          {!selected && <p className="text-sm text-neutral-500">{t('members.selectPrompt')}</p>}
          {selected && (
            <>
              <div className="visitor-detail-head">
                <div>
                  <p className="section-kicker">{t('members.detailKicker')}</p>
                  <h3>{selected.displayName}</h3>
                  <span>{selected.handle ? `@${selected.handle}` : selected.email}</span>
                </div>
                <button
                  aria-label={t('members.closeDetail')}
                  className="icon-action"
                  onClick={() => onCloseDetail()}
                  type="button"
                >
                  ×
                </button>
              </div>
              <nav className="visitor-detail-tabs">
                {visitorDetailTabs.map((tab) => (
                  <button
                    className={detailTab === tab.key ? 'admin-tab-active' : 'admin-tab'}
                    key={tab.key}
                    onClick={() => onSelectTab(tab.key)}
                    type="button"
                  >
                    {t(tab.labelKey)}
                  </button>
                ))}
              </nav>
              {detailStatus === 'loading' && <p>{t('members.loadingDetail')}</p>}
              {detailStatus === 'error' && <p className="text-coral">{t('members.detailError')}</p>}
              {detailStatus === 'ready' && detailTab === 'overview' && (
                <div className="visitor-overview admin-animate-in">
                  <dl>
                    <div>
                      <dt>{t('members.email')}</dt>
                      <dd>{selected.email}</dd>
                    </div>
                    <div>
                      <dt>{t('members.emailStatus')}</dt>
                      <dd>{selected.emailVerified ? t('status.verified') : t('status.unverified')}</dd>
                    </div>
                    <div>
                      <dt>{t('members.registered')}</dt>
                      <dd>{fmt.formatDate(selected.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>{t('members.lastLogin')}</dt>
                      <dd>
                        {selected.lastLoginAt
                          ? fmt.formatDate(selected.lastLoginAt)
                          : t('common.never')}
                      </dd>
                    </div>
                    <div>
                      <dt>{t('members.publicProfile')}</dt>
                      <dd>
                        {selected.profileAdminDisabled
                          ? t('members.profileDisabled')
                          : t(`status.${selected.profilePublic ? 'public' : 'private'}`)}
                      </dd>
                    </div>
                    <div>
                      <dt>{t('members.contacts')}</dt>
                      <dd>{t(`status.${selected.contactsPublic ? 'public' : 'private'}`)}</dd>
                    </div>
                  </dl>
                  {selected.bio && <p className="visitor-bio">{selected.bio}</p>}
                  <select
                    className="field-input visitor-access-select"
                    onChange={(event) => onChangeAccess(event.target.value)}
                    value={selected.accessLevel}
                  >
                    {visitorAccessPresets.map((level) => (
                      <option key={level.value} value={level.value}>
                        {t(level.labelKey)}
                      </option>
                    ))}
                  </select>
                  <div className="visitor-moderation-actions">
                    <button
                      className="secondary-action"
                      onClick={() =>
                        onModerate({
                          action: 'visibility',
                          label: selected.profileAdminDisabled
                            ? t('members.restoreProfile')
                            : t('members.disableProfile'),
                        })
                      }
                      type="button"
                    >
                      {selected.profileAdminDisabled
                        ? t('members.restoreProfile')
                        : t('members.disableProfile')}
                    </button>
                    {clearFields.map(([field, label]) => (
                      <button
                        className="secondary-action"
                        key={field}
                        onClick={() => onModerate({ action: 'moderate', fields: [field], label })}
                        type="button"
                      >
                        {label}
                      </button>
                    ))}
                    <button
                      className="secondary-action"
                      onClick={onToggleVerification}
                      type="button"
                    >
                      {selected.emailVerified
                        ? t('members.markUnverified')
                        : t('members.verifyEmail')}
                    </button>
                    <button className="danger-action" onClick={onDelete} type="button">
                      {t('members.deleteAccount')}
                    </button>
                  </div>
                  {actionStatus && (
                    <small>
                      {actionStatus === 'done'
                        ? t('members.actionSaved')
                        : actionStatus === 'working'
                          ? t('common.working')
                          : actionStatus}
                    </small>
                  )}
                </div>
              )}
              {detailTab !== 'overview' && (
                <div className="visitor-content-list">
                  {content[detailTab]?.loading && <p>{t('common.loading')}</p>}
                  {content[detailTab]?.error && (
                    <p className="text-coral">{content[detailTab].error}</p>
                  )}
                  {(content[detailTab]?.items || []).map((item, index) => (
                    <article
                      className="visitor-content-item admin-animate-in"
                      key={item.id}
                      style={stagger(index)}
                    >
                      <strong>
                        {item.title ||
                          item.action ||
                          item.projectTitle ||
                          item.contextTitle ||
                          item.source ||
                          item.status}
                      </strong>
                      <p>
                        {item.message ||
                          item.description ||
                          item.purpose ||
                          (item.fields || []).join(', ')}
                      </p>
                      {item.reason && <span>{t('members.reason', { reason: item.reason })}</span>}
                      <small>{item.createdAt ? fmt.formatDate(item.createdAt) : ''}</small>
                    </article>
                  ))}
                  {content[detailTab] &&
                    !content[detailTab].loading &&
                    content[detailTab].items?.length === 0 && (
                      <p className="text-sm text-neutral-500">{t('members.noRecords')}</p>
                    )}
                  {content[detailTab]?.pagination && (
                    <div className="visitor-pagination">
                      <button
                        className="secondary-action"
                        disabled={!content[detailTab].pagination.hasPrevious}
                        onClick={() =>
                          onSelectTab(detailTab, content[detailTab].pagination.page - 1)
                        }
                        type="button"
                      >
                        {t('common.previous')}
                      </button>
                      <span>
                        {t('common.pageOf', {
                          page: content[detailTab].pagination.page,
                          pages: content[detailTab].pagination.pages,
                        })}
                      </span>
                      <button
                        className="secondary-action"
                        disabled={!content[detailTab].pagination.hasNext}
                        onClick={() =>
                          onSelectTab(detailTab, content[detailTab].pagination.page + 1)
                        }
                        type="button"
                      >
                        {t('common.next')}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </section>
  )
}

export default AdminMembersSection
