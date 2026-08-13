// Password hashing, extracted from index.js so that anything outside the HTTP
// server -- the admin-user CLI above all -- derives hashes the exact same way.
// A second implementation living in a script is how you end up with an account
// that cannot log in, or worse, one whose hash is weaker than the server's.

import { pbkdf2 as pbkdf2Callback, randomBytes, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const pbkdf2 = promisify(pbkdf2Callback)

// 600k iterations is the current OWASP guidance for PBKDF2-HMAC-SHA256, up from
// 120k. The synchronous variant used before blocked Node's only thread for the
// whole derivation, so raising the count without also going async would have
// turned every concurrent sign-in into a site-wide stall. The iteration count
// lives in the stored hash, so existing 120k records keep verifying.
export const PBKDF2_ITERATIONS = 600000

export const hashPassword = async (password) => {
  const salt = randomBytes(16).toString('hex')
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS, 32, 'sha256')
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${salt}$${hash.toString('hex')}`
}

export const verifyPassword = async (password, storedHash = '') => {
  const [algorithm, iterationsRaw, salt, expected] = storedHash.split('$')
  if (algorithm !== 'pbkdf2_sha256' || !iterationsRaw || !salt || !expected) return false

  const expectedBuffer = Buffer.from(expected, 'hex')
  const actual = await pbkdf2(password, salt, Number(iterationsRaw), expectedBuffer.length, 'sha256')
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer)
}
