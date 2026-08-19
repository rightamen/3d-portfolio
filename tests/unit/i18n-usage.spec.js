import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getCopy } from '../../src/lib/i18n'

// Static analysis over the public site's source, answering two questions the
// type-free dictionary cannot answer on its own:
//
//   1. does every `copy.someKey` in the code exist in the dictionary?
//      (a typo renders `undefined` -- silently, and only in the one place)
//   2. does every dictionary key get rendered by something?
//
// Round twenty-one left `npm run verify:visitor-studio` red over exactly this:
// it demanded `accountStudioUploadNow` appear in AccountPage.jsx, and nobody
// could say whether the script was stale or the button had been deleted. It
// was neither -- the key was never wired to anything, in any commit.

// process.cwd(), not import.meta.url: under the jsdom environment vitest
// rewrites import.meta.url to an http:// URL and fileURLToPath rejects it.
const srcDir = path.resolve(process.cwd(), 'src')

// The console has its own dictionary and its own accessor (`t`), and it also
// happens to use a *local* variable called `copy` in AdminDashboard. Scanning
// it here would report `copy.icon` as a missing site key.
const isAdminPath = (relativePath) =>
  relativePath === 'Admin.jsx' ||
  relativePath.startsWith('components/admin/') ||
  relativePath.startsWith('lib/admin/')

const collect = (dir, prefix = '') => {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...collect(path.join(dir, entry.name), relativePath))
    else if (/\.jsx?$/.test(entry.name) && !isAdminPath(relativePath)) {
      out.push({ relativePath, text: readFileSync(path.join(dir, entry.name), 'utf8') })
    }
  }
  return out
}

const files = collect(srcDir)
const corpus = files.map((file) => file.text).join('\n')
const dictionaryKeys = Object.keys(getCopy('zh'))

// `copy[`communityTopic${...}`]` and friends: the prefixes are read out of the
// code rather than listed here, so adding one does not need a test edit.
const dynamicPrefixes = [...new Set([...corpus.matchAll(/\bcopy\[`([A-Za-z0-9_]+)\$\{/g)].map((m) => m[1]))]

describe('site dictionary keys referenced from the code', () => {
  it('found the source to scan', () => {
    expect(files.length).toBeGreaterThan(20)
    expect(dictionaryKeys.length).toBeGreaterThan(400)
  })

  it('reads the dynamic prefixes out of the code instead of guessing', () => {
    expect(dynamicPrefixes.sort()).toEqual([
      'accountContact',
      'accountStudioStatus',
      'communityEntry',
      'communityTopic',
    ])
  })

  it('resolves every copy.<key> reference to a real key', () => {
    const referenced = new Map()

    for (const { relativePath, text } of files) {
      for (const match of text.matchAll(/\bcopy(?:\.([A-Za-z0-9_]+)|\['([A-Za-z0-9_]+)'\])/g)) {
        const key = match[1] || match[2]
        if (!referenced.has(key)) referenced.set(key, relativePath)
      }
    }

    const unresolved = [...referenced]
      .filter(([key]) => !dictionaryKeys.includes(key))
      .map(([key, where]) => `${where}: copy.${key}`)

    expect(unresolved).toEqual([])
  })
})

// Every key is written three times, once per dictionary. Anything appearing
// only those three times is a string nothing renders.
//
// All seventeen below were written alongside a feature and never wired to a
// component -- checked with `git log -S` across src/pages, src/components and
// src/sections, which finds no commit where any of them was referenced. They
// are kept, not deleted, because they are translated product copy and that is
// the maintainer's call; the point of pinning the list is that the eighteenth
// one fails this test on the day it is added.
const knownUnusedKeys = [
  'accountCenterIntro',
  'accountCenterTitle',
  'accountDeleteTitle',
  'accountOverviewIntro',
  'accountOverviewTitle',
  'accountReloginAction',
  'accountSessionExpired',
  'accountSessionExpiredTitle',
  'accountStudioKicker',
  'accountStudioOpen',
  'accountStudioUploadNow',
  'authFlowReset',
  'authHaveAccount',
  'authNeedAccount',
  'authResetSuccess',
  'commentStatusPending',
  'commentStatusSpam',
]

describe('dictionary keys nothing renders', () => {
  const countOccurrences = (key) => (corpus.match(new RegExp(`\\b${key}\\b`, 'g')) || []).length

  const unused = dictionaryKeys
    .filter((key) => countOccurrences(key) <= 3)
    .filter((key) => !dynamicPrefixes.some((prefix) => key !== prefix && key.startsWith(prefix)))
    .sort()

  it('matches the pinned list exactly', () => {
    expect(unused).toEqual(knownUnusedKeys)
  })

  it('still defines each pinned key in all three languages', () => {
    for (const key of knownUnusedKeys) {
      for (const code of ['zh', 'en', 'ja']) {
        expect(getCopy(code)[key], `${code}.${key}`).toBeTruthy()
      }
    }
  })
})
