import { afterEach, describe, expect, it } from 'vitest'
import {
  defaultLanguage,
  getAccessLevelLabel,
  getApiErrorMessage,
  getCopy,
  getInitialLanguage,
  languages,
  pickLocalized,
  translateKnownLabel,
} from '../../src/lib/i18n'

const codes = languages.map((language) => language.code)

describe('the three dictionaries', () => {
  it('declares exactly zh, en and ja', () => {
    expect(codes).toEqual(['zh', 'en', 'ja'])
    expect(defaultLanguage).toBe('zh')
  })

  // The site ships three dictionaries maintained by hand. A key added to one
  // and forgotten in the others does not throw -- it renders `undefined` in
  // the other two languages, which is only visible if someone happens to be
  // reading that page in that language.
  it.each(codes)('%s has the same key set as the others', (code) => {
    const reference = new Set(Object.keys(getCopy(defaultLanguage)))
    const subject = new Set(Object.keys(getCopy(code)))

    const missing = [...reference].filter((key) => !subject.has(key))
    const extra = [...subject].filter((key) => !reference.has(key))

    expect({ extra, missing }).toEqual({ extra: [], missing: [] })
  })

  it.each(codes)('%s has no blank strings', (code) => {
    const blank = Object.entries(getCopy(code))
      .filter(([, value]) => typeof value === 'string' && value.trim() === '')
      .map(([key]) => key)

    expect(blank).toEqual([])
  })

  it('falls back to the default language for anything it does not speak', () => {
    expect(getCopy('fr')).toBe(getCopy(defaultLanguage))
    expect(getCopy(undefined)).toBe(getCopy(defaultLanguage))
    expect(getCopy('en')).not.toBe(getCopy(defaultLanguage))
  })
})

describe('getInitialLanguage', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  const withNavigatorLanguage = (value, run) => {
    const descriptor = Object.getOwnPropertyDescriptor(window.navigator, 'language')
    Object.defineProperty(window.navigator, 'language', { configurable: true, value })
    try {
      return run()
    } finally {
      if (descriptor) Object.defineProperty(window.navigator, 'language', descriptor)
    }
  }

  it('prefers a stored choice over the browser', () => {
    window.localStorage.setItem('mrright-language', 'ja')
    expect(withNavigatorLanguage('en-GB', getInitialLanguage)).toBe('ja')
  })

  it('ignores a stored value that is not one of the three', () => {
    window.localStorage.setItem('mrright-language', 'fr')
    expect(withNavigatorLanguage('en-GB', getInitialLanguage)).toBe('en')
  })

  it('reads the browser when nothing is stored', () => {
    expect(withNavigatorLanguage('ja-JP', getInitialLanguage)).toBe('ja')
    expect(withNavigatorLanguage('en-US', getInitialLanguage)).toBe('en')
    expect(withNavigatorLanguage('de-DE', getInitialLanguage)).toBe(defaultLanguage)
  })
})

describe('getApiErrorMessage', () => {
  const labels = getCopy('en')

  it('maps a known code to its label rather than echoing the server', () => {
    const error = new Error('Session expired. Sign in again.')
    error.code = 'AUTH_REQUIRED'

    expect(getApiErrorMessage(error, labels)).toBe(labels.apiErrorAuthRequired)
  })

  it('falls back rather than printing a code the UI does not know', () => {
    const error = new Error('Teapot')
    error.code = 'IM_A_TEAPOT'

    expect(getApiErrorMessage(error, labels)).toBe(labels.authError)
    expect(getApiErrorMessage(error, labels, 'Custom fallback')).toBe('Custom fallback')
  })

  it('survives being handed nothing at all', () => {
    expect(getApiErrorMessage(undefined, labels)).toBe(labels.authError)
  })
})

describe('pickLocalized', () => {
  const project = { summary: 'Fallback', summaryJa: 'ja text', summaryZh: 'zh text' }

  it('picks the suffixed field for the active language', () => {
    expect(pickLocalized(project, 'summary', 'zh')).toBe('zh text')
    expect(pickLocalized(project, 'summary', 'ja')).toBe('ja text')
  })

  it('treats the bare field as the English one', () => {
    expect(pickLocalized(project, 'summary', 'en')).toBe('Fallback')
  })

  it('falls back to the bare field when the translation is empty', () => {
    expect(pickLocalized({ summary: 'Fallback', summaryZh: '' }, 'summary', 'zh')).toBe('Fallback')
  })

  it('accepts a per-language object in the bare field', () => {
    const item = { title: { en: 'English', ja: 'Japanese' } }

    expect(pickLocalized(item, 'title', 'ja')).toBe('Japanese')
    // No zh entry and no zh default: it lands on en rather than on undefined.
    expect(pickLocalized(item, 'title', 'zh')).toBe('English')
  })

  it('returns an empty string instead of throwing on junk', () => {
    expect(pickLocalized(null, 'summary', 'zh')).toBe('')
    expect(pickLocalized({}, 'summary', 'zh')).toBe('')
  })
})

describe('translateKnownLabel', () => {
  it('leaves English alone', () => {
    expect(translateKnownLabel('Approved download', 'en')).toBe('Approved download')
  })

  it('matches a known label regardless of case', () => {
    expect(translateKnownLabel('Approved Download', 'zh')).toBe('授权后下载')
    expect(translateKnownLabel('approved download', 'zh')).toBe('授权后下载')
  })

  it('handles the two generated shapes', () => {
    expect(translateKnownLabel('glb model', 'zh')).toBe('GLB 模型')
    expect(translateKnownLabel('glb model', 'ja')).toBe('GLBモデル')
    expect(translateKnownLabel('png preview image', 'zh')).toBe('PNG 预览图')
  })

  it('returns an unknown label untouched rather than blanking the field', () => {
    expect(translateKnownLabel('Something nobody translated', 'zh')).toBe(
      'Something nobody translated',
    )
    expect(translateKnownLabel('', 'zh')).toBe('')
  })
})

describe('getAccessLevelLabel', () => {
  it.each(codes)('names all three levels in %s', (code) => {
    const labels = getCopy(code)

    expect(getAccessLevelLabel('approved', code)).toBe(labels.accessApproved)
    expect(getAccessLevelLabel('member', code)).toBe(labels.accessMember)
    expect(getAccessLevelLabel('guest', code)).toBe(labels.accessGuest)
  })

  it('treats anything unrecognised as a guest', () => {
    expect(getAccessLevelLabel('vip', 'en')).toBe(getCopy('en').accessGuest)
    expect(getAccessLevelLabel(undefined, 'en')).toBe(getCopy('en').accessGuest)
  })
})
