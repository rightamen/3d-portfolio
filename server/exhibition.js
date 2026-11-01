// Shared by the public gallery and its server-side admission query.
export const EXHIBITION_MIN_SCORE = 90
export const COMMUNITY_MIN_AVERAGE = 4.5
export const COMMUNITY_MIN_RECOMMENDATIONS = 10

export const exhibitionSources = (work) => ({
  curator: work?.status === 'published' && work.curation?.recommended === true &&
    Number.isInteger(work.curation?.score) && work.curation.score >= EXHIBITION_MIN_SCORE && work.curation.score <= 100,
  community: work?.status === 'published' && Number.isFinite(work.ratings?.average) &&
    work.ratings.average >= COMMUNITY_MIN_AVERAGE && work.ratings.average <= 5 &&
    work.ratings.count >= COMMUNITY_MIN_RECOMMENDATIONS &&
    work.ratings.recommendations >= COMMUNITY_MIN_RECOMMENDATIONS,
})

export const isExhibitionEligible = (work) =>
  Object.values(exhibitionSources(work)).some(Boolean)

export const isContentVersion = (version) =>
  Number.isSafeInteger(version) && version >= 1 && version <= 2147483647

export const readCuration = (body) => {
  if (!body || !Object.hasOwn(body, 'score') || typeof body.recommended !== 'boolean') {
    return { error: 'A score and a recommendation decision are required.' }
  }
  if (!isContentVersion(body.version)) return { error: 'The reviewed content version is required.' }
  const score = body.score
  if (score !== null && (!Number.isInteger(score) || score < 0 || score > 100)) {
    return { error: 'Score must be an integer from 0 to 100, or null.' }
  }
  if (body.recommended && (score === null || score < EXHIBITION_MIN_SCORE)) {
    return { error: 'Exhibition recommendation requires a score of at least 90/100.' }
  }
  return { value: { score, recommended: body.recommended, version: body.version } }
}
