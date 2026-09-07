// Shared reading of a work object, kept out of the component files so both
// pages and the card agree on what a title and a price are.

// A work carries four columns per field. Which one a visitor reads follows the
// language they picked, falling back to the base column rather than to an
// empty string: a missing Japanese title should show the English one, not
// nothing.
export const localizedWorkField = (work, field, language) => {
  const suffix = { en: 'En', ja: 'Ja', zh: 'Zh' }[language]
  return (suffix && work[`${field}${suffix}`]) || work[field] || ''
}

// Integer cents with the currency beside them, which is how the API sends it.
// Zero is a price -- free -- not a missing value.
export const formatWorkPrice = (work, copy) =>
  work.priceCents > 0
    ? `${(work.priceCents / 100).toFixed(2)} ${String(work.currency || 'usd').toUpperCase()}`
    : copy.exploreFree
