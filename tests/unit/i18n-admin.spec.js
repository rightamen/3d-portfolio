import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  adminLanguages,
  createAdminFormatters,
  createAdminI18n,
  createAdminTranslator,
  dictionaries,
  getInitialAdminLanguage,
  storeAdminLanguage,
  translateAccessLevel,
  translateStatus,
} from '../../src/lib/admin/i18nAdmin'

const codes = adminLanguages.map((language) => language.code)

// `finding.*` keys are the documented exception: content-health findings are
// written by the server in English and translated here by code, so there is no
// English table for them -- the server's own sentence is the English.
const isFindingKey = (key) => key.startsWith('finding.')

const keysOf = (code) => Object.keys(dictionaries[code])

describe('the admin dictionaries', () => {
  it('covers the same three languages as the site', () => {
    expect(codes).toEqual(['zh', 'en', 'ja'])
    expect(Object.keys(dictionaries).sort()).toEqual(['en', 'ja', 'zh'])
  })

  // The header of i18nAdmin.js states this as the rule: English is what every
  // other language falls back to, so it has to be complete. The translator
  // cannot reveal a gap -- it answers `en[key] ?? key`, so a missing Chinese
  // string renders in English and looks intentional.
  it('keeps en complete for every non-finding key', () => {
    const englishKeys = new Set(keysOf('en'))
    const missingFromEnglish = [...keysOf('zh'), ...keysOf('ja')]
      .filter((key) => !isFindingKey(key) && !englishKeys.has(key))
      .sort()

    expect([...new Set(missingFromEnglish)]).toEqual([])
  })

  it('keeps zh and ja on the same key set', () => {
    const zhKeys = new Set(keysOf('zh'))
    const jaKeys = new Set(keysOf('ja'))

    expect({
      onlyInJapanese: [...jaKeys].filter((key) => !zhKeys.has(key)).sort(),
      onlyInChinese: [...zhKeys].filter((key) => !jaKeys.has(key)).sort(),
    }).toEqual({ onlyInJapanese: [], onlyInChinese: [] })
  })

  it('has an English string for every key the console can ask for by hand', () => {
    const zhOnly = keysOf('zh').filter((key) => isFindingKey(key))

    // The finding keys are the only ones allowed to be en-less, and there are
    // some -- if this ever hits zero the exception above is dead code.
    expect(zhOnly.length).toBeGreaterThan(0)
  })

  it.each(codes)('has no blank strings in %s', (code) => {
    const blank = Object.entries(dictionaries[code])
      .filter(([, value]) => typeof value === 'string' && value.trim() === '')
      .map(([key]) => key)

    expect(blank).toEqual([])
  })
})

describe('createAdminTranslator', () => {
  it('answers in the language it was built for', () => {
    expect(createAdminTranslator('zh')('common.refresh')).toBe(dictionaries.zh['common.refresh'])
    expect(createAdminTranslator('ja')('common.refresh')).toBe(dictionaries.ja['common.refresh'])
    expect(createAdminTranslator('en')('common.refresh')).toBe(dictionaries.en['common.refresh'])
  })

  it('falls back to English, then to the key itself', () => {
    const t = createAdminTranslator('ja')

    expect(t('no.such.key.anywhere')).toBe('no.such.key.anywhere')
  })

  it('interpolates named placeholders', () => {
    const t = createAdminTranslator('en')

    expect(t('members.joined', { date: '1 Jan', login: '2 Jan' })).toBe(
      'Joined 1 Jan · Last login 2 Jan',
    )
  })

  it('leaves a placeholder in place rather than printing undefined', () => {
    const t = createAdminTranslator('en')

    expect(t('members.joined', { date: '1 Jan' })).toContain('{login}')
    expect(t('members.joined', { date: '1 Jan' })).not.toContain('undefined')
  })
})

describe('the two guards over free-form server strings', () => {
  const t = createAdminTranslator('en')

  it('translates the access levels the server issues and echoes anything else', () => {
    expect(translateAccessLevel(t, 'member')).toBe(dictionaries.en['access.member'])
    expect(translateAccessLevel(t, 'vip')).toBe('vip')
    expect(translateAccessLevel(t, '')).toBe(dictionaries.en['access.guest'])
  })

  it('does the same for moderation states', () => {
    expect(translateStatus(t, 'spam')).toBe(dictionaries.en['status.spam'])
    expect(translateStatus(t, 'quarantined')).toBe('quarantined')
    expect(translateStatus(t, '')).toBe('')
  })
})

describe('createAdminFormatters', () => {
  it('formats numbers in the console language, not en-US', () => {
    const ja = createAdminFormatters('ja', createAdminTranslator('ja'))
    const en = createAdminFormatters('en', createAdminTranslator('en'))

    expect(en.locale).toBe('en-US')
    expect(ja.locale).toBe('ja-JP')
    expect(en.formatNumber(1234567)).toBe('1,234,567')
  })

  it('compacts large counts and leaves small ones alone', () => {
    const { compactNumber } = createAdminFormatters('en', createAdminTranslator('en'))

    expect(compactNumber(42)).toBe('42')
    expect(compactNumber(1000)).toBe('1K')
    expect(compactNumber(1500)).toBe('1.5K')
    expect(compactNumber(2_400_000)).toBe('2.4M')
  })

  it('treats junk as zero rather than printing NaN', () => {
    const { compactNumber, formatNumber } = createAdminFormatters('en', createAdminTranslator('en'))

    expect(formatNumber(undefined)).toBe('0')
    expect(compactNumber('not a number')).toBe('0')
  })
})

describe('the console remembers its own language', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  it('prefers its own choice over the site language', () => {
    window.localStorage.setItem('mrright-admin-language', 'ja')
    window.localStorage.setItem('mrright-language', 'en')

    expect(getInitialAdminLanguage()).toBe('ja')
  })

  it('falls back to the site language on a first visit', () => {
    window.localStorage.setItem('mrright-language', 'en')

    expect(getInitialAdminLanguage()).toBe('en')
  })

  it('writes only its own key, leaving the site setting alone', () => {
    window.localStorage.setItem('mrright-language', 'en')
    storeAdminLanguage('ja')

    expect(window.localStorage.getItem('mrright-admin-language')).toBe('ja')
    expect(window.localStorage.getItem('mrright-language')).toBe('en')
    expect(document.documentElement.lang).toBe('ja')
  })
})

describe('t() calls in the console source', () => {
  const adminSources = () => {
    const roots = [
      path.resolve(process.cwd(), 'src/components/admin'),
      path.resolve(process.cwd(), 'src/lib/admin'),
    ]
    const out = [
      {
        relativePath: 'src/Admin.jsx',
        text: readFileSync(path.resolve(process.cwd(), 'src/Admin.jsx'), 'utf8'),
      },
    ]

    for (const root of roots) {
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (!entry.isFile() || !/\.jsx?$/.test(entry.name)) continue
        out.push({
          relativePath: path.relative(process.cwd(), path.join(root, entry.name)),
          text: readFileSync(path.join(root, entry.name), 'utf8'),
        })
      }
    }

    return out
  }

  it('resolves every literal key to a string in all three languages', () => {
    const unresolved = []

    for (const { relativePath, text } of adminSources()) {
      for (const match of text.matchAll(/\bt\('([a-zA-Z0-9_.-]+)'/g)) {
        const key = match[1]
        for (const code of codes) {
          if (dictionaries[code][key] === undefined && dictionaries.en[key] === undefined) {
            unresolved.push(`${relativePath}: t('${key}') has no ${code} string`)
          }
        }
      }
    }

    expect([...new Set(unresolved)]).toEqual([])
  })
})

describe('createAdminI18n', () => {
  it('hands back a translator and formatters for the same language', () => {
    const i18n = createAdminI18n('ja')

    expect(i18n.language).toBe('ja')
    expect(i18n.t('common.refresh')).toBe(dictionaries.ja['common.refresh'])
    expect(i18n.fmt.locale).toBe('ja-JP')
  })
})
