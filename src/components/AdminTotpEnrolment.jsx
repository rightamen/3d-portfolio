import { useState } from 'react'

import { confirmAdminTotpEnrolment, startAdminTotpEnrolment } from '../lib/api'

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

const formatExpiry = (isoString) => {
  const expiresAt = new Date(isoString)
  return Number.isNaN(expiresAt.valueOf())
    ? null
    : expiresAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const AdminTotpEnrolment = ({ signedInUsername, token }) => {
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
      if (!next?.otpauthUrl) throw new Error('The server did not return an enrolment.')

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
      setMessage(error?.message || 'Could not start the enrolment.')
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
      setMessage(error?.message || 'Could not confirm the code.')
    } finally {
      setBusy(false)
    }
  }

  if (recoveryCodes) {
    return (
      <section className="admin-section">
        <div className="admin-section-header">
          <h2>Authenticator Updated</h2>
        </div>
        <div className="admin-totp-panel">
          <p className="text-sm text-neutral-300">
            The new authenticator is live and the old one no longer works. These recovery codes
            replace any previous set — each one signs in once, and they are shown only now.
          </p>
          <ul className="admin-totp-codes">
            {recoveryCodes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
          <p className="text-sm text-neutral-400">
            Store them somewhere that is not the phone you just enrolled. They are the way back in
            when that phone is gone.
          </p>
          <button type="button" className="secondary-action" onClick={reset}>
            Done
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <h2>Authenticator</h2>
      </div>

      <div className="admin-totp-panel">
        {!enrolment ? (
          <form className="admin-totp-form" onSubmit={start}>
            <p className="text-sm text-neutral-300">
              Enrol a new authenticator app — after a new phone, a wipe, or a lost device. The
              current one keeps working until you finish, so an interrupted enrolment changes
              nothing.
            </p>
            <input
              autoComplete="username"
              className="field-input field-input-focus"
              placeholder="Admin username"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
            <input
              autoComplete="current-password"
              className="field-input field-input-focus"
              placeholder="Account password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <p className="text-xs text-neutral-500">
              The password is required even though you are already signed in: a session opened with
              the shared token belongs to nobody in particular, and one of those must not be able to
              move a named account&rsquo;s second factor.
            </p>
            <button type="submit" className="primary-action" disabled={busy}>
              {busy ? 'Working...' : 'Show QR code'}
            </button>
          </form>
        ) : (
          <form className="admin-totp-form" onSubmit={confirm}>
            <p className="text-sm text-neutral-300">
              Scan this with your authenticator app, then enter the six digits it shows.
            </p>
            {qrDataUrl ? (
              <img className="admin-totp-qr" src={qrDataUrl} alt="Authenticator QR code" />
            ) : (
              <p className="text-sm text-neutral-400">Rendering the QR code...</p>
            )}
            <div className="admin-totp-secret">
              <span>Or enter this key by hand</span>
              <code>{enrolment.totpSecret}</code>
            </div>
            {formatExpiry(enrolment.expiresAt) && (
              <p className="text-xs text-neutral-500">
                This code expires at {formatExpiry(enrolment.expiresAt)}. After that, start again.
              </p>
            )}
            <input
              autoComplete="one-time-code"
              className="field-input field-input-focus"
              inputMode="numeric"
              maxLength={6}
              placeholder="6-digit code"
              type="text"
              value={totp}
              onChange={(event) => setTotp(event.target.value)}
              required
            />
            <div className="flex flex-wrap gap-3">
              <button type="submit" className="primary-action" disabled={busy}>
                {busy ? 'Checking...' : 'Confirm and switch'}
              </button>
              <button type="button" className="secondary-action" onClick={reset} disabled={busy}>
                Cancel
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
