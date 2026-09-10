// A creator's own profile content: the long introduction, the highlight cards,
// the toolkit and the timeline.
//
// These blocks existed before, but only for the site owner: they came from
// content.js, were rendered behind an isSiteOwner check, and nobody else had
// them -- or any way to write them. A 300-character bio was the whole of what
// another creator could say about themselves on a site that asks them to sell
// their work.
//
// Single language on purpose. content.js keeps zh/en/ja triples because one
// person maintains them by hand; asking every creator to write their
// introduction three times produces one filled field and two blank ones. What
// they type is what every visitor reads.
//
// Everything here is authored by a stranger, so every field is bounded: a
// length, a count, and a shape. The limits are generous enough to write a real
// profile in and small enough that a profile row cannot become a payload.

export const LIMITS = {
  about: 2000,
  experience: { body: 400, count: 12, period: 40, title: 80 },
  highlights: { body: 240, count: 6, title: 60 },
  skills: { count: 24, length: 40 },
}

// Trim, collapse the runs of whitespace a pasted paragraph arrives with, cut to
// length. Non-strings become '' rather than "null" or "[object Object]", which
// is what String(anything) would happily render into somebody's profile.
const text = (value, max) => {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

// Newlines survive here -- an introduction has paragraphs, and collapsing them
// would run someone's whole biography into a single block. Runs of three or
// more blank lines collapse to one break, so the layout cannot be pushed around
// by a wall of returns.
const paragraphs = (value, max) => {
  if (typeof value !== 'string') return ''
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max)
}

const list = (value) => (Array.isArray(value) ? value : [])

export const normalizeHighlights = (value) =>
  list(value)
    .map((item) => ({
      body: text(item?.body, LIMITS.highlights.body),
      title: text(item?.title, LIMITS.highlights.title),
    }))
    // A card with no title is not a card. Dropping it here rather than
    // rendering an empty box is why the profile cannot be made to show gaps.
    .filter((item) => item.title || item.body)
    .slice(0, LIMITS.highlights.count)

export const normalizeSkills = (value) => {
  const seen = new Set()

  return list(value)
    .map((item) => text(item, LIMITS.skills.length))
    .filter((item) => {
      // Case-insensitive, because "Blender" and "blender" in the same row read
      // as a rendering bug rather than as two tools.
      const key = item.toLowerCase()
      if (!item || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, LIMITS.skills.count)
}

export const normalizeExperience = (value) =>
  list(value)
    .map((item) => ({
      body: text(item?.body, LIMITS.experience.body),
      period: text(item?.period, LIMITS.experience.period),
      title: text(item?.title, LIMITS.experience.title),
    }))
    .filter((item) => item.title || item.body || item.period)
    .slice(0, LIMITS.experience.count)

// The whole block, in the shape the column set stores. Absent keys mean "leave
// this alone" is NOT the rule here: the editor always sends the full set, and
// treating a missing key as "keep" would make deleting the last highlight
// impossible.
export const normalizeCreatorProfileContent = (body) => ({
  about: paragraphs(body?.about, LIMITS.about),
  experience: normalizeExperience(body?.experience),
  highlights: normalizeHighlights(body?.highlights),
  skills: normalizeSkills(body?.skills),
})

// Whether there is anything to render. A profile that has never been filled in
// should show nothing rather than a set of empty headings.
export const hasCreatorProfileContent = (content) =>
  Boolean(
    content &&
      (content.about ||
        content.highlights?.length ||
        content.skills?.length ||
        content.experience?.length),
  )

export default {
  LIMITS,
  hasCreatorProfileContent,
  normalizeCreatorProfileContent,
  normalizeExperience,
  normalizeHighlights,
  normalizeSkills,
}
