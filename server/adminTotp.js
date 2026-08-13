// TOTP (RFC 6238) and recovery codes for admin sign-in.
//
// Written against the RFC rather than pulled from npm: this is ~60 lines of
// HMAC and base32, it is verified against the RFC's own test vectors in
// scripts/verify-admin-totp.mjs, and an authentication dependency is exactly
// the kind of package worth not having. SHA-1 / 6 digits / 30s is not a
// preference -- it is what authenticator apps actually implement.
//
// Nothing here touches storage or Express. It is pure so the test can pin the
// clock and the vectors.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export const TOTP_STEP_SECONDS = 30
export const TOTP_DIGITS = 6

export const base32Encode = (buffer) => {
  let bits = 0
  let value = 0
  let output = ''

  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }

  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  return output
}

export const base32Decode = (text) => {
  // Padding and casing vary between apps and between people retyping a secret;
  // neither carries information, so both are normalised away rather than
  // rejected.
  const normalized = String(text).toUpperCase().replace(/=+$/, '').replace(/\s+/g, '')
  let bits = 0
  let value = 0
  const bytes = []

  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character)
    if (index === -1) throw new Error('Invalid base32 character in TOTP secret.')
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }

  return Buffer.from(bytes)
}

// 20 bytes = 160 bits, the size RFC 4226 specifies for HMAC-SHA1 and what
// authenticator apps expect.
export const generateTotpSecret = () => base32Encode(randomBytes(20))

export const totpStepAt = (timeMs, stepSeconds = TOTP_STEP_SECONDS) =>
  Math.floor(timeMs / 1000 / stepSeconds)

export const totpCodeForStep = (secret, step, { digits = TOTP_DIGITS, algorithm = 'sha1' } = {}) => {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))

  const digest = createHmac(algorithm, base32Decode(secret)).update(counter).digest()
  // Dynamic truncation, RFC 4226 §5.3.
  const offset = digest[digest.length - 1] & 0x0f
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff)

  return String(binary % 10 ** digits).padStart(digits, '0')
}

/**
 * Verifies a submitted code.
 *
 * `window` accepts one step either side, because phone and server clocks drift
 * and a user who types a code as it rolls over should not be told they are
 * wrong. `afterStep` is what makes a code single-use: the caller persists the
 * step that succeeded and passes it back, so replaying the same six digits --
 * over someone's shoulder, or out of a proxy log -- inside the same 30 seconds
 * fails. Returns the matched step so the caller can store it.
 */
export const verifyTotp = (secret, submitted, options = {}) => {
  const {
    at = Date.now(),
    window = 1,
    afterStep = 0,
    digits = TOTP_DIGITS,
    stepSeconds = TOTP_STEP_SECONDS,
  } = options

  const code = String(submitted ?? '').replace(/\s+/g, '')
  if (!new RegExp(`^[0-9]{${digits}}$`).test(code)) return { ok: false, step: null }

  const current = totpStepAt(at, stepSeconds)
  for (let offset = -window; offset <= window; offset += 1) {
    const step = current + offset
    if (step <= afterStep) continue

    const expected = totpCodeForStep(secret, step, { digits })
    const expectedBuffer = Buffer.from(expected)
    const codeBuffer = Buffer.from(code)
    if (codeBuffer.length === expectedBuffer.length && timingSafeEqual(codeBuffer, expectedBuffer)) {
      return { ok: true, step }
    }
  }

  return { ok: false, step: null }
}

/**
 * The otpauth:// URL an authenticator app scans. Rendered as a QR code by the
 * CLI; also printed as text, because a secret that can only be transferred by
 * camera is a secret you cannot enrol over SSH.
 */
export const buildOtpAuthUrl = ({ secret, account, issuer = 'mrright.blog' }) => {
  const label = encodeURIComponent(`${issuer}:${account}`)
  const params = new URLSearchParams({
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    issuer,
    period: String(TOTP_STEP_SECONDS),
    secret,
  })
  return `otpauth://totp/${label}?${params.toString()}`
}

// Recovery codes exist for the phone that fell in a lake. They are the reason
// enforcing TOTP is not an invitation to lock yourself out of your own admin
// panel -- and they are stored hashed, one use each, like any other credential.
export const generateRecoveryCodes = (count = 10) =>
  Array.from({ length: count }, () => {
    const raw = base32Encode(randomBytes(10)).slice(0, 16)
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`
  })

export const normalizeRecoveryCode = (code) =>
  String(code ?? '').toUpperCase().replace(/[^A-Z2-7]/g, '')
