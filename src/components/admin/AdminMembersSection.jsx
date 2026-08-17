import { visitorAccessPresets, visitorDetailTabs } from '../../lib/admin/sections'
import { formatDate } from '../../lib/admin/format'

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
}) => (
  <section className="admin-section admin-visitors-section">
    <div className="admin-section-header">
      <div>
        <h2>Visitor Management</h2>
        <small>Search accounts, inspect activity, and moderate public profiles.</small>
      </div>
      <span>{pagination.total || 0}</span>
    </div>

    <div className="visitor-filter-grid">
      <input
        className="field-input"
        placeholder="Search name, handle, or email"
        value={filters.query}
        onChange={(event) =>
          onFiltersChange((current) => ({ ...current, query: event.target.value }))
        }
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            onApplyFilters({ page: 1, query: event.currentTarget.value })
          }
        }}
      />
      <select className="field-input" value={filters.verified} onChange={(event) => onApplyFilters({ page: 1, verified: event.target.value })}>
        <option value="">All verification states</option>
        <option value="true">Verified email</option>
        <option value="false">Unverified email</option>
      </select>
      <select className="field-input" value={filters.profileStatus} onChange={(event) => onApplyFilters({ page: 1, profileStatus: event.target.value })}>
        <option value="">All profile states</option>
        <option value="public">Public</option>
        <option value="private">Private</option>
        <option value="disabled">Admin disabled</option>
      </select>
      <select className="field-input" value={filters.accessLevel} onChange={(event) => onApplyFilters({ page: 1, accessLevel: event.target.value })}>
        <option value="">All access levels</option>
        {visitorAccessPresets.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}
      </select>
      <select className="field-input" value={filters.sort} onChange={(event) => onApplyFilters({ page: 1, sort: event.target.value })}>
        <option value="createdAt">Newest accounts</option>
        <option value="lastLoginAt">Recent login</option>
        <option value="updatedAt">Recently updated</option>
        <option value="displayName">Display name</option>
      </select>
      <button type="button" className="secondary-action" onClick={() => onApplyFilters({ page: 1 })}>Search</button>
    </div>

    <div className="visitor-management-layout">
    <div className="admin-table visitor-list">
      {visitors.map((visitor) => (
        <button key={visitor.id} type="button" className={`admin-row visitor-row ${selected?.id === visitor.id ? 'visitor-row-active' : ''}`} onClick={() => onSelect(visitor)}>
          <span className="visitor-avatar">
            {visitor.avatarUrl ? (
              <img
                src={visitor.avatarUrl}
                alt={`${visitor.displayName} avatar`}
                decoding="async"
                loading="lazy"
              />
            ) : visitor.displayName?.slice(0, 1)}
          </span>
          <span className="visitor-row-main">
            <strong>{visitor.displayName}</strong>
            <span>{visitor.handle ? `@${visitor.handle}` : 'No handle'} · {visitor.email}</span>
            <small>Joined {formatDate(visitor.createdAt)} · Last login {visitor.lastLoginAt ? formatDate(visitor.lastLoginAt) : 'Never'}</small>
            <span className="visitor-stat-line">{visitor.stats?.commentCount || 0} comments · {visitor.stats?.postCount || 0} posts · {visitor.stats?.uploadCount || 0} resources · {visitor.stats?.downloadRequestCount || 0} downloads</span>
          </span>
          <span className="visitor-row-status">
            <span className={`status-pill ${visitor.emailVerified ? 'status-approved' : 'status-pending'}`}>{visitor.emailVerified ? 'verified' : 'unverified'}</span>
            <span className={`status-pill ${visitor.profileAdminDisabled ? 'status-rejected' : visitor.profilePublic ? 'status-approved' : 'status-pending'}`}>{visitor.profileAdminDisabled ? 'disabled' : visitor.profilePublic ? 'public' : 'private'}</span>
          </span>
        </button>
      ))}
      {visitors.length === 0 && (
        <p className="text-sm text-neutral-500">No visitors match these filters.</p>
      )}
      <div className="visitor-pagination">
        <button type="button" className="secondary-action" disabled={!pagination.hasPrevious} onClick={() => onApplyFilters({ page: filters.page - 1 })}>Previous</button>
        <span>Page {pagination.page || 1} of {pagination.pages || 1}</span>
        <button type="button" className="secondary-action" disabled={!pagination.hasNext} onClick={() => onApplyFilters({ page: filters.page + 1 })}>Next</button>
      </div>
    </div>

    <aside className="visitor-detail-panel">
      {!selected && <p className="text-sm text-neutral-500">Select a visitor to inspect the account.</p>}
      {selected && (
        <>
          <div className="visitor-detail-head">
            <div>
              <p className="section-kicker">Visitor Detail</p>
              <h3>{selected.displayName}</h3>
              <span>{selected.handle ? `@${selected.handle}` : selected.email}</span>
            </div>
            <button type="button" className="icon-action" aria-label="Close visitor detail" onClick={() => onCloseDetail()}>×</button>
          </div>
          <nav className="visitor-detail-tabs">
            {visitorDetailTabs.map((tab) => (
              <button type="button" key={tab.key} className={detailTab === tab.key ? 'admin-tab-active' : 'admin-tab'} onClick={() => onSelectTab(tab.key)}>{tab.label}</button>
            ))}
          </nav>
          {detailStatus === 'loading' && <p>Loading visitor details...</p>}
          {detailStatus === 'error' && <p className="text-coral">Could not load visitor details.</p>}
          {detailStatus === 'ready' && detailTab === 'overview' && (
            <div className="visitor-overview">
              <dl>
                <div><dt>Email</dt><dd>{selected.email}</dd></div>
                <div><dt>Email status</dt><dd>{selected.emailVerified ? 'Verified' : 'Unverified'}</dd></div>
                <div><dt>Registered</dt><dd>{formatDate(selected.createdAt)}</dd></div>
                <div><dt>Last login</dt><dd>{selected.lastLoginAt ? formatDate(selected.lastLoginAt) : 'Never'}</dd></div>
                <div><dt>Public profile</dt><dd>{selected.profileAdminDisabled ? 'Admin disabled' : selected.profilePublic ? 'Public' : 'Private'}</dd></div>
                <div><dt>Contacts</dt><dd>{selected.contactsPublic ? 'Public' : 'Private'}</dd></div>
              </dl>
              {selected.bio && <p className="visitor-bio">{selected.bio}</p>}
              <select className="field-input visitor-access-select" value={selected.accessLevel} onChange={(event) => onChangeAccess(event.target.value)}>
                {visitorAccessPresets.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}
              </select>
              <div className="visitor-moderation-actions">
                <button type="button" className="secondary-action" onClick={() => onModerate({ action: 'visibility', label: selected.profileAdminDisabled ? 'restore public profile' : 'disable public profile' })}>{selected.profileAdminDisabled ? 'Restore Public Profile' : 'Disable Public Profile'}</button>
                {[['avatar', 'Clear Avatar'], ['banner', 'Clear Banner'], ['bio', 'Clear Bio'], ['contacts', 'Clear Contacts']].map(([field, label]) => (
                  <button key={field} type="button" className="secondary-action" onClick={() => onModerate({ action: 'moderate', fields: [field], label })}>{label}</button>
                ))}
                <button type="button" className="secondary-action" onClick={onToggleVerification}>{selected.emailVerified ? 'Mark Unverified' : 'Verify Email'}</button>
                <button type="button" className="danger-action" onClick={onDelete}>Delete Account</button>
              </div>
              {actionStatus && <small>{actionStatus === 'done' ? 'Moderation action saved.' : actionStatus}</small>}
            </div>
          )}
          {detailTab !== 'overview' && (
            <div className="visitor-content-list">
              {content[detailTab]?.loading && <p>Loading...</p>}
              {content[detailTab]?.error && <p className="text-coral">{content[detailTab].error}</p>}
              {(content[detailTab]?.items || []).map((item) => (
                <article key={item.id} className="visitor-content-item">
                  <strong>{item.title || item.action || item.projectTitle || item.contextTitle || item.source || item.status}</strong>
                  <p>{item.message || item.description || item.purpose || (item.fields || []).join(', ')}</p>
                  {item.reason && <span>Reason: {item.reason}</span>}
                  <small>{item.createdAt ? formatDate(item.createdAt) : ''}</small>
                </article>
              ))}
              {content[detailTab] && !content[detailTab].loading && content[detailTab].items?.length === 0 && <p className="text-sm text-neutral-500">No records in this section.</p>}
              {content[detailTab]?.pagination && (
                <div className="visitor-pagination">
                  <button type="button" className="secondary-action" disabled={!content[detailTab].pagination.hasPrevious} onClick={() => onSelectTab(detailTab, content[detailTab].pagination.page - 1)}>Previous</button>
                  <span>Page {content[detailTab].pagination.page} of {content[detailTab].pagination.pages}</span>
                  <button type="button" className="secondary-action" disabled={!content[detailTab].pagination.hasNext} onClick={() => onSelectTab(detailTab, content[detailTab].pagination.page + 1)}>Next</button>
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

export default AdminMembersSection
