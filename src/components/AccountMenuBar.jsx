import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { initials } from '../lib/initials'

// The account menu in the top bar.
//
// Shaped on the one a browsing art site puts behind its avatar: view/edit
// profile, then the things you own or manage, then settings and sign out. Every
// entry here goes somewhere that already exists -- these pages were all built,
// they were just several clicks deep. Nothing is a placeholder: an icon that
// does nothing teaches people not to trust the bar.

const AccountMenuBar = ({ copy, onSignOut, visitorUser }) => {
  const [open, setOpen] = useState(false)
  const holder = useRef(null)

  // Closes on an outside click and on Escape. A menu that only closes by
  // toggling the same button is one people leave open by accident.
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

  if (!visitorUser) {
    return (
      <Link className="topbar-signin" to="/login?mode=login">
        {copy.menuSignIn}
      </Link>
    )
  }

  const close = () => setOpen(false)

  return (
    <div className="topbar-account" ref={holder}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={copy.navAccountMenu}
        className="topbar-avatar"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {visitorUser.avatarUrl ? (
          <img alt="" src={visitorUser.avatarUrl} />
        ) : (
          <span>{initials(visitorUser.displayName, visitorUser.handle)}</span>
        )}
      </button>

      {open && (
        <div className="topbar-menu" role="menu">
          <div className="topbar-menu-head">
            <strong>{visitorUser.displayName}</strong>
            {/* The handle is half of every work URL, so its absence is worth
                saying here rather than only where publishing fails. */}
            <span>{visitorUser.handle ? `@${visitorUser.handle}` : copy.menuNoHandle}</span>
          </div>

          {visitorUser.handle && (
            <Link onClick={close} role="menuitem" to={`/u/${visitorUser.handle}`}>
              {copy.menuViewProfile}
            </Link>
          )}
          <Link onClick={close} role="menuitem" to="/account/settings">
            {copy.menuEditProfile}
          </Link>

          <hr />

          <Link onClick={close} role="menuitem" to="/account/works">
            {copy.menuMyWorks}
          </Link>
          <Link onClick={close} role="menuitem" to="/account/selling">
            {copy.menuSelling}
          </Link>
          <Link onClick={close} role="menuitem" to="/account/downloads">
            {copy.menuPurchases}
          </Link>

          <hr />

          <Link onClick={close} role="menuitem" to="/account">
            {copy.menuSettings}
          </Link>
          <button
            onClick={() => {
              close()
              onSignOut()
            }}
            role="menuitem"
            type="button"
          >
            {copy.menuSignOut}
          </button>
        </div>
      )}
    </div>
  )
}

export default AccountMenuBar
