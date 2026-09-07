import { describe, expect, it } from 'vitest'
import {
  assetCategoryProfiles,
  getAssetCategoryProfile,
  inferAssetCategory,
} from '../../src/lib/assetCategories'
import { assetCategoryLabel } from '../../src/lib/works'

const values = assetCategoryProfiles.map((profile) => profile.value)

describe('the category profiles', () => {
  it('are unique, and end with the catch-all', () => {
    expect(new Set(values).size).toBe(values.length)
    expect(values.at(-1)).toBe('generic')
  })

  it('carry all three languages for every label', () => {
    const gaps = []

    for (const profile of assetCategoryProfiles) {
      for (const code of ['zh', 'en', 'ja']) {
        for (const field of ['descriptions', 'labels', 'shortLabels']) {
          if (!profile[field]?.[code]) gaps.push(`${profile.value}.${field}.${code}`)
        }
      }
    }

    expect(gaps).toEqual([])
  })
})

describe('inferAssetCategory', () => {
  it('trusts an explicit category that it recognises', () => {
    expect(inferAssetCategory({ assetCategory: 'next-gen-scene' })).toBe('next-gen-scene')
  })

  it('maps the one legacy value rather than falling through to keywords', () => {
    expect(inferAssetCategory({ assetCategory: 'hand-painted' })).toBe('hand-painted-character')
  })

  it('ignores an explicit category nobody defined and reads the project instead', () => {
    expect(inferAssetCategory({ assetCategory: 'sculpture', title: 'Forest Scene' })).toBe(
      'next-gen-scene',
    )
  })

  // Order matters: 'hand-painted environment' has to land on the scene profile,
  // not on the character one that also matches 'hand-painted'.
  it('prefers the more specific hand-painted rule', () => {
    expect(inferAssetCategory({ title: 'Hand Painted Environment' })).toBe('hand-painted-scene')
    expect(inferAssetCategory({ title: 'Hand Painted Hero' })).toBe('hand-painted-character')
  })

  it('reads format, stack and viewer features, not just the title', () => {
    expect(inferAssetCategory({ format: 'FBX' })).toBe('next-gen-prop')
    expect(inferAssetCategory({ stack: ['Substance', 'PBR'] })).toBe('next-gen-prop')
    expect(inferAssetCategory({ viewerFeatures: ['character rig'] })).toBe('next-gen-character')
  })

  it('falls back to generic when nothing matches', () => {
    expect(inferAssetCategory({})).toBe('generic')
    expect(inferAssetCategory()).toBe('generic')
    expect(inferAssetCategory({ title: 'Untitled' })).toBe('generic')
  })
})

describe('getAssetCategoryProfile', () => {
  it('returns the labels for the language it was asked for', () => {
    const en = getAssetCategoryProfile({ assetCategory: 'next-gen-prop' }, 'en')
    const ja = getAssetCategoryProfile({ assetCategory: 'next-gen-prop' }, 'ja')

    expect(en.label).toBe('Next-Gen Props')
    expect(en.shortLabel).toBe('Props')
    expect(ja.label).toBe('次世代小物')
  })

  it('defaults to Chinese, matching the site default', () => {
    expect(getAssetCategoryProfile({ assetCategory: 'next-gen-prop' }).label).toBe('次世代道具')
  })

  it('keeps the accent and value alongside the localised text', () => {
    const profile = getAssetCategoryProfile({ assetCategory: 'next-gen-prop' }, 'en')

    expect(profile.value).toBe('next-gen-prop')
    expect(profile.accent).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('never returns undefined labels for an unknown project', () => {
    const profile = getAssetCategoryProfile({}, 'ja')

    expect(profile.value).toBe('generic')
    expect(profile.label).toBeTruthy()
    expect(profile.shortLabel).toBeTruthy()
    expect(profile.description).toBeTruthy()
  })
})

// The work card shows a category, and the stored value is a slug. Every
// profile has carried a short label in all three languages since long before
// works existed, so the card should never be showing 'hand-painted-scene' to
// anybody -- which it was, until this helper.
describe('assetCategoryLabel', () => {
  it('translates every category the catalogue can store', () => {
    const untranslated = []

    for (const profile of assetCategoryProfiles) {
      for (const language of ['zh', 'en', 'ja']) {
        const label = assetCategoryLabel(profile.value, language)
        // The slug coming back means no label was found for it.
        if (!label || label === profile.value) untranslated.push(`${language}: ${profile.value}`)
      }
    }

    expect(untranslated).toEqual([])
  })

  it('gives each language a different label, rather than English three times', () => {
    // A guard against the helper silently falling through to the English
    // branch: that would pass the test above while showing English to
    // everybody.
    const sample = assetCategoryProfiles[0].value
    expect(assetCategoryLabel(sample, 'zh')).not.toBe(assetCategoryLabel(sample, 'en'))
    expect(assetCategoryLabel(sample, 'ja')).not.toBe(assetCategoryLabel(sample, 'en'))
  })

  it('falls back to the raw value for a category it does not know', () => {
    // Better than an empty cell: a slug at least says what the row holds.
    expect(assetCategoryLabel('not-a-real-category', 'zh')).toBe('not-a-real-category')
    expect(assetCategoryLabel('', 'zh')).toBe('')
    expect(assetCategoryLabel(undefined, 'zh')).toBe('')
  })
})
