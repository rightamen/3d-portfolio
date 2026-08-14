import { useState } from 'react'
import { motion as Motion } from 'motion/react'
import AccountMenu from '../components/AccountMenu'
import { languages } from '../lib/i18n'

function Navigation({ onNavigate, copy }) {
  const navItems = [
    { label: copy.navHome, href: '#home' },
    { label: copy.navAbout, href: '#about' },
    { label: copy.navProjects, href: '#projects' },
    { label: copy.navCommunity, href: '/community' },
    { label: copy.navExperience, href: '#experience' },
    { label: copy.navContact, href: '#contact' },
  ]

  return (
    <ul className="nav-ul">
      {navItems.map((item) => (
        <li key={item.href} className="nav-li">
          <a href={item.href} className="nav-link" onClick={onNavigate}>
            {item.label}
          </a>
        </li>
      ))}
    </ul>
  )
}

const LanguageSwitch = ({ language, onLanguageChange, copy }) => (
  <div className="language-switch" aria-label={copy.toggleLanguage}>
    {languages.map((item) => (
      <button
        key={item.code}
        type="button"
        className={language === item.code ? 'language-switch-active' : 'language-switch-button'}
        onClick={() => onLanguageChange(item.code)}
        title={item.label}
      >
        {item.shortLabel}
      </button>
    ))}
  </div>
)

const Navbar = ({
  authStatus,
  copy,
  language,
  onLanguageChange,
  onVisitorLogin,
  onVisitorLogout,
  onVisitorRegister,
  visitorUser,
}) => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="fixed inset-x-0 z-20 w-full border-b border-white/10 bg-[#050616]/70 backdrop-blur-lg">
      <div className="mx-auto c-space max-w-7xl">
        <div className="flex items-center justify-between py-2 lg:py-0">
          <a
            href="#home"
            className="text-xl font-bold text-neutral-300 transition-colors hover:text-white"
          >
            mrright.blog
          </a>

          {/* lg, not sm. The full bar is the brand, six nav links, the language
              switch and the account menu, and it needs about 960px. Revealing it
              at sm (640px) meant that from 640px to ~950px -- every tablet and
              small laptop -- the account menu was laid out past the right edge
              and clipped away by body{overflow-x:hidden}, so signing in was
              simply unreachable there. The mobile sheet below carries all three,
              so raising the breakpoint gives those widths more, not less. */}
          <div className="hidden items-center gap-5 lg:flex">
            <nav>
              <Navigation copy={copy} />
            </nav>

            <div className="hidden lg:block">
              <LanguageSwitch
                language={language}
                onLanguageChange={onLanguageChange}
                copy={copy}
              />
            </div>

            <AccountMenu
              authStatus={authStatus}
              copy={copy}
              language={language}
              onLogin={onVisitorLogin}
              onLogout={onVisitorLogout}
              onRegister={onVisitorRegister}
              visitorUser={visitorUser}
            />
          </div>

          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="flex cursor-pointer text-neutral-400 hover:text-white focus:outline-none lg:hidden"
            aria-label={copy.toggleMenu}
            aria-expanded={isOpen}
            aria-controls="mobile-navigation"
          >
            <img
              src={isOpen ? '/assets/close.svg' : '/assets/menu.svg'}
              className="h-6 w-6"
              alt=""
            />
          </button>
        </div>
      </div>

      {isOpen && (
        <Motion.div
          id="mobile-navigation"
          className="block overflow-hidden text-center lg:hidden"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          style={{ maxHeight: '100vh' }}
        >
          <nav className="grid gap-4 pb-5">
            <Navigation copy={copy} onNavigate={() => setIsOpen(false)} />
            <div className="mx-auto">
              <LanguageSwitch
                language={language}
                onLanguageChange={onLanguageChange}
                copy={copy}
              />
            </div>
            <div className="mx-auto w-full max-w-sm px-5">
              <AccountMenu
                authStatus={authStatus}
                copy={copy}
                language={language}
                onLogin={onVisitorLogin}
                onLogout={onVisitorLogout}
                onRegister={onVisitorRegister}
                visitorUser={visitorUser}
              />
            </div>
          </nav>
        </Motion.div>
      )}
    </div>
  )
}

export default Navbar
