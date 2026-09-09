import { useState } from 'react'

import { useAdminI18n } from '../../lib/admin/i18nAdmin'
import { stagger } from '../../lib/admin/motion'

// Orders, for the operator.
//
// This section does not move money -- the platform never held any. What it
// does is read the record: who ordered, what the buyer said they paid, what
// the buyer was SHOWN at the time, and who settled it. In a dispute that
// record is the whole of the platform's contribution, so the trail is the
// centre of this screen rather than a detail behind a link.
//
// The settle buttons are a backstop. The creator is who should confirm; an
// operator doing it is itself recorded, and the hint says so.

const formatMoney = (cents, currency) =>
  `${(cents / 100).toFixed(2)} ${String(currency || 'usd').toUpperCase()}`

const AdminOrdersSection = ({ onLoadEvents, onUpdateStatus, orders, staleOrders }) => {
  const { fmt, t } = useAdminI18n()
  const [openId, setOpenId] = useState('')
  const [detail, setDetail] = useState(null)

  const open = async (order) => {
    if (openId === order.id) {
      setOpenId('')
      setDetail(null)
      return
    }
    setOpenId(order.id)
    setDetail(null)
    setDetail(await onLoadEvents(order.id))
  }

  const renderTrail = () => {
    if (!detail) return <p className="admin-empty-note">…</p>

    return (
      <div className="admin-order-detail">
        <div>
          <h4>{t('orders.trail')}</h4>
          <p className="admin-empty-note">{t('orders.trailHint')}</p>
          <ol className="admin-order-trail">
            {detail.events.map((event) => (
              <li key={event.id}>
                {/* "Buyer · Buyer" when someone's display name happens to
                    match their role, which reads like a rendering bug. The
                    role alone is enough when they agree. */}
                <span className="admin-order-actor">
                  {t(`orders.actor.${event.actorKind}`)}
                  {event.actorName && event.actorName !== t(`orders.actor.${event.actorKind}`)
                    ? ` · ${event.actorName}`
                    : ''}
                </span>
                <strong>{t(`orders.event.${event.event}`)}</strong>
                <time>{fmt.formatDate(event.createdAt)}</time>
                {event.note && <p>{event.note}</p>}
              </li>
            ))}
          </ol>
        </div>

        <div>
          <h4>{t('orders.paymentShown')}</h4>
          {/* From the snapshot. A creator who changed their code after the
              dispute started cannot rewrite what the buyer was told. */}
          <p className="admin-empty-note">{t('orders.paymentShownHint')}</p>
          {detail.paymentMethods.length === 0 && (
            <p className="admin-empty-note">{t('orders.noPayment')}</p>
          )}
          <ul className="admin-order-methods">
            {detail.paymentMethods.map((method) => (
              <li key={method.label}>
                <strong>{method.label}</strong>
                {method.instructions && <p>{method.instructions}</p>}
                {method.qrUrl && <img alt="" src={method.qrUrl} />}
              </li>
            ))}
          </ul>
        </div>
      </div>
    )
  }

  const renderRow = (order, index) => (
    <article className="admin-row admin-animate-in" key={order.id} style={stagger(index)}>
      <div>
        <div className="admin-row-title">
          <strong>{order.workTitle}</strong>
          <span>{formatMoney(order.amountCents, order.currency)}</span>
        </div>
        <small>{fmt.formatDate(order.createdAt)}</small>
        {order.buyerNote && (
          <p className="admin-order-note">
            {t('orders.buyerNote')}: {order.buyerNote}
          </p>
        )}
        {order.settledNote && (
          <small>
            {t('orders.settledNote')}: {order.settledNote}
          </small>
        )}
        {openId === order.id && renderTrail()}
      </div>
      <div className="admin-actions">
        <span className={`status-pill status-${order.status}`}>{order.status}</span>
        <button className="secondary-action" onClick={() => open(order)} type="button">
          {t('orders.trail')}
        </button>
        {order.status === 'pending' && (
          <button
            className="secondary-action"
            onClick={() => onUpdateStatus(order.id, 'paid')}
            type="button"
          >
            {t('orders.event.settled:paid')}
          </button>
        )}
        {order.status === 'paid' && (
          <button
            className="secondary-action"
            onClick={() => onUpdateStatus(order.id, 'refunded')}
            type="button"
          >
            {t('orders.event.settled:refunded')}
          </button>
        )}
      </div>
    </article>
  )

  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <h2>{t('orders.stale')}</h2>
        <span>{fmt.formatNumber(staleOrders.length)}</span>
      </div>
      {/* First, and stated plainly: this is the list an operator can actually
          act on, and the action is not a refund. */}
      <p className="admin-order-hint">{t('orders.staleHint')}</p>
      <div className="admin-table">
        {staleOrders.length === 0 && <p className="admin-empty-note">{t('orders.staleEmpty')}</p>}
        {staleOrders.map(renderRow)}
      </div>

      <div className="admin-section-header admin-order-all">
        <h2>{t('orders.title')}</h2>
        <span>{fmt.formatNumber(orders.length)}</span>
      </div>
      <p className="admin-order-hint">{t('orders.backstopHint')}</p>
      <div className="admin-table">
        {orders.length === 0 && <p className="admin-empty-note">{t('orders.empty')}</p>}
        {orders.map(renderRow)}
      </div>
    </section>
  )
}

export default AdminOrdersSection
