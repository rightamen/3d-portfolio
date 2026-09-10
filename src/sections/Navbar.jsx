import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import AccountMenuBar from '../components/AccountMenuBar'
import NotificationBell from '../components/NotificationBell'
import { languages } from '../lib/i18n'

// The one top bar, on every page.
//
// Each page used to carry its own header -- a logo and a language switch,
// repeated six times and drifting apart -- and the work and explore pages had
// no way back to the homepage at all. There is one bar now, rendered above the
// routes, so the site reads as one place rather than a set of pages that
// happen to share a domain.
//
// Shaped on a browsing art site: brand, a short nav, search, the publish
// action, the bell and the account menu. Still deliberately no cart -- this
// site has no basket, and an icon that does nothing teaches people not to trust
// the rest of the bar. The bell was left out for the same reason until there
// was something behind it; there is now.

const LanguageSwitch = ({ copy, language, onLanguageChange }) => (
  <div className="language-switch" aria-label={copy.toggleLanguage}>
    {languages.map((item) => (
      <button
        className={language === item.code ? 'language-switch-active' : 'language-switch-button'}
        key={item.code}
        onClick={() => onLanguageChange(item.code)}
        title={item.label}
        type="button"
      >
        {item.shortLabel}
      </button>
    ))}
  </div>
)

const Navbar = ({
  copy,
  language,
  onLanguageChange,
  onVisitorLogout,
  ownerHandle,
  visitorToken,
  visitorUser,
}) => {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  const search = (event) => {
    event.preventDefault()
    const value = String(event.target.elements.q.value || '').trim()
    // Always to /explore: search IS the catalogue, filtered. An empty query
    // lands there unfiltered rather than doing nothing.
    navigate(value ? `/explore?query=${encodeURIComponent(value)}` : '/explore')
    setOpen(false)
  }

  const links = [
    { label: copy.navExplore, to: '/explore' },
    { label: copy.navCommunity, to: '/community' },
    ...(ownerHandle ? [{ label: copy.navAbout, to: `/u/${ownerHandle}` }] : []),
  ]

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link className="topbar-brand" onClick={() => setOpen(false)} to="/">
          mrright.blog
        </Link>

        <nav className="topbar-links">
          {links.map((item) => (
            <Link key={item.to} onClick={() => setOpen(false)} to={item.to}>
              {item.label}
            </Link>
          ))}
        </nav>

        <form className="topbar-search" onSubmit={search} role="search">
          <label className="explore-search-label" htmlFor="topbar-q">
            {copy.navSearch}
          </label>
          <input id="topbar-q" name="q" placeholder={copy.navSearch} type="search" />
        </form>

        <div className="topbar-actions">
          {/* Publishing is the thing this site is for, so it is an action in
              the bar rather than something to find in a menu. */}
          <Link className="topbar-publish" to={visitorToken ? '/account/works' : '/login?mode=login'}>
            {copy.navPublish}
          </Link>
          <LanguageSwitch copy={copy} language={language} onLanguageChange={onLanguageChange} />
          {/* The bell round fifty-four deliberately left out, now that there is
              something behind it. It renders nothing at all for a visitor who is
              not signed in -- an icon that does nothing is still the thing that
              teaches people not to trust the bar. */}
          <NotificationBell authToken={visitorToken} copy={copy} />
          <AccountMenuBar copy={copy} onSignOut={onVisitorLogout} visitorUser={visitorUser} />
        </div>

        <button
          aria-controls="topbar-mobile"
          aria-expanded={open}
          aria-label={copy.toggleMenu}
          className="topbar-toggle"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          <img alt="" src={open ? '/assets/close.svg' : '/assets/menu.svg'} />
        </button>
      </div>

      {open && (
        <div className="topbar-mobile" id="topbar-mobile">
          <form onSubmit={search} role="search">
            <label className="explore-search-label" htmlFor="topbar-q-mobile">
              {copy.navSearch}
            </label>
            <input id="topbar-q-mobile" name="q" placeholder={copy.navSearch} type="search" />
          </form>
          {links.map((item) => (
            <Link key={item.to} onClick={() => setOpen(false)} to={item.to}>
              {item.label}
            </Link>
          ))}
          <Link
            className="topbar-publish"
            onClick={() => setOpen(false)}
            to={visitorToken ? '/account/works' : '/login?mode=login'}
          >
            {copy.navPublish}
          </Link>
          <LanguageSwitch copy={copy} language={language} onLanguageChange={onLanguageChange} />
        </div>
      )}
    </header>
  )
}

export default Navbar
