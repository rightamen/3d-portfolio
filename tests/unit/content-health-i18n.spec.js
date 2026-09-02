import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { dictionaries } from '../../src/lib/admin/i18nAdmin.js'

// Round twenty says the admin console is trilingual. It was not, in one corner:
// the content-health findings whose sentences have a path, a format name or a
// byte count baked into them could not be looked up in a dictionary, so they
// stayed English while everything around them was translated (open item 6b).
//
// Round thirty split those into a translatable template plus `values`. This
// test is what stops the two halves drifting apart again, in both directions:
//
//   1. every finding the server can emit has a Chinese and a Japanese entry
//   2. every placeholder a dictionary entry uses is a value the server sends
//
// It reads server/contentHealth.js as text on purpose. Importing it would only
// give the findings a particular fixture happens to trigger, and the ones that
// go untranslated are exactly the rare ones nobody's fixture produces.
// Resolved from the vitest root rather than import.meta.url: under jsdom the
// module URL is not a file: URL.
const source = readFileSync(path.resolve('server/contentHealth.js'), 'utf8')

// `${kind}-not-built` and friends: the template is a real code once expanded,
// and the expansions are enumerated here rather than guessed.
const templateExpansions = {
  '${kind}-not-built': ['image-not-built', 'model-not-built'],
  '${kind}-not-in-upload-store': ['image-not-in-upload-store', 'model-not-in-upload-store'],
  'translation-missing-${suffix}': [
    'translation-missing-Zh',
    'translation-missing-En',
    'translation-missing-Ja',
  ],
}

// One entry per finding literal in the source: its code(s), and which value
// names it hands to the translator.
const findings = []
for (const match of source.matchAll(/code:\s*(?:'([a-z0-9-]+)'|`([^`]+)`)([\s\S]{0,900}?)\n\s{4,}\}/g)) {
  const [, literal, template, body] = match
  const codes = literal ? [literal] : templateExpansions[template]
  expect(codes, `unrecognised code template: ${template}`).toBeTruthy()

  const values = body.match(/values:\s*\{([^}]*)\}/)
  const valueNames = values
    ? [...values[1].matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:/g)].map((entry) => entry[1])
    : []

  for (const code of codes) findings.push({ code, valueNames })
}

const findingKeys = (dictionary) =>
  Object.keys(dictionary).filter((key) => key.startsWith('finding.'))

// finding.<code>.<field> and finding.<code>.<severity>.<field> both exist; this
// only needs the code back out of either shape.
const codeOf = (key) => {
  const parts = key.slice('finding.'.length).split('.')
  return parts.slice(0, parts.length - (['critical', 'warning', 'note'].includes(parts.at(-2)) ? 2 : 1))
    .join('.')
}

describe('content-health findings are translated', () => {
  it('found the findings in the source at all', () => {
    // A guard on the parsing above: if the shape of contentHealth.js changes
    // enough that this stops matching, the rest of this file would pass by
    // vacuously testing nothing.
    expect(findings.length).toBeGreaterThan(15)
    expect(findings.some((finding) => finding.valueNames.length > 0)).toBe(true)
  })

  it('gives every finding a Chinese and a Japanese entry', () => {
    const missing = []

    for (const { code } of findings) {
      for (const language of ['zh', 'ja']) {
        const keys = findingKeys(dictionaries[language])
        if (!keys.some((key) => codeOf(key) === code)) missing.push(`${language}: ${code}`)
      }
    }

    expect(missing).toEqual([])
  })

  it('keeps the Chinese and Japanese dictionaries in step with each other', () => {
    expect(findingKeys(dictionaries.ja).sort()).toEqual(findingKeys(dictionaries.zh).sort())
  })

  // The half that catches the more embarrassing failure: a translation that
  // reads perfectly but renders "{url}" to the operator because the server
  // never sent that value.
  it('only uses placeholders the server actually sends', () => {
    const valuesByCode = new Map(findings.map(({ code, valueNames }) => [code, valueNames]))
    const unsatisfied = []

    for (const language of ['zh', 'ja']) {
      for (const key of findingKeys(dictionaries[language])) {
        const placeholders = [...dictionaries[language][key].matchAll(/\{(\w+)\}/g)].map(
          (match) => match[1],
        )
        const available = valuesByCode.get(codeOf(key)) || []

        for (const placeholder of placeholders) {
          if (!available.includes(placeholder)) unsatisfied.push(`${language}: ${key} -> {${placeholder}}`)
        }
      }
    }

    expect(unsatisfied).toEqual([])
  })
})
