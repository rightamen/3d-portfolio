import { useEffect, useState } from 'react'
import AdminIcon from './AdminIcon'
import { getAdminActions, getAdminDiagnostics, getAdminSessions } from '../../lib/api'
import { useAdminI18n } from '../../lib/admin/i18nAdmin'
import { stagger } from '../../lib/admin/motion'

// Operational truth about the running service, in one place. Until now every
// one of these answers lived somewhere the browser could not reach -- an SSH
// session, a journal, a curl with a hand-minted session -- which meant nobody
// looked at them between incidents.
const AdminSystemPanel = ({ system = {}, token }) => {
  const { fmt, t } = useAdminI18n()
  const [state, setState] = useState({ actions: [], diagnostics: null, sessions: [] })
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    if (!token) return undefined

    let cancelled = false

    Promise.all([
      getAdminSessions(token),
      getAdminActions(token, 25),
      // Diagnostics is the one call allowed to fail without failing the panel:
      // it is a nice-to-have reading of the proxy chain, not the reason the
      // page exists.
      getAdminDiagnostics(token).catch(() => ({ diagnostics: null })),
    ])
      .then(([sessionsPayload, actionsPayload, diagnosticsPayload]) => {
        if (cancelled) return

        setState({
          actions: actionsPayload.actions || [],
          diagnostics: diagnosticsPayload.diagnostics || null,
          sessions: sessionsPayload.sessions || [],
        })
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [token])

  const runtime = [
    { key: 'uptime', label: t('system.uptime'), value: fmt.formatDuration(system.uptimeSeconds) },
    {
      key: 'started',
      label: t('system.lastRestart'),
      value: system.startedAt ? fmt.formatAge(system.startedAt) : t('common.dash'),
    },
    { key: 'node', label: t('system.node'), value: system.nodeVersion || t('common.dash') },
    {
      key: 'latency',
      label: t('system.dbRtt'),
      value: Number.isFinite(system.databaseLatencyMs)
        ? `${system.databaseLatencyMs} ms`
        : t('common.dash'),
    },
    { key: 'rss', label: t('system.rss'), value: fmt.formatBytes(system.rssBytes || 0) },
    { key: 'heap', label: t('system.heap'), value: fmt.formatBytes(system.heapUsedBytes || 0) },
    {
      key: 'email',
      label: t('system.emailOut'),
      value: system.emailConfigured ? t('dash.emailConfigured') : t('dash.emailMissing'),
    },
    {
      key: 'csp',
      label: t('system.cspSince'),
      value: fmt.formatNumber(system.cspReports || 0),
    },
  ]

  return (
    <section className="admin-dashboard">
      <div className="admin-panel admin-animate-in">
        <div className="admin-panel-head">
          <h2>{t('system.runtime')}</h2>
          <span>{t('system.thisProcess')}</span>
        </div>
        <dl className="admin-fact-grid">
          {runtime.map((item, index) => (
            <div className="admin-animate-in" key={item.key} style={stagger(index)}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
        <p className="admin-panel-foot">{t('system.runtimeNote')}</p>
      </div>

      {state.diagnostics ? (
        <div className="admin-panel admin-animate-in">
          <div className="admin-panel-head">
            <h2>{t('system.requestChain')}</h2>
            <span>{t('system.asSeen')}</span>
          </div>
          <dl className="admin-fact-grid">
            <div>
              <dt>{t('system.resolvedIp')}</dt>
              <dd>{state.diagnostics.resolvedIp || t('common.dash')}</dd>
            </div>
            <div>
              <dt>{t('system.forwardedFor')}</dt>
              <dd>{state.diagnostics.forwardedFor || t('system.notSet')}</dd>
            </div>
            <div>
              <dt>{t('system.protocol')}</dt>
              <dd>
                {state.diagnostics.forwardedProto || state.diagnostics.protocol || t('common.dash')}
              </dd>
            </div>
            <div>
              <dt>{t('system.hops')}</dt>
              <dd>{state.diagnostics.trustProxyHops}</dd>
            </div>
          </dl>
          <p className="admin-panel-foot">{t('system.chainNote')}</p>
        </div>
      ) : null}

      <div className="admin-panel admin-animate-in">
        <div className="admin-panel-head">
          <h2>{t('system.sessions')}</h2>
          <span>{fmt.formatNumber(state.sessions.length)}</span>
        </div>
        {state.sessions.length ? (
          <div className="admin-table">
            {state.sessions.map((session, index) => (
              <article
                className="admin-row admin-animate-in"
                key={`${session.createdAt}-${session.ip}`}
                style={stagger(index)}
              >
                <div>
                  <div className="admin-row-title">
                    <strong>{session.username || t('system.sharedTokenSession')}</strong>
                    <span>
                      {session.username
                        ? t('system.sessionNamed')
                        : t('system.sessionUnattributed')}
                    </span>
                  </div>
                  <span>
                    {t('system.sessionLine', {
                      age: fmt.formatAge(session.createdAt),
                      countdown: fmt.formatCountdown(session.expiresAt),
                      ip: session.ip || t('system.unknownAddress'),
                    })}
                  </span>
                  <small>{session.userAgent || t('system.noUserAgent')}</small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="admin-empty-note">{t('system.noSessions')}</p>
        )}
      </div>

      <div className="admin-panel admin-animate-in">
        <div className="admin-panel-head">
          <h2>{t('system.audit')}</h2>
          <span>{t('system.lastN', { count: state.actions.length })}</span>
        </div>
        {state.actions.length ? (
          <ol className="admin-timeline">
            {state.actions.map((action, index) => (
              <li className="admin-animate-in" key={action.id} style={stagger(index)}>
                <span className="admin-timeline-icon">
                  <AdminIcon name="security" size={14} />
                </span>
                <div>
                  <p>
                    <strong>{action.actorUsername || t('system.auditActorShared')}</strong>{' '}
                    {action.action.replace(/[._-]/g, ' ')}{' '}
                    <em>{action.targetEmail || action.targetUserId || t('system.auditRecord')}</em>
                  </p>
                  {action.reason ? <small>{action.reason}</small> : null}
                </div>
                <span className="admin-timeline-age">{fmt.formatAge(action.createdAt)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="admin-empty-note">
            {status === 'loading' ? t('common.loading') : t('system.auditEmpty')}
          </p>
        )}
      </div>

      {status === 'error' ? <p className="admin-empty-note">{t('system.loadError')}</p> : null}
    </section>
  )
}

export default AdminSystemPanel
