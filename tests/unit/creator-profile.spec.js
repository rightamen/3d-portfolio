import { describe, expect, it } from 'vitest'

import {
  LIMITS,
  hasCreatorProfileContent,
  normalizeCreatorProfileContent,
  normalizeExperience,
  normalizeHighlights,
  normalizeSkills,
} from '../../server/creatorProfile.js'

// Every field here is written by a stranger and rendered on a public page, so
// the tests are mostly about what a hostile or careless input cannot do: not
// exceed a length, not multiply into a hundred rows, not render as "undefined",
// and not turn a missing value into a visible empty box.

describe('normalizeCreatorProfileContent', () => {
  it('keeps paragraph breaks in the introduction', () => {
    const { about } = normalizeCreatorProfileContent({ about: 'First line.\n\nSecond line.' })
    // Collapsing these would run somebody's whole biography into one block.
    expect(about).toBe('First line.\n\nSecond line.')
  })

  it('collapses a wall of blank lines rather than letting it push the layout', () => {
    const { about } = normalizeCreatorProfileContent({ about: 'One.\n\n\n\n\n\n\nTwo.' })
    expect(about).toBe('One.\n\nTwo.')
  })

  it('cuts the introduction to its limit', () => {
    const { about } = normalizeCreatorProfileContent({ about: 'x'.repeat(5000) })
    expect(about).toHaveLength(LIMITS.about)
  })

  it('returns empty strings and empty arrays for a body with nothing in it', () => {
    expect(normalizeCreatorProfileContent({})).toEqual({
      about: '',
      experience: [],
      highlights: [],
      skills: [],
    })
    expect(normalizeCreatorProfileContent(undefined)).toEqual({
      about: '',
      experience: [],
      highlights: [],
      skills: [],
    })
  })

  it('never renders a non-string as text', () => {
    // String(null) is "null" and String({}) is "[object Object]"; either would
    // appear verbatim on a public profile.
    const result = normalizeCreatorProfileContent({
      about: { toString: () => 'nope' },
      highlights: [{ body: null, title: 42 }],
      skills: [null, undefined, {}, 7],
    })
    expect(result.about).toBe('')
    expect(result.highlights).toEqual([])
    expect(result.skills).toEqual([])
  })
})

describe('normalizeHighlights', () => {
  it('drops an entry with neither a title nor a body instead of rendering an empty card', () => {
    expect(normalizeHighlights([{ body: '  ', title: '' }, { title: 'Real' }])).toEqual([
      { body: '', title: 'Real' },
    ])
  })

  it('caps the number of cards', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ body: 'b', title: `t${i}` }))
    expect(normalizeHighlights(many)).toHaveLength(LIMITS.highlights.count)
  })

  it('caps each field, so one card cannot be an essay', () => {
    const [card] = normalizeHighlights([{ body: 'b'.repeat(999), title: 't'.repeat(999) }])
    expect(card.title).toHaveLength(LIMITS.highlights.title)
    expect(card.body).toHaveLength(LIMITS.highlights.body)
  })

  it('collapses whitespace, so a pasted card does not arrive with its line breaks', () => {
    expect(normalizeHighlights([{ title: '  Form\n\n  language  ' }])[0].title).toBe('Form language')
  })

  it('is not fooled by a non-array', () => {
    expect(normalizeHighlights('nope')).toEqual([])
    expect(normalizeHighlights(null)).toEqual([])
    expect(normalizeHighlights({ 0: { title: 'x' } })).toEqual([])
  })
})

describe('normalizeSkills', () => {
  it('drops duplicates case-insensitively', () => {
    // "Blender" beside "blender" reads as a rendering bug, not as two tools.
    expect(normalizeSkills(['Blender', 'blender', 'BLENDER', 'Maya'])).toEqual(['Blender', 'Maya'])
  })

  it('keeps the first spelling of a duplicate', () => {
    expect(normalizeSkills(['ZBrush', 'zbrush'])).toEqual(['ZBrush'])
  })

  it('drops blanks rather than rendering empty pills', () => {
    expect(normalizeSkills(['Maya', '', '   ', null])).toEqual(['Maya'])
  })

  it('caps the count and each entry', () => {
    const many = Array.from({ length: 100 }, (_, i) => `tool-${i}`)
    expect(normalizeSkills(many)).toHaveLength(LIMITS.skills.count)
    expect(normalizeSkills(['x'.repeat(200)])[0]).toHaveLength(LIMITS.skills.length)
  })
})

describe('normalizeExperience', () => {
  it('keeps the order it was given, which is the order the creator arranged', () => {
    const entries = normalizeExperience([
      { period: '2025 - now', title: 'Independent' },
      { period: '2023 - 2025', title: 'Studio' },
    ])
    expect(entries.map((e) => e.title)).toEqual(['Independent', 'Studio'])
  })

  it('keeps an entry that has only a period and a title', () => {
    expect(normalizeExperience([{ period: '2025', title: 'Independent' }])).toEqual([
      { body: '', period: '2025', title: 'Independent' },
    ])
  })

  it('drops an entirely empty entry, which is what an unfilled new row is', () => {
    expect(normalizeExperience([{ body: '', period: '', title: '' }])).toEqual([])
  })

  it('caps the count and every field', () => {
    const many = Array.from({ length: 50 }, () => ({ body: 'b'.repeat(999), period: 'p'.repeat(99), title: 't'.repeat(999) }))
    const result = normalizeExperience(many)
    expect(result).toHaveLength(LIMITS.experience.count)
    expect(result[0].period).toHaveLength(LIMITS.experience.period)
    expect(result[0].title).toHaveLength(LIMITS.experience.title)
    expect(result[0].body).toHaveLength(LIMITS.experience.body)
  })
})

describe('hasCreatorProfileContent', () => {
  it('is false for a profile nobody has filled in', () => {
    // The whole point: an untouched profile shows nothing, not a column of
    // empty headings.
    expect(hasCreatorProfileContent(normalizeCreatorProfileContent({}))).toBe(false)
    expect(hasCreatorProfileContent(null)).toBe(false)
    expect(hasCreatorProfileContent(undefined)).toBe(false)
  })

  it('is true as soon as any one part has something in it', () => {
    expect(hasCreatorProfileContent({ about: 'hello' })).toBe(true)
    expect(hasCreatorProfileContent({ highlights: [{ title: 'x' }] })).toBe(true)
    expect(hasCreatorProfileContent({ skills: ['Maya'] })).toBe(true)
    expect(hasCreatorProfileContent({ experience: [{ title: 'x' }] })).toBe(true)
  })

  it('is false when the parts are present but empty', () => {
    expect(hasCreatorProfileContent({ about: '', experience: [], highlights: [], skills: [] })).toBe(
      false,
    )
  })
})
