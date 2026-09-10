import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { getNotifications, getUnreadNotifications, markNotificationsRead } from '../lib/api'

// The bell in the top bar.
//
// Round fifty-four deliberately left this out: "no notification bell, no cart --
// this site has neither, and an icon that does nothing teaches people not to
// trust the rest of the bar." That reasoning has not changed; what changed is
// that there is now something behind it.
//
// It only exists for a signed-in visitor, and only shows a count when there is
// one. An empty bell is still a bell that does nothing.

const RELATIVE = [
  [60, 'justNow'],
  [3600, 'minutes'],
  [86400, 'hours'],
]

const timeAgo = (copy, iso) => {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < RELATIVE[0][0]) return copy.notificationsJustNow
  if (seconds < RELATIVE[1][0]) return copy.notificationsMinutes.replace('{n}', Math.floor(seconds / 60))
  if (seconds < RELATIVE[2][0]) return copy.notificationsHours.replace('{n}', Math.floor(seconds / 3600))
  return new Date(iso).toLocaleDateString()
}

// The kinds the platform sends. An unknown kind falls back to nothing, which is
// why the server does not constrain `kind` with a CHECK: a new event type must
// not need a migration before it can be sent, and the stored title still shows.
//
// ⚠️ The FIRST letter has to be capitalised too. Without it, 'order:placed'
// built `notificationKindorderPlaced`, which is in no dictionary, so every
// notification rendered with a blank label — the line that says what actually
// happened. Nothing threw, the title still showed, and the store tests could not
// see it. It took walking the chain in a browser.
const kindLabel = (copy, kind) => {
  const camel = String(kind || '').replace(/[:-](\w)/g, (_, character) => character.toUpperCase())
  if (!camel) return ''
  return copy[`notificationKind${camel[0].toUpperCase()}${camel.slice(1)}`] || ''
}

const NotificationBell = ({ authToken, copy }) => {
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [items, setItems] = useState(null)
  const holder = useRef(null)

  const refreshCount = useCallback(() => {
    if (!authToken) return
    getUnreadNotifications(authToken)
      // Soft-fails to silence rather than to an error badge: a bell that shows
      // a problem it cannot explain is worse than a bell showing nothing.
      .then((payload) => setUnread(Number(payload.unread || 0)))
      .catch(() => {})
  }, [authToken])

  useEffect(() => {
    refreshCount()
    // Polled rather than pushed. A websocket for this would be a second
    // transport to operate for a count that nobody needs within the minute.
    const timer = window.setInterval(refreshCount, 120_000)
    return () => window.clearInterval(timer)
  }, [refreshCount])

  useEffect(() => {
    if (!open) return undefined

    const onPointer = (event) => {
      if (!holder.current?.contains(event.target)) setOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!authToken) return null

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (!next) return

    setItems(null)
    try {
      const payload = await getNotifications(authToken)
      setItems(payload.items || [])
      // Opening it means they have been seen. Marked after the list arrives, so
      // a failed fetch does not silently clear the badge for something the
      // person never got to read.
      if (payload.unread > 0) {
        await markNotificationsRead(authToken)
        setUnread(0)
      }
    } catch {
      setItems([])
    }
  }

  return (
    <div className="topbar-notify" ref={holder}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={
          unread > 0 ? copy.notificationsUnreadLabel.replace('{n}', unread) : copy.notificationsLabel
        }
        className="topbar-bell"
        onClick={toggle}
        type="button"
      >
        {/* Inline, because one glyph is not worth a request. */}
        <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
          <path
            d="M12 3a6 6 0 0 0-6 6v3.6L4.5 16h15L18 12.6V9a6 6 0 0 0-6-6Zm0 18a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 21Z"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
        </svg>
        {unread > 0 && <span className="topbar-bell-dot">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="topbar-notify-panel" role="menu">
          <div className="topbar-notify-head">
            <strong>{copy.notificationsLabel}</strong>
          </div>

          {items === null && <p className="topbar-notify-empty">{copy.loading}</p>}
          {items?.length === 0 && <p className="topbar-notify-empty">{copy.notificationsEmpty}</p>}

          {items?.map((item) => {
            const label = item.source === 'announcement' ? copy.notificationsAnnouncement : kindLabel(copy, item.kind)
            const inner = (
              <>
                <span className="topbar-notify-kind">{label}</span>
                <strong>{item.title}</strong>
                {item.body && <span className="topbar-notify-body">{item.body}</span>}
                <time>{timeAgo(copy, item.createdAt)}</time>
              </>
            )

            return item.link ? (
              <Link
                className={item.read ? '' : 'topbar-notify-unread'}
                key={item.id}
                onClick={() => setOpen(false)}
                role="menuitem"
                to={item.link}
              >
                {inner}
              </Link>
            ) : (
              <div className={item.read ? '' : 'topbar-notify-unread'} key={item.id} role="menuitem">
                {inner}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default NotificationBell
