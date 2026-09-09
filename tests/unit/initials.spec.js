import { describe, expect, it } from 'vitest'

import { initials } from '../../src/lib/initials.js'

// This helper is now the single source for four avatar fallbacks -- the account
// page, the public profile, the account menu and every work tile. It was three
// copies before, which is three chances for one of them to be the odd one out.
describe('initials', () => {
  it('takes the first letter of each of the first two words', () => {
    expect(initials('Ada Lovelace')).toBe('AL')
  })

  it('takes two letters from a single word rather than one', () => {
    expect(initials('mrright')).toBe('MR')
  })

  it('ignores the extra words -- two letters, not five', () => {
    expect(initials('one two three four five')).toBe('OT')
  })

  it('is not fooled by the runs of whitespace a pasted name arrives with', () => {
    expect(initials('  Ada   Lovelace  ')).toBe('AL')
  })

  it('falls through to the next candidate when the first is empty', () => {
    expect(initials('', 'mrright')).toBe('MR')
  })

  it('falls through when the first is whitespace, not just empty', () => {
    expect(initials('   ', 'mrright')).toBe('MR')
  })

  it('prefers the first candidate when it has something in it', () => {
    expect(initials('Ada', 'mrright')).toBe('AD')
  })

  it('answers with a placeholder rather than an empty circle when it has nothing', () => {
    expect(initials()).toBe('?')
    expect(initials('', '')).toBe('?')
    expect(initials(null, undefined)).toBe('?')
  })

  it('upper-cases, so a lower-case handle does not render differently to a name', () => {
    expect(initials('ada lovelace')).toBe('AL')
  })

  it('survives a name that is one character long', () => {
    expect(initials('A')).toBe('A')
  })
})
