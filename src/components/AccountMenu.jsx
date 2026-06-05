import { useState } from 'react'
import { getAccessLevelLabel } from '../lib/i18n'

const emptyForm = {
  displayName: '',
  email: '',
  password: '',
}

const AccountMenu = ({
  authStatus,
  copy,
  language,
  onLogin,
  onLogout,
  onRegister,
  visitorUser,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')

  const updateForm = (event) => {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }))
  }

  const submit = async (event) => {
    event.preventDefault()
    setError('')

    try {
      if (mode === 'register') {
        await onRegister(form)
      } else {
        await onLogin({
          email: form.email,
          password: form.password,
        })
      }
      setForm(emptyForm)
      setIsOpen(false)
    } catch {
      setError(copy.authError)
    }
  }

  const accessLabel = getAccessLevelLabel(visitorUser?.accessLevel || 'guest', language)

  return (
    <div className="account-menu">
      <button
        type="button"
        className={visitorUser ? 'account-trigger-active' : 'account-trigger'}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span>{visitorUser ? copy.accountSignedIn : copy.accountGuest}</span>
        <strong>{visitorUser?.displayName || accessLabel}</strong>
      </button>

      {isOpen && (
        <div className="account-popover">
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
              <button
                type="button"
                className="secondary-action w-full"
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

              <div className="auth-mode-switch">
                <button
                  type="button"
                  className={mode === 'login' ? 'auth-mode-active' : 'auth-mode'}
                  onClick={() => setMode('login')}
                >
                  {copy.authHaveAccount}
                </button>
                <button
                  type="button"
                  className={mode === 'register' ? 'auth-mode-active' : 'auth-mode'}
                  onClick={() => setMode('register')}
                >
                  {copy.authNeedAccount}
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
                <button type="submit" className="primary-action w-full" disabled={authStatus === 'saving'}>
                  {mode === 'register' ? copy.authRegister : copy.authLogin}
                </button>
                {error && <p className="text-sm text-coral">{error}</p>}
                {authStatus === 'unavailable' && (
                  <p className="text-sm text-coral">{copy.authUnavailable}</p>
                )}
              </form>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default AccountMenu
