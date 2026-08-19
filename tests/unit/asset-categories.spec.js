import { describe, expect, it } from 'vitest'
import {
  assetCategoryProfiles,
  getAssetCategoryProfile,
  inferAssetCategory,
} from '../../src/lib/assetCategories'

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
