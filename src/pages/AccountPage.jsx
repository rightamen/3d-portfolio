import { languages, getAccessLevelLabel } from '../lib/i18n'

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

const AccountPage = ({ copy, language, onLanguageChange, onLogout, visitorUser }) => {
  if (!visitorUser) {
    return (
      <main className="auth-page">
        <nav className="auth-nav">
          <a href="/" className="text-xl font-bold text-neutral-300 hover:text-white">
            mrright.blog
          </a>
          <LanguageSwitch language={language} onLanguageChange={onLanguageChange} copy={copy} />
        </nav>
        <section className="auth-card">
          <p className="section-kicker">{copy.account}</p>
          <h1>{copy.accountLoginRequiredTitle}</h1>
          <p>{copy.accountLoginRequired}</p>
          <a href="/login?mode=login" className="primary-action">
            {copy.authLogin}
          </a>
        </section>
      </main>
    )
  }

  return (
    <main className="auth-page">
      <nav className="auth-nav">
        <a href="/" className="text-xl font-bold text-neutral-300 hover:text-white">
          mrright.blog
        </a>
        <div className="flex items-center gap-3">
          <a href="/" className="secondary-action">
            {copy.navHome}
          </a>
          <LanguageSwitch language={language} onLanguageChange={onLanguageChange} copy={copy} />
        </div>
      </nav>

      <section className="account-center">
        <div className="account-center-hero">
          <p className="section-kicker">{copy.accountCenterKicker}</p>
          <h1>{copy.accountCenterTitle}</h1>
          <p>{copy.accountCenterIntro}</p>
        </div>

        <div className="account-center-grid">
          <article className="account-center-card">
            <span>{copy.authDisplayName}</span>
            <strong>{visitorUser.displayName}</strong>
          </article>
          <article className="account-center-card">
            <span>{copy.authEmail}</span>
            <strong>{visitorUser.email}</strong>
          </article>
          <article className="account-center-card">
            <span>{copy.accessLevel}</span>
            <strong>{getAccessLevelLabel(visitorUser.accessLevel, language)}</strong>
          </article>
          <article className="account-center-card">
            <span>{copy.authEmailStatus}</span>
            <strong>{visitorUser.emailVerified ? copy.authVerified : copy.authUnverified}</strong>
          </article>
        </div>

        <div className="account-center-actions">
          <a href="/#community" className="primary-action">
            {copy.navCommunity}
          </a>
          <a href="/#projects" className="secondary-action">
            {copy.navProjects}
          </a>
          <button type="button" className="danger-action" onClick={onLogout}>
            {copy.authLogout}
          </button>
        </div>
      </section>
    </main>
  )
}

export default AccountPage
