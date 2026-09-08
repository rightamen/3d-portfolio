import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  cancelOrder,
  createWorkDownloadTicket,
  createWorkOrder,
  getOrder,
  setOrderNote,
} from '../lib/api'
import { getApiErrorMessage } from '../lib/i18n'
import { formatWorkPrice } from '../lib/works'

// Buying a work, and downloading one you are entitled to.
//
// The platform never touches the money: the buyer pays the creator directly
// and the CREATOR confirms receipt. That makes the risk notice below part of
// the purchase, not part of the terms -- somebody about to transfer money to a
// stranger should be told what their recourse is before they do it, not after.
//
// Every rule here is enforced by the API as well. A hidden button is a
// courtesy; hasEntitlement is the protection.

const EMPTY_ORDER = { events: [], order: null, paymentMethods: [] }

const WorkPurchase = ({ authToken, copy, handle, isOwner, slug, work }) => {
  const [loaded, setLoaded] = useState(EMPTY_ORDER)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  // Set once the buyer opens the payment panel, so the notice is read before
  // the codes appear rather than beside them.
  const [acknowledged, setAcknowledged] = useState(false)

  const orderId = loaded.order?.id
  const isPaid = loaded.order?.status === 'paid'

  // The order id is remembered per work, so returning to the page picks the
  // pending order back up instead of looking like nothing happened.
  const storageKey = useMemo(() => `mrright-order:${handle}/${slug}`, [handle, slug])

  useEffect(() => {
    if (!authToken) return undefined
    let remembered = ''
    try {
      remembered = window.localStorage.getItem(storageKey) || ''
    } catch {
      // A browser that refuses storage still works; it just forgets.
    }
    if (!remembered) return undefined

    let isMounted = true
    getOrder(remembered, authToken)
      .then((payload) => {
        if (isMounted) setLoaded({ events: payload.events || [], order: payload.order, paymentMethods: payload.paymentMethods || [] })
      })
      .catch(() => {
        // A remembered order that no longer resolves is not an error worth
        // showing: the buy button is the right thing to see.
        try {
          window.localStorage.removeItem(storageKey)
        } catch {
          /* nothing to clean up */
        }
      })

    return () => {
      isMounted = false
    }
  }, [authToken, storageKey])

  const remember = useCallback(
    (payload) => {
      setLoaded({
        events: payload.events || [],
        order: payload.order,
        paymentMethods: payload.paymentMethods || payload.order?.paymentSnapshot?.methods || [],
      })
      try {
        window.localStorage.setItem(storageKey, payload.order.id)
      } catch {
        /* remembering is a convenience, not a requirement */
      }
    },
    [storageKey],
  )

  const run = async (work_) => {
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      await work_()
    } catch (error) {
      setMessage(error.code ? getApiErrorMessage(error, copy) : error.message)
    } finally {
      setBusy(false)
    }
  }

  const download = () =>
    run(async () => {
      const payload = await createWorkDownloadTicket(handle, slug, authToken)
      // A plain navigation, so the browser streams the file to disk instead of
      // the tab holding a multi-hundred-megabyte archive in memory.
      window.location.href = payload.ticket.url
    })

  const isFree = work.priceCents === 0
  const canBePaid = work.creator?.acceptsPayment

  if (!authToken) {
    return (
      <div className="work-purchase">
        <Link className="primary-action" to="/login?mode=login">
          {isFree ? copy.buyFree : copy.buyNow}
        </Link>
      </div>
    )
  }

  // The creator, and anyone who has bought it, get the file. The API decides;
  // this only chooses what to render.
  if (isFree || isOwner || isPaid) {
    return (
      <div className="work-purchase">
        {isPaid && <p className="work-purchase-owned">{copy.buyOwned}</p>}
        <button className="primary-action" disabled={busy} onClick={download} type="button">
          {isFree ? copy.buyFree : copy.buyDownload}
        </button>
        {message && <p className="text-coral">{message}</p>}
      </div>
    )
  }

  if (!canBePaid) {
    return (
      <div className="work-purchase">
        <p className="text-neutral-400">{copy.buyNotSelling}</p>
      </div>
    )
  }

  if (!loaded.order) {
    return (
      <div className="work-purchase">
        <button
          className="primary-action"
          disabled={busy}
          onClick={() =>
            run(async () => remember(await createWorkOrder(handle, slug, authToken)))
          }
          type="button"
        >
          {copy.buyNow} · {formatWorkPrice(work, copy)}
        </button>
        {message && <p className="text-coral">{message || copy.buyOrderFailed}</p>}
      </div>
    )
  }

  return (
    <div className="work-purchase work-purchase-open">
      <h3>{copy.buyPayTitle}</h3>
      <p className="work-purchase-amount">
        {copy.buyPayAmount}: <strong>{formatWorkPrice(work, copy)}</strong>
      </p>

      {/* Deliberately before the payment codes, and deliberately not a link to
          the terms. Somebody about to transfer money to a stranger should read
          what their recourse is first. */}
      <div className="work-purchase-risk">
        <strong>{copy.buyRiskTitle}</strong>
        <p>{copy.buyRiskBody}</p>
      </div>

      {!acknowledged ? (
        <button className="primary-action" onClick={() => setAcknowledged(true)} type="button">
          {copy.buyNow}
        </button>
      ) : (
        <>
          <ul className="work-purchase-methods">
            {loaded.paymentMethods.map((method) => (
              <li key={method.label}>
                <strong>{method.label}</strong>
                {method.instructions && <p>{method.instructions}</p>}
                {method.qrUrl && <img alt={method.label} src={method.qrUrl} />}
              </li>
            ))}
          </ul>

          <form
            className="work-purchase-note"
            onSubmit={(event) => {
              event.preventDefault()
              run(async () => {
                await setOrderNote(orderId, note.trim(), authToken)
                remember(await getOrder(orderId, authToken))
                setMessage(copy.buyPayNoteSaved)
              })
            }}
          >
            <label htmlFor="order-note">{copy.buyPayNoteLabel}</label>
            <input
              id="order-note"
              onChange={(event) => setNote(event.target.value)}
              type="text"
              value={note}
            />
            <button className="primary-action" disabled={busy || !note.trim()} type="submit">
              {copy.buyPayNoteSubmit}
            </button>
          </form>

          {loaded.order.buyerNote && (
            <p className="text-neutral-400">{copy.buyOrderPending}</p>
          )}

          {/* Changing your mind has to be possible. Without it an abandoned
              order sits in the creator's list forever, and in the operator's
              stale list where it looks like a creator ignoring a payment. */}
          <button
            className="secondary-action"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await cancelOrder(orderId, authToken)
                setLoaded(EMPTY_ORDER)
                setAcknowledged(false)
                try {
                  window.localStorage.removeItem(storageKey)
                } catch {
                  /* nothing to clean up */
                }
              })
            }
            type="button"
          >
            {copy.buyCancel}
          </button>
        </>
      )}

      {message && (
        <p className={message === copy.buyPayNoteSaved ? 'text-neutral-400' : 'text-coral'}>
          {message}
        </p>
      )}
    </div>
  )
}

export default WorkPurchase
