import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getAccessLevelLabel } from '../lib/i18n'

const AccountMenu = ({
  copy,
  language,
  onLogout,
  visitorUser,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const accessLabel = getAccessLevelLabel(visitorUser?.accessLevel || 'guest', language)

  return (
    <div className="account-menu">
      <button
        type="button"
        className={visitorUser ? 'account-trigger-active' : 'account-trigger'}
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <span>{visitorUser ? copy.accountSignedIn : copy.accountGuest}</span>
        <strong>{visitorUser?.displayName || accessLabel}</strong>
      </button>

      {isOpen && (
        <div className="account-popover" role="menu">
          {visitorUser ? (
            <>
              <div className="account-profile">
                <span>{copy.account}</span>
                <strong>{visitorUser.displayName}</strong>
                <small>{visitorUser.email}</small>
              </div>
              <div className="account-access">
                <span>{copy.accessLevel}</span>
                <strong>{accessLabel}</strong>
              </div>
              <div className="account-access">
                <span>{copy.authEmailStatus}</span>
                <strong>{visitorUser.emailVerified ? copy.authVerified : copy.authUnverified}</strong>
              </div>
              <Link to="/account" className="primary-action w-full" role="menuitem">
                {copy.accountCenter}
              </Link>
              <button
                type="button"
                className="secondary-action w-full"
                role="menuitem"
                onClick={() => {
                  onLogout()
                  setIsOpen(false)
                }}
              >
                {copy.authLogout}
              </button>
            </>
          ) : (
            <>
              <div>
                <div className="section-kicker mb-1">{copy.account}</div>
                <p className="text-sm leading-relaxed text-neutral-400">{copy.authHint}</p>
              </div>
              <Link to="/login?mode=login" className="primary-action w-full" role="menuitem">
                {copy.authLogin}
              </Link>
              <Link to="/login?mode=register" className="secondary-action w-full" role="menuitem">
                {copy.authRegister}
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default AccountMenu
