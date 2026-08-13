// Pins server/adminTotp.js against RFC 6238's own test vectors.
//
// A hand-written TOTP is only worth having if it is checked against the
// standard rather than against itself: an implementation can be perfectly
// self-consistent -- generate codes, verify its own codes -- and still be
// incompatible with every authenticator app on the planet (wrong counter
// endianness, wrong truncation, wrong base32 alphabet). The RFC vectors are the
// only thing that catches that class of bug before a phone does.
//
// The replay and window assertions cover the parts the RFC does not: that a
// code stops working once it has been used, and that "±1 step" means one step
// and not two.

import {
  base32Decode,
  base32Encode,
  buildOtpAuthUrl,
  generateRecoveryCodes,
  generateTotpSecret,
  normalizeRecoveryCode,
  totpCodeForStep,
  totpStepAt,
  verifyTotp,
} from '../server/adminTotp.js'
import { randomBytes } from 'node:crypto'

const failures = []
const check = (condition, message) => {
  if (!condition) failures.push(message)
}

// 1. base32 round-trips, including the lengths that need padding bits.
for (let length = 1; length <= 32; length += 1) {
  const buffer = randomBytes(length)
  const decoded = base32Decode(base32Encode(buffer))
  check(decoded.equals(buffer), `base32 round-trip failed at ${length} bytes`)
}
check(
  base32Encode(Buffer.from('12345678901234567890')) === 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
  'base32 of the RFC seed does not match the known encoding',
)
check(
  base32Decode('gezdgnbvgy3tqojq gezdgnbvgy3tqojq==').equals(Buffer.from('12345678901234567890')),
  'base32 decoding should tolerate lowercase, spaces and padding',
)
try {
  base32Decode('ABC!')
  check(false, 'base32 should reject characters outside the alphabet')
} catch {
  // expected
}

// 2. RFC 6238 Appendix B, SHA-1 rows. The RFC prints 8-digit codes; the app
// uses 6, which is the same algorithm with a smaller modulus.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'))
const RFC_VECTORS = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
]

for (const [seconds, expected] of RFC_VECTORS) {
  const step = totpStepAt(seconds * 1000)
  const actual = totpCodeForStep(RFC_SECRET, step, { digits: 8 })
  check(actual === expected, `RFC 6238 vector at t=${seconds}: expected ${expected}, got ${actual}`)
}

// 3. Verification: the current code passes, the neighbours pass, two steps out
// does not.
const secret = generateTotpSecret()
const now = Date.now()
const currentStep = totpStepAt(now)

check(verifyTotp(secret, totpCodeForStep(secret, currentStep), { at: now }).ok, 'current code rejected')
check(
  verifyTotp(secret, totpCodeForStep(secret, currentStep - 1), { at: now }).ok,
  'previous step should be accepted (clock skew)',
)
check(
  verifyTotp(secret, totpCodeForStep(secret, currentStep + 1), { at: now }).ok,
  'next step should be accepted (clock skew)',
)
check(
  !verifyTotp(secret, totpCodeForStep(secret, currentStep - 2), { at: now }).ok,
  'two steps back should be rejected',
)
check(
  !verifyTotp(secret, totpCodeForStep(secret, currentStep + 2), { at: now }).ok,
  'two steps forward should be rejected',
)

// 4. Replay. This is the property the database column exists for: the same six
// digits must not work twice inside their own 30-second life.
const first = verifyTotp(secret, totpCodeForStep(secret, currentStep), { at: now })
check(first.ok && first.step === currentStep, 'expected the current step to be reported back')
check(
  !verifyTotp(secret, totpCodeForStep(secret, currentStep), { at: now, afterStep: first.step }).ok,
  'a used code must not verify a second time',
)
check(
  !verifyTotp(secret, totpCodeForStep(secret, currentStep - 1), { at: now, afterStep: first.step }).ok,
  'a code older than the last used step must not verify',
)
check(
  verifyTotp(secret, totpCodeForStep(secret, currentStep + 1), { at: now, afterStep: first.step }).ok,
  'the next step must still verify after a replay is blocked',
)

// 5. Shapes that are not codes.
for (const bad of ['', null, undefined, '12345', '1234567', 'abcdef', '12 34 56', {}]) {
  check(!verifyTotp(secret, bad, { at: now }).ok, `garbage code accepted: ${JSON.stringify(bad)}`)
}
// A code typed with a space in the middle is still that code.
const spaced = totpCodeForStep(secret, currentStep)
check(
  verifyTotp(secret, `${spaced.slice(0, 3)} ${spaced.slice(3)}`, { at: now }).ok,
  'a code with internal whitespace should verify',
)

// 6. Enrolment URL: what the app scans has to carry the secret and the period.
const url = new URL(buildOtpAuthUrl({ secret, account: 'alice' }))
check(url.protocol === 'otpauth:', 'otpauth URL has the wrong scheme')
check(url.searchParams.get('secret') === secret, 'otpauth URL does not carry the secret')
check(url.searchParams.get('period') === '30', 'otpauth URL does not carry the period')
check(url.searchParams.get('issuer') === 'mrright.blog', 'otpauth URL does not carry the issuer')
check(decodeURIComponent(url.pathname).includes('alice'), 'otpauth URL does not carry the account')

// 7. Recovery codes: distinct, and normalisation strips only formatting.
const codes = generateRecoveryCodes(10)
check(codes.length === 10, 'expected 10 recovery codes')
check(new Set(codes).size === 10, 'recovery codes must be distinct')
check(
  codes.every((code) => /^[A-Z2-7]{4}(-[A-Z2-7]{4}){3}$/.test(code)),
  'recovery codes do not match the expected shape',
)
check(
  normalizeRecoveryCode(` ${codes[0].toLowerCase()} `) === codes[0].replace(/-/g, ''),
  'recovery code normalisation should ignore case, spaces and dashes',
)

if (failures.length > 0) {
  console.error('admin TOTP verification failed:')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log('admin TOTP verification passed (RFC 6238 vectors, window, replay, recovery codes).')
