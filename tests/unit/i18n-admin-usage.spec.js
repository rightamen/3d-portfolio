import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { dictionaries } from '../../src/lib/admin/i18nAdmin'
import { sectionGroupKey, sectionLabelKey, sections } from '../../src/lib/admin/sections'

// The companion to i18n-usage.spec.js, for the console.
//
// That test deliberately skips admin paths -- the console has its own
// dictionary and its own accessor -- so the console has had no equivalent
// guard. Which matters: on 2026-09-07 and -08 the site's version caught two
// real bugs by complaining about strings nothing rendered, and both times the
// unused string was a symptom rather than the problem. The console has been
// running without that.
//
// Same two questions, asked of `t(...)` instead of `copy.x`:
//   1. does every key the code asks for exist in the dictionary?
//   2. does every dictionary key get rendered by something?

// The whole of src/, not just the admin folders.
//
// Two things made a narrower scan wrong, and both were found by running it:
// AdminTotpEnrolment.jsx lives in src/components/ rather than
// src/components/admin/, and its two dozen keys looked unused; and the console
// passes keys around as VALUES -- deleteItem('entity.project', ...),
// { labelKey: 'tab.posts' } -- so a scan that only reads `t('...')` misses
// them. A console key mentioned anywhere in src/ is a console key that is
// referenced, which is the question this file can actually answer.
// The dictionary's own entry lines are stripped, and that is the whole test.
//
// Scanning them made every key "mentioned" by its own definition, so the
// check below passed while proving nothing -- found by adding a key nothing
// renders and watching it go green. Excluding the whole FILE was the first
// fix and was also wrong: i18nAdmin.js holds the formatters as well, and they
// are the only consumers of the fourteen `time.*` keys.
const DICTIONARY_ENTRY = /^\s*'[^']+':\s/
const readSource = (absolute, relative) => {
  const text = readFileSync(absolute, 'utf8')
  if (relative !== 'lib/admin/i18nAdmin.js') return text

  return text
    .split('\n')
    .filter((line) => !DICTIONARY_ENTRY.test(line))
    .join('\n')
}

const sourceFiles = () => {
  const out = []
  const walk = (dir, prefix = '') => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(path.join(dir, entry.name), relative)
      else if (/\.jsx?$/.test(entry.name)) {
        out.push({ relative, text: readSource(path.join(dir, entry.name), relative) })
      }
    }
  }

  // process.cwd(), not import.meta.url: under jsdom the module URL is not a
  // file: URL and fileURLToPath rejects it.
  walk(path.resolve(process.cwd(), 'src'))
  return out
}

const files = sourceFiles()
const corpus = files.map((file) => file.text).join('\n')

// Every quoted string in the console's own source. Looser than matching
// `t('x')` on purpose -- see the note on sourceFiles -- and looser in the
// other direction too: a key named only in a comment would count as used.
// That is the honest limit of a static scan over a codebase that treats keys
// as data, and it still answers the question that matters: is this string
// mentioned anywhere at all, or was it left behind?
const literalKeys = new Set(
  [...corpus.matchAll(/'([A-Za-z][A-Za-z0-9_:.-]*\.[A-Za-z0-9_:.-]+)'/g)]
    .map((match) => match[1])
    .concat([...corpus.matchAll(/"([A-Za-z][A-Za-z0-9_:.-]*\.[A-Za-z0-9_:.-]+)"/g)].map((m) => m[1])),
)

// `t(`status.${...}`)` and friends. Read out of the code rather than listed
// here, so adding a family does not need a test edit -- the same trick the
// site's version uses.
const dynamicPrefixes = [
  ...new Set([...corpus.matchAll(/\bt\(`([A-Za-z0-9_.-]+)\$\{/g)].map((match) => match[1])),
]

// Built by helpers rather than written down, so they are enumerated from the
// nav itself: a section added without its label would otherwise look "used".
const derivedKeys = new Set([
  ...sections.map((section) => sectionLabelKey(section.key)),
  ...sections.map((section) => sectionGroupKey(section.group)),
])

const dictionaryKeys = Object.keys(dictionaries.zh)

const isCovered = (key) =>
  literalKeys.has(key) ||
  derivedKeys.has(key) ||
  dynamicPrefixes.some((prefix) => key.startsWith(prefix))

describe('admin dictionary keys referenced from the console', () => {
  it('found the source to scan', () => {
    // A guard on everything below: if the walk stops finding files, the rest
    // of this passes by testing nothing.
    expect(files.length).toBeGreaterThan(30)
    expect(literalKeys.size).toBeGreaterThan(200)
    expect(dictionaryKeys.length).toBeGreaterThan(300)
  })

  it('does not count a key\'s own definition as a use of it', () => {
    // Without this the corpus contains every key's own definition, every key
    // counts as mentioned, and the check below is decoration. The file is
    // still read -- its formatters are the only users of the time.* keys --
    // but its entry lines are not.
    const dictionary = files.find((file) => file.relative === 'lib/admin/i18nAdmin.js')
    expect(dictionary).toBeTruthy()
    expect(dictionary.text).not.toContain("'time.justNow':")
    expect(dictionary.text).toContain("t('time.justNow')")
  })

  it('reads the dynamic prefixes out of the code instead of guessing', () => {
    // Listed so a new family is a visible change rather than a silent
    // widening of what counts as "used".
    expect(dynamicPrefixes.sort()).toEqual([
      'access.',
      'finding.',
      'orders.actor.',
      'orders.event.',
      'preset.',
      'status.',
      'translation.',
    ])
  })

  it('renders every key it defines', () => {
    const unused = dictionaryKeys.filter((key) => !isCovered(key)).sort()

    // A key nothing renders is either a feature that was never wired up or a
    // string left behind by one that was removed. Both are worth knowing
    // about; neither is worth carrying.
    expect(unused).toEqual([])
  })
})
