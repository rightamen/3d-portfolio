// The two letters that stand in for a missing avatar.
//
// This body existed three times -- account page, public profile, account menu --
// character for character, differing only in what the second argument was
// called. Three copies of a rule is three chances for one of them to be the odd
// one out, and an avatar that renders differently on two pages of the same site
// reads as a bug rather than a fallback.
//
// Takes the candidates in preference order: a display name first, then whatever
// identifier the caller has (a handle, an email), then a last resort.
export const initials = (...values) => {
  const source = String(values.find((value) => String(value || '').trim()) || '?').trim()
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

export default initials
