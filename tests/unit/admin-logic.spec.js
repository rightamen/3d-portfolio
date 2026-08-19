import { describe, expect, it } from 'vitest'
import {
  appendKeyword,
  createSlug,
  getExtension,
  getFileExtension,
  listToText,
  needsCommentReview,
  searchInItem,
  textToList,
  toTitle,
} from '../../src/lib/admin/format'
import {
  searchableSections,
  sectionGroupKey,
  sectionGroups,
  sectionLabelKey,
  sections,
  visitorAccessPresets,
  visitorDetailTabs,
} from '../../src/lib/admin/sections'
import { dictionaries } from '../../src/lib/admin/i18nAdmin'
import { niceCeiling, niceScale, percentChange, roundedTopRect } from '../../src/components/admin/charts'
import {
  getTranslationState,
  getTranslationStates,
  isMissingTranslation,
  localizedEditorLanguages,
  matchesTranslationFilter,
} from '../../src/lib/admin/projectEditor'

describe('text helpers', () => {
  it('round-trips a comma list', () => {
    expect(textToList(' a , b ,, c ')).toEqual(['a', 'b', 'c'])
    expect(listToText(['a', 'b'])).toBe('a, b')
    expect(listToText('not an array')).toBe('')
  })

  it('adds a keyword without duplicating one that is already there', () => {
    expect(appendKeyword('pbr, glb', 'realtime')).toBe('pbr, glb, realtime')
    expect(appendKeyword('pbr, glb', 'glb')).toBe('pbr, glb')
  })

  it('makes a slug that is safe in a url and bounded in length', () => {
    expect(createSlug('Next-Gen Prop  #2')).toBe('next-gen-prop-2')
    expect(createSlug('---trim me---')).toBe('trim-me')
    expect(createSlug('x'.repeat(200))).toHaveLength(64)
  })

  it('turns a file name into a title', () => {
    expect(toTitle('next_gen-prop.glb')).toBe('Next Gen Prop')
    // Only the last extension is dropped, and the capitalisation is per word
    // boundary -- so a double extension keeps the first half, title-cased.
    expect(toTitle('a  b.tar.gz')).toBe('A B.Tar')
  })

  it('reads extensions in the two shapes the console needs', () => {
    expect(getExtension('model.GLB')).toBe('GLB')
    expect(getFileExtension('model.GLB')).toBe('.glb')
    expect(getExtension('no-dot')).toBe('NO-DOT')
  })

  it('searches an item without caring about case or field', () => {
    const item = { author: 'Rin Sato', message: 'Looks great' }

    expect(searchInItem(item, 'rin')).toBe(true)
    expect(searchInItem(item, 'GREAT')).toBe(true)
    expect(searchInItem(item, 'nothing')).toBe(false)
    expect(searchInItem(item, '')).toBe(true)
  })

  // Published is the only state a visitor can see; pending and spam are both
  // waiting for a decision, so both belong in the review queue.
  it('counts anything not published as needing review', () => {
    expect(needsCommentReview({ status: 'pending' })).toBe(true)
    expect(needsCommentReview({ status: 'spam' })).toBe(true)
    expect(needsCommentReview({ status: 'published' })).toBe(false)
    expect(needsCommentReview({})).toBe(false)
    expect(needsCommentReview(undefined)).toBe(false)
  })
})

describe('the console navigation', () => {
  it('gives every section a group, and every group its sections in order', () => {
    expect(sections.every((section) => Boolean(section.group))).toBe(true)
    expect(sectionGroups.flatMap((group) => group.items)).toEqual(sections)
    expect(sectionGroups.map((group) => group.name)).toEqual([
      'overview',
      'catalogue',
      'moderation',
      'people',
      'operations',
    ])
  })

  // The label keys are built by string concatenation, so a renamed section
  // produces a missing key rather than a compile error. Round twenty moved this
  // copy into the dictionary; this is the check that it all arrived.
  it('resolves every section and group label in all three languages', () => {
    const missing = []

    for (const code of ['zh', 'en', 'ja']) {
      for (const section of sections) {
        const key = sectionLabelKey(section.key)
        if (dictionaries[code][key] === undefined) missing.push(`${code}: ${key}`)
      }
      for (const group of sectionGroups) {
        const key = sectionGroupKey(group.name)
        if (dictionaries[code][key] === undefined) missing.push(`${code}: ${key}`)
      }
    }

    expect(missing).toEqual([])
  })

  it('only offers search where a section has rows to filter', () => {
    const sectionKeys = new Set(sections.map((section) => section.key))
    const unknown = [...searchableSections].filter((key) => !sectionKeys.has(key))

    expect(unknown).toEqual([])
    expect(searchableSections.has('overview')).toBe(false)
    expect(searchableSections.has('security')).toBe(false)
  })

  it('resolves the member detail tabs and access presets too', () => {
    const missing = []

    for (const code of ['zh', 'en', 'ja']) {
      for (const tab of visitorDetailTabs) {
        if (dictionaries[code][tab.labelKey] === undefined) missing.push(`${code}: ${tab.labelKey}`)
      }
      for (const preset of visitorAccessPresets) {
        if (dictionaries[code][preset.labelKey] === undefined) {
          missing.push(`${code}: ${preset.labelKey}`)
        }
      }
    }

    expect(missing).toEqual([])
  })
})

describe('chart scales', () => {
  it('never puts a tick on half an event', () => {
    for (const max of [0, 1, 2, 3, 7, 13, 50, 99, 1234]) {
      const { ticks } = niceScale(max)
      expect(ticks.every(Number.isInteger), `max=${max} -> ${ticks}`).toBe(true)
    }
  })

  it('keeps a whole-number step through a quiet week', () => {
    expect(niceScale(0).step).toBe(1)
    expect(niceScale(1).ticks).toEqual([0, 1, 2, 3, 4])
  })

  it('reaches at least the value it was given', () => {
    for (const max of [3, 7, 13, 50, 99, 1234]) {
      expect(niceScale(max).top, `max=${max}`).toBeGreaterThanOrEqual(max)
    }
  })

  it('answers 1 for junk rather than NaN or 0', () => {
    expect(niceCeiling(0)).toBe(1)
    expect(niceCeiling(-5)).toBe(1)
    expect(niceCeiling(Number.NaN)).toBe(1)
    expect(niceCeiling(Number.POSITIVE_INFINITY)).toBe(1)
  })
})

describe('percentChange', () => {
  // "Up 100% from zero" is a sentence that means nothing, so the tile prints
  // "new" instead -- which it can only do if this returns null, not Infinity.
  it('returns null when there is no baseline to compare against', () => {
    expect(percentChange(5, 0)).toBeNull()
    expect(percentChange(0, 0)).toBe(0)
  })

  it('rounds to whole percent in both directions', () => {
    expect(percentChange(150, 100)).toBe(50)
    expect(percentChange(50, 100)).toBe(-50)
    expect(percentChange(1, 3)).toBe(-67)
  })

  it('treats junk as zero', () => {
    expect(percentChange(undefined, 100)).toBe(-100)
    expect(percentChange('12', 10)).toBe(20)
  })
})

describe('roundedTopRect', () => {
  it('clamps the radius so a short column cannot invert its own corners', () => {
    const path = roundedTopRect(0, 0, 4, 1, 40)

    expect(path.startsWith('M 0 1')).toBe(true)
    expect(path.endsWith('Z')).toBe(true)
    expect(path).not.toContain('-')
  })

  it('squares the bottom and rounds only the top', () => {
    const path = roundedTopRect(10, 20, 30, 40, 4)

    expect(path).toContain('M 10 60')
    expect(path).toContain('L 40 60')
    expect((path.match(/Q /g) || []).length).toBe(2)
  })
})

describe('project translation state', () => {
  // The bug this encodes: English is the *unsuffixed* field. Treating a missing
  // `titleEn` as incomplete reported "EN fallback" on every project ever
  // written, which taught everyone to ignore the chips entirely.
  const fullEnglish = { summary: 'A prop.', title: 'Prop', workflow: 'ZBrush' }

  it('calls full English copy ready even with no En-suffixed fields', () => {
    expect(getTranslationState(fullEnglish, 'En')).toBe('ready')
    expect(isMissingTranslation(fullEnglish, 'En')).toBe(false)
  })

  it('grades the suffixed languages on their own fields', () => {
    expect(getTranslationState(fullEnglish, 'Ja')).toBe('fallback')
    expect(getTranslationState({ ...fullEnglish, titleJa: '小物' }, 'Ja')).toBe('partial')
    expect(
      getTranslationState(
        { ...fullEnglish, summaryJa: '小物です', titleJa: '小物', workflowJa: 'ZBrush' },
        'Ja',
      ),
    ).toBe('ready')
  })

  it('treats whitespace as empty', () => {
    expect(getTranslationState({ summary: ' ', title: '  ', workflow: '' }, 'En')).toBe('fallback')
  })

  it('reports one state per editor language', () => {
    const states = getTranslationStates(fullEnglish)

    expect(states).toHaveLength(localizedEditorLanguages.length)
    expect(states.every((state) => ['ready', 'partial', 'fallback'].includes(state.state))).toBe(true)
  })

  it('filters the catalogue by what is missing', () => {
    // 'missing-any' walks all three editor languages, Chinese included, so a
    // fixture that only fills in Japanese is still missing something.
    const complete = {
      summary: 'A prop.',
      summaryJa: '小物です',
      summaryZh: '一个小物件。',
      title: 'Prop',
      titleJa: '小物',
      titleZh: '小物件',
      workflow: 'ZBrush',
      workflowJa: 'ZBrush',
      workflowZh: 'ZBrush',
    }

    expect(matchesTranslationFilter(fullEnglish, 'missing-Ja')).toBe(true)
    expect(matchesTranslationFilter(complete, 'missing-Ja')).toBe(false)
    expect(matchesTranslationFilter(complete, 'missing-any')).toBe(false)
    expect(matchesTranslationFilter(fullEnglish, 'missing-any')).toBe(true)
    expect(matchesTranslationFilter(fullEnglish, 'all')).toBe(true)
  })
})
