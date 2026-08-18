import { useMemo } from 'react'
import AdminGalaxy from './AdminGalaxy'
import AdminIcon from './AdminIcon'
import { BarList, Meter, Sparkline, StackedColumns } from './Charts'
import { percentChange, seriesMeta } from './charts'
import { useAdminI18n } from '../../lib/admin/i18nAdmin'
import { stagger, useCountUp, usePrefersReducedMotion } from '../../lib/admin/motion'

const rangePresets = [
  { days: 7, labelKey: 'dash.range7' },
  { days: 30, labelKey: 'dash.range30' },
  { days: 90, labelKey: 'dash.range90' },
]

// Every tile names the section it belongs to, so a number that looks wrong is
// one click away from the rows behind it. A dashboard you cannot drill out of
// is a poster.
const tiles = [
  { key: 'members', labelKey: 'tile.members', metrics: ['members'], section: 'visitors', seriesKey: 'members' },
  { key: 'comments', labelKey: 'tile.comments', metrics: ['comments'], section: 'comments', seriesKey: 'comments' },
  { key: 'likes', labelKey: 'tile.likes', metrics: ['likes'], section: 'likes', seriesKey: 'likes' },
  { key: 'downloads', labelKey: 'tile.downloads', metrics: ['downloads'], section: 'downloads', seriesKey: 'downloads' },
  {
    key: 'community',
    labelKey: 'tile.community',
    metrics: ['communityPosts', 'communityUploads', 'communityComments'],
    section: 'community',
    seriesKey: 'community',
  },
  { key: 'messages', labelKey: 'tile.messages', metrics: ['messages'], section: 'messages', seriesKey: 'messages' },
]

// The same icon set the nav uses, not emoji. Emoji here would be at the mercy
// of whichever font the operator's machine happens to resolve them with -- on
// a bare server-rendered screenshot they came out as empty boxes -- and they
// cannot inherit the row's colour.
const activityCopy = {
  comment: { icon: 'comments', verbKey: 'activity.comment' },
  download: { icon: 'downloads', verbKey: 'activity.download' },
  member: { icon: 'visitors', verbKey: 'activity.member' },
  message: { icon: 'messages', verbKey: 'activity.message' },
  post: { icon: 'community', verbKey: 'activity.post' },
  request: { icon: 'downloads', verbKey: 'activity.request' },
  upload: { icon: 'projects', verbKey: 'activity.upload' },
}

const truncate = (value, limit = 90) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim()

  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

const signed = (change) => `${change > 0 ? '+' : ''}${change}`

const StatTile = ({ index, label, onOpen, points, prior, value }) => {
  const { fmt, t } = useAdminI18n()
  const reducedMotion = usePrefersReducedMotion()
  // The number counts up to itself on mount and on every window change. It is
  // the one piece of motion here that carries meaning rather than polish: a
  // tile that snaps from 40 to 900 loses the fact that it moved at all.
  const shown = useCountUp(value, { enabled: !reducedMotion })
  const change = percentChange(value, prior)
  const direction = change === null ? 'new' : change > 0 ? 'up' : change < 0 ? 'down' : 'flat'

  return (
    <button className="admin-stat admin-animate-in" onClick={onOpen} style={stagger(index)} type="button">
      <span className="admin-stat-label">{label}</span>
      <div className="admin-stat-body">
        <strong className="admin-stat-value">{fmt.compactNumber(shown)}</strong>
        <Sparkline points={points} />
      </div>
      {/* The delta names its baseline. "+12%" against an unnamed period is a
          number nobody can check. */}
      <span className={`admin-delta admin-delta-${direction}`}>
        {direction === 'new'
          ? t('dash.tileNew')
          : direction === 'flat'
            ? t('dash.tileFlat')
            : t('dash.tileDelta', { change: signed(change) })}
      </span>
    </button>
  )
}

const QueueCard = ({ actionLabel, count, index, label, note, onOpen, tone = 'idle' }) => {
  const { fmt } = useAdminI18n()

  return (
    <article className={`admin-queue-card admin-queue-${tone} admin-animate-in`} style={stagger(index)}>
      <div>
        <strong>{fmt.formatNumber(count)}</strong>
        <span>{label}</span>
      </div>
      <p>{note}</p>
      <button className="admin-chip-button" onClick={onOpen} type="button">
        {actionLabel}
      </button>
    </article>
  )
}

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
  const { fmt, t } = useAdminI18n()
  const reducedMotion = usePrefersReducedMotion()

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
  const activityShown = useCountUp(activityNow, { duration: 1100, enabled: !reducedMotion })

  const queueItems = [
    {
      actionLabel: t('queue.comments.action'),
      count: queues.pendingComments || 0,
      key: 'comments',
      label: t('queue.comments.label'),
      note: queues.oldestComment
        ? t('queue.comments.oldest', { age: fmt.formatAge(queues.oldestComment) })
        : t('queue.comments.clear'),
      section: 'comments',
    },
    {
      actionLabel: t('queue.uploads.action'),
      count: queues.pendingUploads || 0,
      key: 'uploads',
      label: t('queue.uploads.label'),
      note: queues.oldestUpload
        ? t('queue.uploads.oldest', { age: fmt.formatAge(queues.oldestUpload) })
        : t('queue.uploads.clear'),
      section: 'community',
    },
    {
      actionLabel: t('queue.requests.action'),
      count: queues.pendingRequests || 0,
      key: 'requests',
      label: t('queue.requests.label'),
      note: queues.oldestRequest
        ? t('queue.requests.oldest', { age: fmt.formatAge(queues.oldestRequest) })
        : t('queue.requests.clear'),
      section: 'downloads',
    },
    {
      actionLabel: t('queue.messages.action'),
      count: queues.recentMessages || 0,
      key: 'messages',
      label: t('queue.messages.label'),
      note: queues.oldestMessage
        ? t('queue.messages.oldest', { age: fmt.formatAge(queues.oldestMessage) })
        : t('queue.messages.clear'),
      section: 'messages',
    },
  ]

  const openQueues = queueItems.filter((item) => item.count > 0)

  const topProjects = (overview?.topProjects || []).map((project) => ({
    detail: t('dash.topDetail', {
      comments: fmt.formatNumber(project.comments),
      downloads: fmt.formatNumber(project.downloads),
      likes: fmt.formatNumber(project.likes),
    }),
    id: project.slug,
    label: projectTitles.get(project.slug) || project.slug,
    value: project.total,
  }))

  // The 3D map's nodes. Deliberately more than the six stat tiles: the
  // constellation is the whole console seen at once, including the two
  // sections -- Security and System -- that have no tile because they are not
  // counted in events.
  const galaxyNodes = [
    {
      key: 'visitors',
      label: t('section.visitors'),
      pending: queues.unverifiedMembers || 0,
      section: 'visitors',
      value: sumMetric(['members'], 'current'),
    },
    {
      key: 'comments',
      label: t('section.comments'),
      pending: queues.pendingComments || 0,
      section: 'comments',
      value: sumMetric(['comments'], 'current'),
    },
    {
      key: 'likes',
      label: t('section.likes'),
      pending: 0,
      section: 'likes',
      value: sumMetric(['likes'], 'current'),
    },
    {
      key: 'downloads',
      label: t('section.downloads'),
      pending: queues.pendingRequests || 0,
      section: 'downloads',
      value: sumMetric(['downloads'], 'current'),
    },
    {
      key: 'community',
      label: t('section.community'),
      pending: queues.pendingUploads || 0,
      section: 'community',
      value: sumMetric(['communityPosts', 'communityUploads', 'communityComments'], 'current'),
    },
    {
      key: 'messages',
      label: t('section.messages'),
      pending: queues.recentMessages || 0,
      section: 'messages',
      value: sumMetric(['messages'], 'current'),
    },
    {
      key: 'projects',
      label: t('section.projects'),
      pending: 0,
      section: 'projects',
      value: projects.length,
    },
    {
      key: 'content-health',
      label: t('section.content-health'),
      pending: 0,
      section: 'content-health',
      value: catalogue.customProjects || 0,
    },
    {
      key: 'security',
      label: t('section.security'),
      pending: catalogue.adminsWithoutTotp || 0,
      section: 'security',
      value: catalogue.adminAccounts || 0,
    },
    {
      key: 'system',
      label: t('section.system'),
      pending: 0,
      section: 'system',
      value: catalogue.activeAdminSessions || 0,
    },
  ]

  // Standing facts about the install. These do not move day to day, which is
  // exactly why they belong on a dashboard: nobody goes looking for them, and
  // an admin without a second factor is worth seeing every morning.
  const posture = [
    {
      key: 'totp',
      label: t('posture.totp.label'),
      note: catalogue.adminsWithoutTotp
        ? t('posture.totp.warn')
        : t('posture.totp.ok', { count: fmt.formatNumber(catalogue.adminAccounts || 0) }),
      tone: catalogue.adminsWithoutTotp ? 'warn' : 'ok',
      value: catalogue.adminsWithoutTotp || 0,
    },
    {
      key: 'sessions',
      label: t('posture.sessions.label'),
      note: identity?.username
        ? t('posture.sessions.named', { name: identity.username })
        : t('posture.sessions.shared'),
      tone: 'ok',
      value: catalogue.activeAdminSessions || 0,
    },
    {
      key: 'unverified',
      label: t('posture.unverified.label'),
      note: queues.unverifiedMembers
        ? t('posture.unverified.warn')
        : t('posture.unverified.ok'),
      tone: queues.unverifiedMembers ? 'warn' : 'ok',
      value: queues.unverifiedMembers || 0,
    },
    {
      key: 'disabled',
      label: t('posture.disabled.label'),
      note: queues.disabledProfiles ? t('posture.disabled.warn') : t('posture.disabled.ok'),
      tone: queues.disabledProfiles ? 'warn' : 'ok',
      value: queues.disabledProfiles || 0,
    },
  ]

  const translatedSeries = seriesMeta.map((item) => ({ ...item, label: t(item.labelKey) }))

  return (
    <section className={`admin-dashboard ${loading ? 'is-refreshing' : ''}`}>
      {/* One filter row, above everything it scopes. Changing the range
          re-fetches the whole view, so the tiles and the chart can never
          disagree about which window they describe. */}
      <div className="admin-range-row">
        <span className="admin-range-label">{t('dash.window')}</span>
        <div aria-label={t('dash.rangeGroup')} className="admin-range-group" role="group">
          {rangePresets.map((preset) => (
            <button
              aria-pressed={days === preset.days}
              className={days === preset.days ? 'admin-range-active' : 'admin-range'}
              key={preset.days}
              onClick={() => onRangeChange?.(preset.days)}
              type="button"
            >
              {t(preset.labelKey)}
            </button>
          ))}
        </div>
        {systemLabel ? <span className="admin-range-meta">{systemLabel}</span> : null}
      </div>

      <div className="admin-hero admin-animate-in">
        <div className="admin-hero-figure">
          <span className="admin-stat-label">{t('dash.trackedEvents', { days })}</span>
          <strong>{fmt.formatNumber(activityShown)}</strong>
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
              ? t('dash.deltaNew')
              : t('dash.deltaVs', { change: signed(activityChange), days })}
          </span>
        </div>
        <dl className="admin-hero-facts">
          <div>
            <dt>{t('dash.uptime')}</dt>
            <dd>{fmt.formatDuration(system.uptimeSeconds)}</dd>
          </div>
          <div>
            <dt>{t('dash.database')}</dt>
            <dd>
              {Number.isFinite(system.databaseLatencyMs)
                ? `${system.databaseLatencyMs} ms`
                : t('common.dash')}
            </dd>
          </div>
          <div>
            <dt>{t('dash.email')}</dt>
            <dd>{system.emailConfigured ? t('dash.emailConfigured') : t('dash.emailMissing')}</dd>
          </div>
          <div>
            <dt>{t('dash.csp')}</dt>
            <dd>{fmt.formatNumber(system.cspReports || 0)}</dd>
          </div>
        </dl>
      </div>

      <AdminGalaxy
        days={days}
        nodes={galaxyNodes}
        onNavigate={onNavigate}
        total={activityNow}
      />

      <div className="admin-panel admin-animate-in">
        <div className="admin-panel-head">
          <h2>{t('dash.needsYou')}</h2>
          <span>
            {openQueues.length
              ? t('dash.openCount', { count: openQueues.length })
              : t('dash.allClear')}
          </span>
        </div>
        {openQueues.length ? (
          <div className="admin-queue-grid">
            {openQueues.map((item, index) => (
              <QueueCard
                actionLabel={item.actionLabel}
                count={item.count}
                index={index}
                key={item.key}
                label={item.label}
                note={item.note}
                onOpen={() => onNavigate?.(item.section)}
                tone="open"
              />
            ))}
          </div>
        ) : (
          <p className="admin-empty-note admin-empty-good">{t('dash.queueEmpty')}</p>
        )}
      </div>

      <div className="admin-stat-grid">
        {tiles.map((tile, index) => (
          <StatTile
            index={index}
            key={tile.key}
            label={t(tile.labelKey)}
            onOpen={() => onNavigate?.(tile.section)}
            points={series.map((row) => row[tile.seriesKey] || 0)}
            prior={sumMetric(tile.metrics, 'prior')}
            value={sumMetric(tile.metrics, 'current')}
          />
        ))}
      </div>

      <div className="admin-split">
        <div className="admin-panel admin-animate-in">
          <StackedColumns
            data={series}
            emptyLabel={t('chart.dailyEmpty', { days })}
            series={translatedSeries}
            title={t('chart.daily', { days })}
          />
        </div>
        <div className="admin-panel admin-animate-in">
          <div className="admin-panel-head">
            <h2>{t('dash.topProjects')}</h2>
            <span>{t('dash.allTime')}</span>
          </div>
          <BarList emptyLabel={t('dash.topEmpty')} items={topProjects} />
        </div>
      </div>

      <div className="admin-split">
        <div className="admin-panel admin-animate-in">
          <div className="admin-panel-head">
            <h2>{t('dash.recentActivity')}</h2>
            <span>{t('dash.eventsCount', { count: overview?.activity?.length || 0 })}</span>
          </div>
          {overview?.activity?.length ? (
            <ol className="admin-timeline">
              {overview.activity.map((event, index) => {
                const copy = activityCopy[event.kind] || {
                  icon: 'dashboard',
                  verbKey: 'activity.touched',
                }

                return (
                  <li className="admin-animate-in" key={event.id} style={stagger(index)}>
                    <span className="admin-timeline-icon">
                      <AdminIcon name={copy.icon} size={14} />
                    </span>
                    <div>
                      <p>
                        <strong>{event.actor || t('activity.someone')}</strong> {t(copy.verbKey)}{' '}
                        <em>
                          {projectTitles.get(event.context) ||
                            event.context ||
                            t('activity.theSite')}
                        </em>
                      </p>
                      {event.detail ? <small>{truncate(event.detail)}</small> : null}
                    </div>
                    <span className="admin-timeline-age">{fmt.formatAge(event.createdAt)}</span>
                  </li>
                )
              })}
            </ol>
          ) : (
            <p className="admin-empty-note">{t('dash.activityEmpty')}</p>
          )}
        </div>

        <div className="admin-panel admin-animate-in">
          <div className="admin-panel-head">
            <h2>{t('dash.posture')}</h2>
            <span>{t('dash.standing')}</span>
          </div>
          <ul className="admin-posture">
            {posture.map((item, index) => (
              <li
                className={`admin-posture-${item.tone} admin-animate-in`}
                key={item.key}
                style={stagger(index)}
              >
                <strong>{fmt.formatNumber(item.value)}</strong>
                <div>
                  <span>{item.label}</span>
                  <small>{item.note}</small>
                </div>
              </li>
            ))}
          </ul>

          <div className="admin-meter-group">
            <Meter
              label={t('meter.verified.label')}
              note={t('meter.verified.note', {
                count: fmt.formatNumber(catalogue.activeMembers || 0),
              })}
              total={metrics.members?.total || 0}
              value={catalogue.verifiedMembers || 0}
            />
            <Meter
              label={t('meter.uploads.label')}
              note={t('meter.uploads.note', {
                approved: fmt.formatBytes(catalogue.approvedBytes || 0),
                total: fmt.formatBytes(catalogue.uploadBytes || 0),
              })}
              total={metrics.communityUploads?.total || 0}
              value={Math.max(
                0,
                (metrics.communityUploads?.total || 0) - (queues.pendingUploads || 0),
              )}
            />
            <Meter
              label={t('meter.projects.label')}
              note={t('meter.projects.note', {
                custom: fmt.formatNumber(catalogue.customProjects || 0),
                hidden: fmt.formatNumber(catalogue.hiddenProjects || 0),
              })}
              total={projects.length}
              value={projects.filter((project) => project.isPublic !== false).length}
            />
          </div>

          <p className="admin-panel-foot">
            {t('dash.foot', {
              age: system.startedAt ? fmt.formatAge(system.startedAt) : t('common.dash'),
              node: system.nodeVersion || t('common.dash'),
              rss: fmt.formatBytes(system.rssBytes || 0),
            })}
          </p>
        </div>
      </div>
    </section>
  )
}

export default AdminDashboard
