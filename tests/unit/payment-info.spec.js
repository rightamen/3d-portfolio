import { describe, expect, it } from 'vitest'

import {
  acceptsPayment,
  normalizePaymentInfo,
  platformFeeBasisPoints,
  readStoredPaymentInfo,
} from '../../server/paymentInfo.js'

// The platform never touches this money. Everything below is about what a
// buyer is shown and what a creator is allowed to put in front of them.

describe('normalizePaymentInfo', () => {
  it('accepts a method with instructions and no code, or a code and no instructions', () => {
    expect(
      normalizePaymentInfo({ methods: [{ instructions: 'Send the exact amount.', label: 'Alipay' }] })
        .errors,
    ).toEqual([])
    expect(
      normalizePaymentInfo({
        methods: [{ label: 'WeChat', qrUrl: '/uploads/images/code.png' }],
      }).errors,
    ).toEqual([])
  })

  it('refuses a method that tells a buyer nothing', () => {
    // An order the buyer cannot act on is worse than no order.
    expect(normalizePaymentInfo({ methods: [{ label: 'Vibes' }] }).errors[0]).toContain(
      'instructions or a payment code',
    )
  })

  it('refuses a nameless method', () => {
    expect(
      normalizePaymentInfo({ methods: [{ instructions: 'Just send it.' }] }).errors[0],
    ).toContain('needs a name')
  })

  it('refuses a payment code hosted anywhere but here', () => {
    // An external URL puts a creator's payment code on somebody else's host,
    // and lets a creator point buyers at any image on the internet.
    for (const qrUrl of [
      'https://example.com/code.png',
      '//example.com/code.png',
      '/etc/passwd',
      '/uploads/models/code.glb',
      '/uploads/images/../../secret.png',
    ]) {
      expect(
        normalizePaymentInfo({ methods: [{ label: 'Alipay', qrUrl }] }).errors.join(' '),
        qrUrl,
      ).toContain('uploaded here')
    }
  })

  it('treats an empty list as valid -- that is how selling is turned off', () => {
    const { errors, paymentInfo } = normalizePaymentInfo({ methods: [] })
    expect(errors).toEqual([])
    expect(paymentInfo.methods).toEqual([])
  })

  it('caps how many methods one creator can list', () => {
    const methods = Array.from({ length: 9 }, (_, index) => ({
      instructions: 'x',
      label: `Method ${index}`,
    }))
    expect(normalizePaymentInfo({ methods }).errors[0]).toContain('At most')
  })

  it('is not fooled by a non-object', () => {
    for (const input of [null, undefined, 'alipay', 42, []]) {
      expect(normalizePaymentInfo(input).paymentInfo.methods).toEqual([])
    }
  })
})

describe('readStoredPaymentInfo', () => {
  it('drops a stored value nobody should be shown', () => {
    // The column is jsonb and a psql session is not an impossible event; what
    // reaches a buyer's screen has to be something this module produced.
    expect(
      readStoredPaymentInfo({ methods: [{ label: 'Alipay', qrUrl: 'javascript:alert(1)' }] })
        .methods,
    ).toEqual([])
    expect(readStoredPaymentInfo(null).methods).toEqual([])
  })
})

describe('acceptsPayment', () => {
  it('is the public half: whether, never how', () => {
    expect(acceptsPayment({ methods: [{ instructions: 'x', label: 'Alipay' }] })).toBe(true)
    expect(acceptsPayment({ methods: [] })).toBe(false)
    // A method that would be rejected does not make a creator payable.
    expect(acceptsPayment({ methods: [{ label: 'Vibes' }] })).toBe(false)
  })
})

describe('platformFeeBasisPoints', () => {
  it('is zero for direct, whatever anyone configured', () => {
    // The rule this function exists for: the platform cannot take a share of
    // money that never passes through it. The next provider is the one likely
    // to break it, by wiring a percentage in without noticing which orders it
    // reaches.
    for (const configured of [1000, 10000, '2500', Infinity, -5]) {
      expect(platformFeeBasisPoints('direct', configured), String(configured)).toBe(0)
    }
  })

  it('passes a configured share through for a provider that does hold the money', () => {
    expect(platformFeeBasisPoints('stripe', 1000)).toBe(1000)
    expect(platformFeeBasisPoints('stripe', '250')).toBe(250)
  })

  it('clamps rather than trusting', () => {
    expect(platformFeeBasisPoints('stripe', 99999)).toBe(10000)
    expect(platformFeeBasisPoints('stripe', -1)).toBe(0)
    expect(platformFeeBasisPoints('stripe', 'nonsense')).toBe(0)
    expect(platformFeeBasisPoints('stripe', undefined)).toBe(0)
  })
})
