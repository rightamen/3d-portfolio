import { useEffect, useState } from 'react'
import AdminIcon from './AdminIcon'
import { getAdminActions, getAdminDiagnostics, getAdminSessions } from '../../lib/api'
import { formatAge, formatBytes, formatCountdown, formatDuration, formatNumber } from './charts'

// Operational truth about the running service, in one place. Until now every
// one of these answers lived somewhere the browser could not reach -- an SSH
// session, a journal, a curl with a hand-minted session -- which meant nobody
// looked at them between incidents.
const AdminSystemPanel = ({ system = {}, token }) => {
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
    { key: 'uptime', label: 'Process uptime', value: formatDuration(system.uptimeSeconds) },
    {
      key: 'started',
      label: 'Last restart',
      value: system.startedAt ? formatAge(system.startedAt) : '—',
    },
    { key: 'node', label: 'Node', value: system.nodeVersion || '—' },
    {
      key: 'latency',
      label: 'Database round trip',
      value: Number.isFinite(system.databaseLatencyMs) ? `${system.databaseLatencyMs} ms` : '—',
    },
    { key: 'rss', label: 'Resident memory', value: formatBytes(system.rssBytes || 0) },
    { key: 'heap', label: 'Heap in use', value: formatBytes(system.heapUsedBytes || 0) },
    {
      key: 'email',
      label: 'Outbound email',
      value: system.emailConfigured ? 'configured' : 'not configured',
    },
    {
      key: 'csp',
      label: 'CSP reports since restart',
      value: formatNumber(system.cspReports || 0),
    },
  ]

  return (
    <section className="admin-dashboard">
      <div className="admin-panel">
        <div className="admin-panel-head">
          <h2>Runtime</h2>
          <span>this process</span>
        </div>
        <dl className="admin-fact-grid">
          {runtime.map((item) => (
            <div key={item.key}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
        <p className="admin-panel-foot">
          Uptime resets on every deploy, so a low number right after a release is expected. A
          database round trip that climbs while uptime stays put is the interesting case.
        </p>
      </div>

      {state.diagnostics ? (
        <div className="admin-panel">
          <div className="admin-panel-head">
            <h2>Request chain</h2>
            <span>as this box sees it</span>
          </div>
          <dl className="admin-fact-grid">
            <div>
              <dt>Resolved client IP</dt>
              <dd>{state.diagnostics.resolvedIp || '—'}</dd>
            </div>
            <div>
              <dt>X-Forwarded-For</dt>
              <dd>{state.diagnostics.forwardedFor || 'not set'}</dd>
            </div>
            <div>
              <dt>Protocol</dt>
              <dd>{state.diagnostics.forwardedProto || state.diagnostics.protocol || '—'}</dd>
            </div>
            <div>
              <dt>Trusted proxy hops</dt>
              <dd>{state.diagnostics.trustProxyHops}</dd>
            </div>
          </dl>
          <p className="admin-panel-foot">
            If the resolved IP is not the address you are browsing from, every per-IP rate limit is
            sharing one bucket and the audit trail is recording the proxy instead of the caller.
          </p>
        </div>
      ) : null}

      <div className="admin-panel">
        <div className="admin-panel-head">
          <h2>Active admin sessions</h2>
          <span>{state.sessions.length}</span>
        </div>
        {state.sessions.length ? (
          <div className="admin-table">
            {state.sessions.map((session) => (
              <article className="admin-row" key={`${session.createdAt}-${session.ip}`}>
                <div>
                  <div className="admin-row-title">
                    <strong>{session.username || 'shared admin token'}</strong>
                    <span>{session.username ? 'named account' : 'unattributed'}</span>
                  </div>
                  <span>
                    {session.ip || 'unknown address'} · opened {formatAge(session.createdAt)} ·
                    expires {formatCountdown(session.expiresAt)}
                  </span>
                  <small>{session.userAgent || 'no user agent recorded'}</small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="admin-empty-note">No live sessions — including this one, apparently.</p>
        )}
      </div>

      <div className="admin-panel">
        <div className="admin-panel-head">
          <h2>Audit trail</h2>
          <span>last {state.actions.length}</span>
        </div>
        {state.actions.length ? (
          <ol className="admin-timeline">
            {state.actions.map((action) => (
              <li key={action.id}>
                <span className="admin-timeline-icon">
                  <AdminIcon name="security" size={14} />
                </span>
                <div>
                  <p>
                    <strong>{action.actorUsername || 'shared token (no actor)'}</strong>{' '}
                    {action.action.replace(/[._-]/g, ' ')}{' '}
                    <em>{action.targetEmail || action.targetUserId || 'a record'}</em>
                  </p>
                  {action.reason ? <small>{action.reason}</small> : null}
                </div>
                <span className="admin-timeline-age">{formatAge(action.createdAt)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="admin-empty-note">
            {status === 'loading' ? 'Loading…' : 'No administrative action has been recorded yet.'}
          </p>
        )}
      </div>

      {status === 'error' ? (
        <p className="admin-empty-note">
          Could not load sessions or the audit trail. The dashboard figures above still come from
          the overview request and are current.
        </p>
      ) : null}
    </section>
  )
}

export default AdminSystemPanel
