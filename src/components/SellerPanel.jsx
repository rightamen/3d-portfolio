import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  getMyOrders,
  getMySales,
  getPaymentInfo,
  savePaymentInfo,
  settleSale,
  uploadCommunityPostImage,
} from '../lib/api'
import { getApiErrorMessage } from '../lib/i18n'

// Everything about money, in one place: how this creator gets paid, what they
// have sold, and what they have bought.
//
// The confirm button is the load-bearing part. The platform never sees the
// money, so the creator saying "it arrived" IS the payment system -- and
// because nobody else can check them, every press of it is recorded. The hint
// beside it says so, rather than leaving that in a document nobody opens.

const EMPTY_METHOD = { instructions: '', label: '', qrUrl: '' }

const formatMoney = (cents, currency) =>
  `${(cents / 100).toFixed(2)} ${String(currency || 'usd').toUpperCase()}`

const statusLabel = (status, copy) =>
  ({
    cancelled: copy.orderStatusCancelled,
    paid: copy.orderStatusPaid,
    pending: copy.orderStatusPending,
    refunded: copy.orderStatusRefunded,
  })[status] || status

const SellerPanel = ({ authToken, copy }) => {
  const [methods, setMethods] = useState(null)
  const [sales, setSales] = useState({ grossCents: 0, items: [], netCents: 0 })
  const [orders, setOrders] = useState([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [reloadNonce, setReloadNonce] = useState(0)

  useEffect(() => {
    let isMounted = true

    Promise.all([getPaymentInfo(authToken), getMySales(authToken), getMyOrders(authToken)])
      .then(([payment, sold, bought]) => {
        if (!isMounted) return
        setMethods(payment.paymentInfo?.methods || [])
        setSales({
          grossCents: sold.grossCents || 0,
          items: sold.sales || [],
          netCents: sold.netCents || 0,
        })
        setOrders(bought.orders || [])
      })
      .catch((error) => {
        if (isMounted) setMessage(error.code ? getApiErrorMessage(error, copy) : error.message)
      })

    return () => {
      isMounted = false
    }
  }, [authToken, copy, reloadNonce])

  const run = useCallback(
    async (task, successMessage = '') => {
      if (busy) return
      setBusy(true)
      setMessage('')
      try {
        await task()
        setMessage(successMessage)
        setReloadNonce((value) => value + 1)
      } catch (error) {
        setMessage(error.code ? getApiErrorMessage(error, copy) : error.message)
      } finally {
        setBusy(false)
      }
    },
    [busy, copy],
  )

  if (methods === null) return <p className="text-neutral-400">{copy.loading}</p>

  const update = (index, changes) =>
    setMethods((current) =>
      current.map((method, position) => (position === index ? { ...method, ...changes } : method)),
    )

  return (
    <div className="account-section-stack">
      <section className="admin-section">
        <div className="admin-section-header">
          <div>
            <h2>{copy.paymentTitle}</h2>
            <p className="account-section-intro">{copy.paymentIntro}</p>
          </div>
        </div>

        {/* Said here, not only in the API: a creator deciding whether to
            upload a payment code deserves to know where it will appear. */}
        <p className="text-neutral-400 seller-private-note">{copy.paymentPrivateNote}</p>

        {methods.map((method, index) => (
          <div className="seller-method" key={index}>
            <label>
              <span>{copy.paymentMethodLabel}</span>
              <input
                onChange={(event) => update(index, { label: event.target.value })}
                type="text"
                value={method.label}
              />
            </label>
            <label>
              <span>{copy.paymentMethodInstructions}</span>
              <textarea
                onChange={(event) => update(index, { instructions: event.target.value })}
                rows={2}
                value={method.instructions}
              />
            </label>
            <div className="seller-method-qr">
              <span>{copy.paymentMethodQr}</span>
              <small>{copy.paymentUploadQr}</small>
              {method.qrUrl && <img alt="" src={method.qrUrl} />}
              <input
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (!file) return
                  // Uploaded through the existing image endpoint, which
                  // magic-byte checks the bytes. The API only accepts a path
                  // this server stores, so there is no other way to set one.
                  run(async () => {
                    const uploaded = await uploadCommunityPostImage(authToken, file)
                    update(index, { qrUrl: uploaded.imageUrl })
                  })
                }}
                type="file"
              />
            </div>
            <button
              className="secondary-action"
              onClick={() => setMethods(methods.filter((_, position) => position !== index))}
              type="button"
            >
              {copy.paymentRemove}
            </button>
          </div>
        ))}

        <div className="theme-editor-actions">
          <button
            className="secondary-action"
            disabled={methods.length >= 4}
            onClick={() => setMethods([...methods, { ...EMPTY_METHOD }])}
            type="button"
          >
            {copy.paymentAddMethod}
          </button>
          <button
            className="primary-action"
            disabled={busy}
            onClick={() => run(() => savePaymentInfo({ methods }, authToken), copy.paymentSaved)}
            type="button"
          >
            {copy.paymentSave}
          </button>
        </div>

        {message && (
          <p className={/saved|已保存|保存しました/.test(message) ? 'text-neutral-400' : 'text-coral'}>
            {message}
          </p>
        )}
      </section>

      <section className="admin-section">
        <div className="admin-section-header">
          <div>
            <h2>{copy.salesTitle}</h2>
            <p className="account-section-intro">
              {copy.salesGross}: {formatMoney(sales.grossCents, sales.items[0]?.currency)} ·{' '}
              {copy.salesNet}: {formatMoney(sales.netCents, sales.items[0]?.currency)}
            </p>
          </div>
        </div>

        {sales.items.length === 0 && <p className="text-neutral-400">{copy.salesEmpty}</p>}
        {sales.items.map((sale) => (
          <article className="seller-order" key={sale.id}>
            <div>
              <Link to={sale.workUrl}>{sale.workTitle}</Link>
              <small>
                {formatMoney(sale.amountCents, sale.currency)} · {statusLabel(sale.status, copy)}
              </small>
              {sale.buyerNote && <p className="seller-order-note">{sale.buyerNote}</p>}
            </div>
            {sale.status === 'pending' ? (
              // The load-bearing button. The platform never sees the money, so
              // this press IS the payment system -- and because nobody else
              // can check it, the hint says out loud that it is recorded.
              <div className="seller-order-actions">
                <button
                  className="primary-action"
                  disabled={busy}
                  onClick={() => run(() => settleSale(sale.id, 'paid', '', authToken))}
                  type="button"
                >
                  {copy.salesConfirm}
                </button>
                <small>{copy.salesConfirmHint}</small>
              </div>
            ) : (
              <button
                className="secondary-action"
                disabled={busy || sale.status !== 'paid'}
                onClick={() => run(() => settleSale(sale.id, 'refunded', '', authToken))}
                type="button"
              >
                {copy.salesRefund}
              </button>
            )}
          </article>
        ))}
      </section>

      <section className="admin-section">
        <div className="admin-section-header">
          <h2>{copy.purchasesTitle}</h2>
        </div>
        {orders.length === 0 && <p className="text-neutral-400">{copy.purchasesEmpty}</p>}
        {orders.map((order) => (
          <article className="seller-order" key={order.id}>
            <div>
              <Link to={order.workUrl}>{order.workTitle}</Link>
              <small>
                {formatMoney(order.amountCents, order.currency)} ·{' '}
                {statusLabel(order.status, copy)}
              </small>
            </div>
          </article>
        ))}
      </section>
    </div>
  )
}

export default SellerPanel
