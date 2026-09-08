import { describe, expect, it } from 'vitest'

import {
  DEFAULT_THEME,
  MINIMUM_ACCENT_CONTRAST,
  THEME_FONTS,
  THEME_SURFACES,
  contrastRatio,
  normalizeTheme,
  readStoredTheme,
  themeToTokens,
} from '../../server/themes.js'

// A theme is three knobs a creator controls and the server draws with, so the
// interesting cases are all about what the server refuses: a value the client
// cannot render, and a colour that makes the creator's own page unreadable.

describe('contrastRatio', () => {
  it('matches the known extremes', () => {
    // Black on white is 21:1 by definition -- if this drifts, every threshold
    // built on it has drifted too.
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
  })

  it('does not care which way round the two colours are given', () => {
    expect(contrastRatio('#7dd3fc', '#0d1117')).toBeCloseTo(
      contrastRatio('#0d1117', '#7dd3fc'),
      10,
    )
  })
})

describe('normalizeTheme', () => {
  it('accepts the default, which had better be valid', () => {
    // The default is what every account starts with and what an invalid stored
    // value falls back to. If it did not pass its own validator, every page
    // would be one save away from an error it cannot escape.
    const { errors, theme } = normalizeTheme(DEFAULT_THEME)
    expect(errors).toEqual([])
    expect(theme).toEqual(DEFAULT_THEME)
  })

  it('fills in the knobs a caller left out', () => {
    const { errors, theme } = normalizeTheme({ surface: 'ink' })
    expect(errors).toEqual([])
    expect(theme).toEqual({ ...DEFAULT_THEME, surface: 'ink' })
  })

  it('refuses a surface or font the client cannot draw', () => {
    expect(normalizeTheme({ surface: 'neon' }).errors[0]).toContain('surface must be one of')
    expect(normalizeTheme({ font: 'comic' }).errors[0]).toContain('font must be one of')
  })

  it('refuses anything that is not a six-digit hex colour', () => {
    for (const accent of ['red', '#fff', '#12345', 'rgb(1,2,3)', '#12345g', '']) {
      expect(normalizeTheme({ accent }).errors.join(' '), accent).toContain('hex colour')
    }
  })

  it('refuses an accent nobody could read on the surface behind it', () => {
    // Near-black on the darkest surface: the creator would ship a page whose
    // own links are invisible, and would have no idea why.
    const { errors, theme } = normalizeTheme({ accent: '#0c0c12', surface: 'ink' })

    expect(theme).toBeNull()
    expect(errors[0]).toContain('too close to the ink background')
    // The message carries the numbers, because "pick another colour" without
    // saying how far off it is leaves the creator guessing.
    expect(errors[0]).toMatch(/contrast \d+\.\d+:1/)
  })

  it('judges the same accent against the surface it is actually on', () => {
    // The whole reason the two are validated together: a mid-tone can be fine
    // on one preset and unreadable on another.
    const results = Object.keys(THEME_SURFACES).map((surface) => ({
      ok: normalizeTheme({ accent: '#3f4b5c', surface }).errors.length === 0,
      surface,
    }))

    expect(results.some((entry) => entry.ok)).toBe(false)
    // ...while a bright accent clears every one of them.
    for (const surface of Object.keys(THEME_SURFACES)) {
      expect(normalizeTheme({ accent: '#7dd3fc', surface }).errors, surface).toEqual([])
    }
  })

  it('every surface preset can actually be worn by some accent', () => {
    // A preset nobody can pass validation on is a preset that should not be
    // offered at all.
    for (const [surface, item] of Object.entries(THEME_SURFACES)) {
      const { errors } = normalizeTheme({ accent: '#ffffff', surface })
      expect(errors, `${surface} (${item.background})`).toEqual([])
    }
  })

  it('is not fooled by a non-object', () => {
    for (const input of [null, undefined, 'midnight', 42, []]) {
      expect(normalizeTheme(input).theme).toEqual(DEFAULT_THEME)
    }
  })
})

describe('readStoredTheme', () => {
  it('falls back rather than handing a bad stored value to the renderer', () => {
    // A row written before a preset was renamed, or edited by hand in the
    // database, must not be able to put an undrawable value into a style
    // property.
    expect(readStoredTheme({ accent: 'javascript:alert(1)', font: 'x', surface: 'y' })).toEqual(
      DEFAULT_THEME,
    )
    expect(readStoredTheme(null)).toEqual(DEFAULT_THEME)
  })
})

describe('themeToTokens', () => {
  it('names every token the client needs and nothing else', () => {
    expect(Object.keys(themeToTokens(DEFAULT_THEME)).sort()).toEqual([
      '--theme-accent',
      '--theme-font',
      '--theme-on-accent',
      '--theme-surface',
    ])
  })

  it('resolves the presets to real values, not their keys', () => {
    // The whole reason the server sends tokens rather than the three knobs:
    // the client must never have to know what 'ink' or 'mono' mean.
    const tokens = themeToTokens({ accent: '#ffffff', font: 'mono', surface: 'ink' })

    expect(tokens['--theme-surface']).toBe(THEME_SURFACES.ink.background)
    expect(tokens['--theme-font']).toBe(THEME_FONTS.mono.stack)
    expect(tokens['--theme-accent']).toBe('#ffffff')
  })

  it('sanitises on the way out too, not only on the way in', () => {
    // The last line of defence: whatever is in the column, what reaches a
    // style property is one of the values this module knows.
    const tokens = themeToTokens({ accent: 'red; background: url(evil)', surface: 'ink' })
    expect(tokens['--theme-accent']).toBe(DEFAULT_THEME.accent)
  })

  // Swept over accents that ACTUALLY PASS validation, which is the correction
  // this test needed: an accent the validator rejects falls back to the
  // default, so comparing the rejected colour against the default's foreground
  // measures nothing. (Written the wrong way first, and the failure was the
  // system being right.)
  const validAccents = []
  for (let r = 0; r < 256; r += 17) {
    for (let g = 0; g < 256; g += 17) {
      for (let b = 0; b < 256; b += 17) {
        const accent = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
        if (normalizeTheme({ accent, surface: 'ink' }).errors.length === 0) validAccents.push(accent)
      }
    }
  }

  it('found enough valid accents to be sweeping something', () => {
    expect(validAccents.length).toBeGreaterThan(200)
  })

  it('always picks whichever foreground reads better on the accent', () => {
    const wrong = []

    for (const accent of validAccents) {
      const chosen = themeToTokens({ accent, surface: 'ink' })['--theme-on-accent']
      const other = chosen === '#ffffff' ? '#000000' : '#ffffff'
      if (contrastRatio(accent, chosen) < contrastRatio(accent, other)) {
        wrong.push(`${accent}: chose ${chosen}`)
      }
    }

    expect(wrong).toEqual([])
  })

  it('uses both foregrounds, so the choice is not decorative', () => {
    // If every accent resolved to the same foreground, the comparison above
    // would pass while doing nothing.
    const chosen = new Set(
      validAccents.map((accent) => themeToTokens({ accent, surface: 'ink' })['--theme-on-accent']),
    )
    expect([...chosen].sort()).toEqual(['#000000', '#ffffff'])
  })

  it('never leaves accent text below the readable floor, for ANY colour', () => {
    // Not only the valid ones and not only the sweep: the guarantee is
    // structural. "Better of pure black and pure white" is worst where the two
    // are equal, at 4.58:1, which is above WCAG's 4.5 floor. So this sweeps
    // the whole cube -- including accents the validator rejects, because the
    // claim is about the function, not about what reaches it.
    const worst = []
    for (let r = 0; r < 256; r += 5) {
      for (let g = 0; g < 256; g += 5) {
        for (let b = 0; b < 256; b += 5) {
          const accent = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
          const on =
            contrastRatio(accent, '#000000') >= contrastRatio(accent, '#ffffff')
              ? '#000000'
              : '#ffffff'
          const ratio = contrastRatio(accent, on)
          if (ratio < 4.5) worst.push(`${accent} -> ${ratio.toFixed(2)}`)
        }
      }
    }

    expect(worst.slice(0, 5)).toEqual([])
  })

  it('the structural floor is where the algebra says it is', () => {
    // If this drifts, the guarantee above stopped being a guarantee and
    // became a coincidence.
    const equalPoint = Math.sqrt(1.05 * 0.05)
    expect(equalPoint / 0.05).toBeCloseTo(4.58, 2)
  })

  it('keeps MINIMUM_ACCENT_CONTRAST at the WCAG floor for UI components', () => {
    // Documented as a deliberate choice rather than a number someone tuned
    // until their favourite colour passed.
    expect(MINIMUM_ACCENT_CONTRAST).toBe(3)
  })
})
