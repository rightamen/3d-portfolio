import { useEffect, useState } from 'react'
import { languages } from '../lib/i18n'

const emptyForm = {
  code: '',
  displayName: '',
  email: '',
  password: '',
}

const authModes = ['login', 'register', 'verify']

const getInitialMode = () => {
  const mode = new URLSearchParams(window.location.search).get('mode')
  return authModes.includes(mode) ? mode : 'login'
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
  onResendVerification,
  onVerifyEmail,
  visitorUser,
}) => {
  const [mode, setMode] = useState(getInitialMode)
  const [form, setForm] = useState(emptyForm)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [completedSteps, setCompletedSteps] = useState([])

  const pageCopy = {
    login: {
      intro: copy.authLoginPageIntro || copy.authPageIntro,
      title: copy.authLoginPageTitle || copy.authPageTitle,
    },
    register: {
      intro: copy.authRegisterPageIntro || copy.authPageIntro,
      title: copy.authRegisterPageTitle || copy.authPageTitle,
    },
    verify: {
      intro: copy.authVerifyPageIntro || copy.authPageIntro,
      title: copy.authVerifyPageTitle || copy.authPageTitle,
    },
  }[mode]

  useEffect(() => {
    if (visitorUser) window.location.replace('/account')
  }, [visitorUser])

  const changeMode = (nextMode) => {
    setMode(nextMode)
    setError('')
    setMessage('')

    const url = new URL(window.location.href)
    url.searchParams.set('mode', nextMode)
    window.history.replaceState(null, '', url)
  }

  const updateForm = (event) => {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }))
  }

  const getVerificationMessage = (verification) => {
    if (verification?.delivery === 'manual') return copy.authVerificationManual
    if (verification?.delivery === 'failed') return copy.authVerificationFailed
    return copy.authVerificationSent
  }

  const resendVerification = async () => {
    setError('')
    setMessage('')

    if (!form.email) {
      setError(copy.authEmailRequired)
      return
    }

    try {
      const result = await onResendVerification({ email: form.email })
      setMessage(getVerificationMessage(result.verification))
    } catch (caughtError) {
      setError(caughtError.message || copy.authError)
    }
  }

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')

    try {
      if (mode === 'register') {
        const result = await onRegister(form)
        setCompletedSteps(['account'])
        changeMode('verify')
        setMessage(getVerificationMessage(result.verification))
        return
      }

      if (mode === 'verify') {
        if (!form.code.trim() && form.password) {
          await onLogin({ email: form.email, password: form.password })
        } else {
          await onVerifyEmail({ code: form.code, email: form.email })
        }
        setCompletedSteps(['account', 'email'])
        window.location.replace('/account')
        return
      }

      await onLogin({ email: form.email, password: form.password })
      window.location.replace('/account')
    } catch (caughtError) {
      if (caughtError.code === 'EMAIL_NOT_VERIFIED' || caughtError.message.includes('verify')) {
        setCompletedSteps(['account'])
        changeMode('verify')
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
          <h1>{pageCopy.title}</h1>
          <p>{pageCopy.intro}</p>
        </div>

        {mode !== 'verify' ? (
          <div className="auth-mode-switch">
            <button
              type="button"
              className={mode === 'login' ? 'auth-mode-active' : 'auth-mode'}
              onClick={() => changeMode('login')}
            >
              {copy.authLogin}
            </button>
            <button
              type="button"
              className={mode === 'register' ? 'auth-mode-active' : 'auth-mode'}
              onClick={() => changeMode('register')}
            >
              {copy.authRegister}
            </button>
          </div>
        ) : (
          <div className="auth-flow">
            {[
              { key: 'account', label: copy.authFlowAccount },
              { key: 'email', label: copy.authFlowEmail },
              { key: 'done', label: copy.authFlowDone },
            ].map((step, index) => (
              <span
                key={step.key}
                className={
                  completedSteps.includes(step.key) || (step.key === 'email' && mode === 'verify')
                    ? 'auth-flow-step-active'
                    : 'auth-flow-step'
                }
              >
                <strong>{index + 1}</strong>
                {step.label}
              </span>
            ))}
          </div>
        )}

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
              required={!form.password}
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
          {mode === 'verify' && (
            <button
              type="button"
              className="secondary-action w-full"
              disabled={authStatus === 'saving'}
              onClick={resendVerification}
            >
              {copy.authResendVerification}
            </button>
          )}
          {mode === 'verify' && (
            <button type="button" className="auth-text-action" onClick={() => changeMode('login')}>
              {copy.authBackToLogin}
            </button>
          )}
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
