import { useMemo } from 'react'
import AdminIcon from './AdminIcon'
import { BarList, Meter, Sparkline, StackedColumns } from './Charts'
import {
  compactNumber,
  formatAge,
  formatBytes,
  formatDuration,
  formatNumber,
  percentChange,
  seriesMeta,
} from './charts'

const rangePresets = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
]

// Every tile names the section it belongs to, so a number that looks wrong is
// one click away from the rows behind it. A dashboard you cannot drill out of
// is a poster.
const tiles = [
  {
    key: 'members',
    label: 'Members',
    section: 'visitors',
    metrics: ['members'],
    seriesKey: 'members',
  },
  {
    key: 'comments',
    label: 'Comments',
    section: 'comments',
    metrics: ['comments'],
    seriesKey: 'comments',
  },
  { key: 'likes', label: 'Likes', section: 'likes', metrics: ['likes'], seriesKey: 'likes' },
  {
    key: 'downloads',
    label: 'Downloads',
    section: 'downloads',
    metrics: ['downloads'],
    seriesKey: 'downloads',
  },
  {
    key: 'community',
    label: 'Community',
    section: 'community',
    metrics: ['communityPosts', 'communityUploads', 'communityComments'],
    seriesKey: 'community',
  },
  {
    key: 'messages',
    label: 'Messages',
    section: 'messages',
    metrics: ['messages'],
    seriesKey: 'messages',
  },
]

// The same icon set the nav uses, not emoji. Emoji here would be at the mercy
// of whichever font the operator's machine happens to resolve them with -- on
// a bare server-rendered screenshot they came out as empty boxes -- and they
// cannot inherit the row's colour.
const activityCopy = {
  comment: { icon: 'comments', verb: 'commented on' },
  download: { icon: 'downloads', verb: 'took' },
  member: { icon: 'visitors', verb: 'joined as' },
  message: { icon: 'messages', verb: 'sent a message via' },
  post: { icon: 'community', verb: 'posted in' },
  request: { icon: 'downloads', verb: 'requested access to' },
  upload: { icon: 'projects', verb: 'uploaded to' },
}

const truncate = (value, limit = 90) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim()

  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

const StatTile = ({ label, onOpen, points, prior, value }) => {
  const change = percentChange(value, prior)
  const direction = change === null ? 'new' : change > 0 ? 'up' : change < 0 ? 'down' : 'flat'

  return (
    <button className="admin-stat" onClick={onOpen} type="button">
      <span className="admin-stat-label">{label}</span>
      <div className="admin-stat-body">
        <strong className="admin-stat-value">{compactNumber(value)}</strong>
        <Sparkline points={points} />
      </div>
      {/* The delta names its baseline. "+12%" against an unnamed period is a
          number nobody can check. */}
      <span className={`admin-delta admin-delta-${direction}`}>
        {direction === 'new'
          ? 'first activity in this window'
          : direction === 'flat'
            ? `no change vs previous period`
            : `${change > 0 ? '+' : ''}${change}% vs previous period`}
      </span>
    </button>
  )
}

const QueueCard = ({ actionLabel, count, label, note, onOpen, tone = 'idle' }) => (
  <article className={`admin-queue-card admin-queue-${tone}`}>
    <div>
      <strong>{formatNumber(count)}</strong>
      <span>{label}</span>
    </div>
    <p>{note}</p>
    <button className="admin-chip-button" onClick={onOpen} type="button">
      {actionLabel}
    </button>
  </article>
)

const AdminDashboard = ({
  days = 30,
  identity,
  loading = false,
  onNavigate,
  onRangeChange,
  overview,
  projects = [],
  systemLabel,
}) => {
  const metrics = overview?.metrics || {}
  const queues = overview?.queues || {}
  const catalogue = overview?.catalogue || {}
  const system = overview?.system || {}
  const series = useMemo(() => overview?.series || [], [overview])

  const projectTitles = useMemo(() => {
    const map = new Map()
    for (const project of projects) map.set(project.slug, project.title)

    return map
  }, [projects])

  const sumMetric = (keys, field) =>
    keys.reduce((total, key) => total + (metrics[key]?.[field] || 0), 0)

  // The one number the view leads with: everything that happened in the window,
  // from every source, against the same span before it.
  const activityNow = Object.values(metrics).reduce((total, item) => total + (item.current || 0), 0)
  const activityPrior = Object.values(metrics).reduce((total, item) => total + (item.prior || 0), 0)
  const activityChange = percentChange(activityNow, activityPrior)

  const queueItems = [
    {
      actionLabel: 'Moderate comments',
      count: queues.pendingComments || 0,
      key: 'comments',
      label: 'comments awaiting moderation',
      note: queues.oldestComment
        ? `Oldest waiting since ${formatAge(queues.oldestComment)}.`
        : 'Nothing held back.',
      section: 'comments',
    },
    {
      actionLabel: 'Review uploads',
      count: queues.pendingUploads || 0,
      key: 'uploads',
      label: 'community uploads pending review',
      note: queues.oldestUpload
        ? `Oldest waiting since ${formatAge(queues.oldestUpload)}.`
        : 'The upload queue is clear.',
      section: 'community',
    },
    {
      actionLabel: 'Open requests',
      count: queues.pendingRequests || 0,
      key: 'requests',
      label: 'download requests undecided',
      note: queues.oldestRequest
        ? `Oldest waiting since ${formatAge(queues.oldestRequest)}.`
        : 'Every request has an answer.',
      section: 'downloads',
    },
    {
      actionLabel: 'Open messages',
      count: queues.recentMessages || 0,
      key: 'messages',
      label: 'contact messages this week',
      note: queues.oldestMessage
        ? `Oldest arrived ${formatAge(queues.oldestMessage)}.`
        : 'No new messages in the last seven days.',
      section: 'messages',
    },
  ]

  const openQueues = queueItems.filter((item) => item.count > 0)

  const topProjects = (overview?.topProjects || []).map((project) => ({
    detail: `${formatNumber(project.likes)} likes · ${formatNumber(project.comments)} comments · ${formatNumber(project.downloads)} downloads`,
    id: project.slug,
    label: projectTitles.get(project.slug) || project.slug,
    value: project.total,
  }))

  // Standing facts about the install. These do not move day to day, which is
  // exactly why they belong on a dashboard: nobody goes looking for them, and
  // an admin without a second factor is worth seeing every morning.
  const posture = [
    {
      key: 'totp',
      label: 'Admin accounts without an authenticator',
      value: catalogue.adminsWithoutTotp || 0,
      tone: catalogue.adminsWithoutTotp ? 'warn' : 'ok',
      note: catalogue.adminsWithoutTotp
        ? 'Enrol them in Security before the shared token is needed again.'
        : `All ${formatNumber(catalogue.adminAccounts || 0)} named admins carry a second factor.`,
    },
    {
      key: 'sessions',
      label: 'Live admin sessions',
      value: catalogue.activeAdminSessions || 0,
      tone: 'ok',
      note: identity?.username
        ? `Signed in as ${identity.username}; sessions expire on their own.`
        : 'Signed in on the shared token — these actions are not attributed.',
    },
    {
      key: 'unverified',
      label: 'Members with an unverified email',
      value: queues.unverifiedMembers || 0,
      tone: queues.unverifiedMembers ? 'warn' : 'ok',
      note: queues.unverifiedMembers
        ? 'They cannot receive decision mail until they confirm.'
        : 'Every member address is confirmed.',
    },
    {
      key: 'disabled',
      label: 'Profiles disabled by an admin',
      value: queues.disabledProfiles || 0,
      tone: queues.disabledProfiles ? 'warn' : 'ok',
      note: queues.disabledProfiles
        ? 'Hidden from /u/ pages until re-enabled.'
        : 'No profile is under moderation.',
    },
  ]

  return (
    <section className={`admin-dashboard ${loading ? 'is-refreshing' : ''}`}>
      {/* One filter row, above everything it scopes. Changing the range
          re-fetches the whole view, so the tiles and the chart can never
          disagree about which window they describe. */}
      <div className="admin-range-row">
        <span className="admin-range-label">Window</span>
        <div className="admin-range-group" role="group" aria-label="Dashboard time range">
          {rangePresets.map((preset) => (
            <button
              aria-pressed={days === preset.days}
              className={days === preset.days ? 'admin-range-active' : 'admin-range'}
              key={preset.days}
              onClick={() => onRangeChange?.(preset.days)}
              type="button"
            >
              {preset.label}
            </button>
          ))}
        </div>
        {systemLabel ? <span className="admin-range-meta">{systemLabel}</span> : null}
      </div>

      <div className="admin-hero">
        <div className="admin-hero-figure">
          <span className="admin-stat-label">Tracked events, last {days} days</span>
          <strong>{formatNumber(activityNow)}</strong>
          <span
            className={`admin-delta admin-delta-${
              activityChange === null
                ? 'new'
                : activityChange > 0
                  ? 'up'
                  : activityChange < 0
                    ? 'down'
                    : 'flat'
            }`}
          >
            {activityChange === null
              ? 'no comparable activity before this window'
              : `${activityChange > 0 ? '+' : ''}${activityChange}% vs the previous ${days} days`}
          </span>
        </div>
        <dl className="admin-hero-facts">
          <div>
            <dt>Uptime</dt>
            <dd>{formatDuration(system.uptimeSeconds)}</dd>
          </div>
          <div>
            <dt>Database</dt>
            <dd>{Number.isFinite(system.databaseLatencyMs) ? `${system.databaseLatencyMs} ms` : '—'}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{system.emailConfigured ? 'configured' : 'not configured'}</dd>
          </div>
          <div>
            <dt>CSP reports</dt>
            <dd>{formatNumber(system.cspReports || 0)}</dd>
          </div>
        </dl>
      </div>

      <div className="admin-panel">
        <div className="admin-panel-head">
          <h2>Needs you</h2>
          <span>{openQueues.length ? `${openQueues.length} open` : 'all clear'}</span>
        </div>
        {openQueues.length ? (
          <div className="admin-queue-grid">
            {openQueues.map((item) => (
              <QueueCard
                actionLabel={item.actionLabel}
                count={item.count}
                key={item.key}
                label={item.label}
                note={item.note}
                onOpen={() => onNavigate?.(item.section)}
                tone="open"
              />
            ))}
          </div>
        ) : (
          <p className="admin-empty-note admin-empty-good">
            Nothing is waiting on you. No comments held for moderation, no uploads pending review,
            no undecided download requests, and no contact messages in the last seven days.
          </p>
        )}
      </div>

      <div className="admin-stat-grid">
        {tiles.map((tile) => (
          <StatTile
            key={tile.key}
            label={tile.label}
            onOpen={() => onNavigate?.(tile.section)}
            points={series.map((row) => row[tile.seriesKey] || 0)}
            prior={sumMetric(tile.metrics, 'prior')}
            value={sumMetric(tile.metrics, 'current')}
          />
        ))}
      </div>

      <div className="admin-split">
        <div className="admin-panel">
          <StackedColumns
            data={series}
            emptyLabel={`No engagement recorded in the last ${days} days.`}
            series={seriesMeta}
            title={`Daily engagement, last ${days} days`}
          />
        </div>
        <div className="admin-panel">
          <div className="admin-panel-head">
            <h2>Most engaging projects</h2>
            <span>all time</span>
          </div>
          <BarList
            emptyLabel="No likes, comments, or downloads recorded against a project yet."
            items={topProjects}
          />
        </div>
      </div>

      <div className="admin-split">
        <div className="admin-panel">
          <div className="admin-panel-head">
            <h2>Recent activity</h2>
            <span>{overview?.activity?.length || 0} events</span>
          </div>
          {overview?.activity?.length ? (
            <ol className="admin-timeline">
              {overview.activity.map((event) => {
                const copy = activityCopy[event.kind] || { icon: 'dashboard', verb: 'touched' }

                return (
                  <li key={event.id}>
                    <span className="admin-timeline-icon">
                      <AdminIcon name={copy.icon} size={14} />
                    </span>
                    <div>
                      <p>
                        <strong>{event.actor || 'Someone'}</strong> {copy.verb}{' '}
                        <em>{projectTitles.get(event.context) || event.context || 'the site'}</em>
                      </p>
                      {event.detail ? <small>{truncate(event.detail)}</small> : null}
                    </div>
                    <span className="admin-timeline-age">{formatAge(event.createdAt)}</span>
                  </li>
                )
              })}
            </ol>
          ) : (
            <p className="admin-empty-note">Nothing has happened on the site yet.</p>
          )}
        </div>

        <div className="admin-panel">
          <div className="admin-panel-head">
            <h2>Site &amp; security posture</h2>
            <span>standing</span>
          </div>
          <ul className="admin-posture">
            {posture.map((item) => (
              <li className={`admin-posture-${item.tone}`} key={item.key}>
                <strong>{formatNumber(item.value)}</strong>
                <div>
                  <span>{item.label}</span>
                  <small>{item.note}</small>
                </div>
              </li>
            ))}
          </ul>

          <div className="admin-meter-group">
            <Meter
              label="Members with a verified email"
              note={`${formatNumber(catalogue.activeMembers || 0)} signed in within the last 30 days.`}
              total={metrics.members?.total || 0}
              value={catalogue.verifiedMembers || 0}
            />
            <Meter
              label="Community uploads approved"
              note={`${formatBytes(catalogue.uploadBytes || 0)} stored, ${formatBytes(
                catalogue.approvedBytes || 0,
              )} of it published.`}
              total={metrics.communityUploads?.total || 0}
              value={Math.max(
                0,
                (metrics.communityUploads?.total || 0) - (queues.pendingUploads || 0),
              )}
            />
            <Meter
              label="Projects visible on the site"
              note={`${formatNumber(catalogue.customProjects || 0)} created here, ${formatNumber(
                catalogue.hiddenProjects || 0,
              )} hidden from the public list.`}
              total={projects.length}
              value={projects.filter((project) => project.isPublic !== false).length}
            />
          </div>

          <p className="admin-panel-foot">
            Node {system.nodeVersion || '—'} · {formatBytes(system.rssBytes || 0)} resident ·
            started {system.startedAt ? formatAge(system.startedAt) : '—'}
          </p>
        </div>
      </div>
    </section>
  )
}

export default AdminDashboard
