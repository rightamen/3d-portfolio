// Display helpers shared by the admin sections. These were inline in Admin.jsx
// until it grew past 2,900 lines; nothing here touches React state, so it can
// be read, tested, and reused on its own.

export const formatDate = (value) => {
  if (!value) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export const formatFileSize = (size) => {
  if (!Number.isFinite(size) || size <= 0) return ''
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`
  return `${(size / 1024 / 1024).toFixed(size > 20 * 1024 * 1024 ? 0 : 1)} MB`
}

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
