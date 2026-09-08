// How a creator gets paid.
//
// The platform does not touch the money. A buyer pays the creator directly --
// an Alipay or WeChat code, a bank transfer -- and the CREATOR confirms
// receipt, because they are the only one who can see it arrive. That decision
// is what keeps this buildable with no company and no payment licence, and it
// is recorded in docs/adr/ADR_PLATFORM_PIVOT.md §6.
//
// The consequence worth being honest about: the platform is facilitating a
// transaction it cannot verify. An operator can still settle an order as a
// backstop for disputes, but nobody here can prove a payment happened.

const MAX_METHODS = 4

// A QR code must be a file this server stores. An external URL would put the
// availability of a creator's payment code on somebody else's host, and would
// let a creator point buyers at any image on the internet.
const QR_PATH_PATTERN = /^\/uploads\/images\/[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/

export const EMPTY_PAYMENT_INFO = Object.freeze({ methods: [] })

/**
 * Validates payment info from a request body. Returns { errors, paymentInfo }.
 *
 * An empty methods list is valid and means "not selling yet" -- that is how a
 * creator turns purchasing back off.
 */
export const normalizePaymentInfo = (input) => {
  const errors = []
  const source = input && typeof input === 'object' ? input : {}
  const rawMethods = Array.isArray(source.methods) ? source.methods : []

  if (rawMethods.length > MAX_METHODS) {
    errors.push(`At most ${MAX_METHODS} payment methods.`)
    return { errors, paymentInfo: null }
  }

  const methods = []
  for (const [index, raw] of rawMethods.entries()) {
    const entry = raw && typeof raw === 'object' ? raw : {}
    const label = String(entry.label ?? '').trim().slice(0, 40)
    const instructions = String(entry.instructions ?? '').trim().slice(0, 400)
    const qrUrl = String(entry.qrUrl ?? '').trim()

    if (!label) {
      errors.push(`Method ${index + 1} needs a name, such as Alipay or WeChat.`)
      continue
    }
    // A method with neither instructions nor a code tells a buyer nothing, and
    // an order they cannot act on is worse than no order.
    if (!instructions && !qrUrl) {
      errors.push(`${label} needs instructions or a payment code.`)
      continue
    }
    if (qrUrl && !QR_PATH_PATTERN.test(qrUrl)) {
      errors.push(`${label}'s payment code must be an image uploaded here.`)
      continue
    }

    methods.push({ instructions, label, qrUrl })
  }

  if (errors.length) return { errors, paymentInfo: null }
  return { errors, paymentInfo: { methods } }
}

// Stored values are read back through this too: the column is jsonb, and what
// reaches a buyer's screen has to be something this module produced.
export const readStoredPaymentInfo = (value) => {
  const { paymentInfo } = normalizePaymentInfo(value)
  return paymentInfo || { ...EMPTY_PAYMENT_INFO, methods: [] }
}

// Whether this creator can be paid at all. Public -- the work page needs it to
// decide between a buy button and "not selling yet" -- while the methods
// themselves are not, because a payment code on a public page is a payment
// code anyone can scrape and reuse in a scam.
export const acceptsPayment = (value) => readStoredPaymentInfo(value).methods.length > 0

/**
 * What share of a sale the platform keeps, in basis points.
 *
 * Zero for `direct`, unconditionally: the platform never receives that money,
 * so a fee on it would be a number nobody can collect and a creator's payout
 * figure that does not match what arrived in their account.
 *
 * This exists as a named function rather than a line inside createOrder
 * because it is a RULE, and the next provider is the one likely to break it:
 * wiring a percentage in without noticing which orders it reaches is exactly
 * the mistake worth making impossible.
 */
export const platformFeeBasisPoints = (provider, configured) => {
  if (provider === 'direct') return 0
  const value = Number(configured)
  if (!Number.isFinite(value)) return 0
  return Math.min(10000, Math.max(0, Math.round(value)))
}
