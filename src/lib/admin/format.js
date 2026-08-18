// Text and file-name helpers shared by the admin sections. These were inline
// in Admin.jsx until it grew past 2,900 lines; nothing here touches React
// state or the display language, so it can be read, tested, and reused on its
// own.

// Dates, sizes, ages and counts now come from createAdminFormatters() in
// lib/admin/i18nAdmin.js, which knows which of the three locales the console
// is speaking. The copies that used to live here were hard-wired to en-US.

export const listToText = (value) => (Array.isArray(value) ? value.join(', ') : '')

export const textToList = (value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

export const appendKeyword = (text, keyword) => {
  const values = new Set(textToList(text))
  values.add(keyword)
  return Array.from(values).join(', ')
}

export const createSlug = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 64)

export const toTitle = (value) =>
  value
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())

export const getExtension = (fileName) => fileName.split('.').pop()?.toUpperCase() || ''

export const getFileExtension = (fileName) => `.${fileName.split('.').pop()?.toLowerCase() || ''}`

export const searchInItem = (item, query) =>
  !query ||
  JSON.stringify(item)
    .toLowerCase()
    .includes(query.toLowerCase())

// Published is the only state a visitor can see. Everything else -- pending
// (author's email is unverified) and spam (caught by the heuristic) -- is
// waiting for someone to say yes or no.
export const needsCommentReview = (comment) =>
  Boolean(comment?.status) && comment.status !== 'published'
