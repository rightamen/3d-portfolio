import { useState } from 'react'

import { confirmAdminTotpEnrolment, startAdminTotpEnrolment } from '../lib/api'
import { useAdminI18n } from '../lib/admin/i18nAdmin'

// Moving an authenticator to a new phone, from the browser.
//
// This panel exists because the first version of admin accounts had no way to
// do that: the secret was printed once by a CLI on the VPS, as text, and a lost
// phone meant SSH. It also means an enrolment finally shows an actual QR code —
// every account enrolled before this one was typed in by hand from a base32
// string, which is why nobody had ever seen a code to scan.
//
// The two steps mirror the API. Nothing is replaced until a code generated from
// the new QR comes back, so a mis-scan costs a retry rather than the account.

const AdminTotpEnrolment = ({ signedInUsername, token }) => {
  const { fmt, t } = useAdminI18n()
  const [username, setUsername] = useState(signedInUsername || '')
  const [password, setPassword] = useState('')
  const [totp, setTotp] = useState('')
  const [enrolment, setEnrolment] = useState(null)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setEnrolment(null)
    setQrDataUrl('')
    setRecoveryCodes(null)
    setTotp('')
    setMessage('')
  }

  const start = async (event) => {
    event.preventDefault()
    setBusy(true)
    setMessage('')

    try {
      const payload = await startAdminTotpEnrolment(token, { password, username })
      const next = payload?.enrolment
      if (!next?.otpauthUrl) throw new Error(t('totp.noEnrolment'))

      setEnrolment(next)
      setRecoveryCodes(null)
      setTotp('')

      // Imported here rather than at the top of the file so the QR encoder is
      // only fetched by the operator who actually opens this panel, instead of
      // riding along in the admin bundle for everyone.
      const { default: QRCode } = await import('qrcode')
      setQrDataUrl(
        await QRCode.toDataURL(next.otpauthUrl, {
          color: { dark: '#0f172a', light: '#ffffff' },
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 240,
        }),
      )
    } catch (error) {
      setMessage(error?.message || t('totp.startError'))
    } finally {
      setBusy(false)
    }
  }

  const confirm = async (event) => {
    event.preventDefault()
    setBusy(true)
    setMessage('')

    try {
      const payload = await confirmAdminTotpEnrolment(token, { password, totp, username })
      setRecoveryCodes(payload?.recoveryCodes || [])
      // The candidate secret and the password have done their job; holding
      // either in component state past this point is pure exposure.
      setEnrolment(null)
      setQrDataUrl('')
      setPassword('')
      setTotp('')
    } catch (error) {
      setMessage(error?.message || t('totp.confirmError'))
    } finally {
      setBusy(false)
    }
  }

  if (recoveryCodes) {
    return (
      <section className="admin-section admin-animate-in">
        <div className="admin-section-header">
          <h2>{t('totp.updatedTitle')}</h2>
        </div>
        <div className="admin-totp-panel">
          <p className="text-sm text-neutral-300">{t('totp.updatedBody')}</p>
          <ul className="admin-totp-codes">
            {recoveryCodes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
          <p className="text-sm text-neutral-400">{t('totp.storeNote')}</p>
          <button className="secondary-action" onClick={reset} type="button">
            {t('totp.done')}
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="admin-section admin-animate-in">
      <div className="admin-section-header">
        <h2>{t('totp.title')}</h2>
      </div>

      <div className="admin-totp-panel">
        {!enrolment ? (
          <form className="admin-totp-form" onSubmit={start}>
            <p className="text-sm text-neutral-300">{t('totp.intro')}</p>
            <input
              autoComplete="username"
              className="field-input field-input-focus"
              placeholder={t('totp.username')}
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
            <input
              autoComplete="current-password"
              className="field-input field-input-focus"
              placeholder={t('totp.password')}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <p className="text-xs text-neutral-500">{t('totp.passwordNote')}</p>
            <button type="submit" className="primary-action" disabled={busy}>
              {busy ? t('totp.working') : t('totp.showQr')}
            </button>
          </form>
        ) : (
          <form className="admin-totp-form" onSubmit={confirm}>
            <p className="text-sm text-neutral-300">{t('totp.scanIntro')}</p>
            {qrDataUrl ? (
              <img alt={t('totp.qrAlt')} className="admin-totp-qr" src={qrDataUrl} />
            ) : (
              <p className="text-sm text-neutral-400">{t('totp.renderingQr')}</p>
            )}
            <div className="admin-totp-secret">
              <span>{t('totp.manualKey')}</span>
              <code>{enrolment.totpSecret}</code>
            </div>
            {fmt.formatTime(enrolment.expiresAt) && (
              <p className="text-xs text-neutral-500">
                {t('totp.expiresAt', { time: fmt.formatTime(enrolment.expiresAt) })}
              </p>
            )}
            <input
              autoComplete="one-time-code"
              className="field-input field-input-focus"
              inputMode="numeric"
              maxLength={6}
              placeholder={t('auth.code')}
              type="text"
              value={totp}
              onChange={(event) => setTotp(event.target.value)}
              required
            />
            <div className="flex flex-wrap gap-3">
              <button type="submit" className="primary-action" disabled={busy}>
                {busy ? t('totp.checking') : t('totp.confirm')}
              </button>
              <button className="secondary-action" disabled={busy} onClick={reset} type="button">
                {t('common.cancel')}
              </button>
            </div>
          </form>
        )}

        {message && <p className="text-coral text-sm">{message}</p>}
      </div>
    </section>
  )
}

export default AdminTotpEnrolment
