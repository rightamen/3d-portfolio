import { useEffect, useState } from 'react'
import { languages } from '../lib/i18n'

const emptyForm = {
  code: '',
  displayName: '',
  email: '',
  password: '',
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

const AuthPage = ({
  authStatus,
  copy,
  language,
  onLanguageChange,
  onLogin,
  onRegister,
  onVerifyEmail,
  visitorUser,
}) => {
  const [mode, setMode] = useState(() =>
    new URLSearchParams(window.location.search).get('mode') === 'register' ? 'register' : 'login',
  )
  const [form, setForm] = useState(emptyForm)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (visitorUser) window.location.replace('/account')
  }, [visitorUser])

  const updateForm = (event) => {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }))
  }

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')

    try {
      if (mode === 'register') {
        const result = await onRegister(form)
        setMode('verify')
        setMessage(
          result.verification?.delivery === 'manual'
            ? copy.authVerificationManual
            : copy.authVerificationSent,
        )
        return
      }

      if (mode === 'verify') {
        await onVerifyEmail({ code: form.code, email: form.email })
        window.location.replace('/account')
        return
      }

      await onLogin({ email: form.email, password: form.password })
      window.location.replace('/account')
    } catch (caughtError) {
      if (caughtError.message.includes('verify')) {
        setMode('verify')
        setError(copy.authEmailNotVerified)
        return
      }
      setError(caughtError.message || copy.authError)
    }
  }

  return (
    <main className="auth-page">
      <nav className="auth-nav">
        <a href="/" className="text-xl font-bold text-neutral-300 hover:text-white">
          mrright.blog
        </a>
        <LanguageSwitch language={language} onLanguageChange={onLanguageChange} copy={copy} />
      </nav>

      <section className="auth-card">
        <div>
          <p className="section-kicker">{copy.authPageKicker}</p>
          <h1>{copy.authPageTitle}</h1>
          <p>{copy.authPageIntro}</p>
        </div>

        <div className="auth-mode-switch">
          <button
            type="button"
            className={mode === 'login' ? 'auth-mode-active' : 'auth-mode'}
            onClick={() => setMode('login')}
          >
            {copy.authLogin}
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'auth-mode-active' : 'auth-mode'}
            onClick={() => setMode('register')}
          >
            {copy.authRegister}
          </button>
          <button
            type="button"
            className={mode === 'verify' ? 'auth-mode-active' : 'auth-mode'}
            onClick={() => setMode('verify')}
          >
            {copy.authVerifyEmail}
          </button>
        </div>

        <form className="account-form" onSubmit={submit}>
          {mode === 'register' && (
            <input
              className="field-input field-input-focus"
              name="displayName"
              placeholder={copy.authDisplayName}
              value={form.displayName}
              onChange={updateForm}
              required
            />
          )}
          <input
            className="field-input field-input-focus"
            name="email"
            placeholder={copy.authEmail}
            type="email"
            value={form.email}
            onChange={updateForm}
            required
          />
          {mode !== 'verify' && (
            <input
              className="field-input field-input-focus"
              minLength={8}
              name="password"
              placeholder={copy.authPassword}
              type="password"
              value={form.password}
              onChange={updateForm}
              required
            />
          )}
          {mode === 'verify' && (
            <input
              className="field-input field-input-focus"
              inputMode="numeric"
              name="code"
              placeholder={copy.authVerificationCode}
              value={form.code}
              onChange={updateForm}
              required
            />
          )}
          <button type="submit" className="primary-action w-full" disabled={authStatus === 'saving'}>
            {authStatus === 'saving'
              ? copy.saving
              : mode === 'register'
                ? copy.authRegister
                : mode === 'verify'
                  ? copy.authVerifyEmail
                  : copy.authLogin}
          </button>
          {message && <p className="text-sm leading-relaxed text-neutral-300">{message}</p>}
          {error && <p className="text-sm leading-relaxed text-coral">{error}</p>}
          {authStatus === 'unavailable' && (
            <p className="text-sm leading-relaxed text-coral">{copy.authUnavailable}</p>
          )}
        </form>
      </section>
    </main>
  )
}

export default AuthPage
