import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import SpatialGallery from '../components/SpatialGallery'
import PublishCta from '../components/PublishCta'
import WorkCard from '../components/WorkCard'
import { getWorks } from '../lib/api'
import { getApiErrorMessage } from '../lib/i18n'
import { assetCategoryProfiles } from '../lib/assetCategories'
import { assetCategoryLabel } from '../lib/works'

// Browse, search and filter. Flat DOM on purpose -- ADR_PLATFORM_PIVOT §5 puts
// 3D where the subject is three-dimensional or where spatial browsing beats a
// grid, and a results list is neither. The 3D lives one click away, on the work
// itself, and this page loads without touching three.js at all.

// A stable identity for "nothing yet", so a render with no results does not
// invalidate the memo below.
const EMPTY_WORKS = []

const ExplorePage = ({ authToken, copy, language }) => {
  // The filters live in the URL, not in component state alone: a filtered
  // catalogue is a thing people link to and reload, and losing the filter on
  // refresh is the kind of small betrayal that makes a browse page feel cheap.
  const [view, setView] = useState('grid')
  const [searchParams, setSearchParams] = useSearchParams()
  const category = searchParams.get('category') || ''
  const requestedPage = Number(searchParams.get('page') || 1)
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const queryParam = searchParams.get('query') || ''

  // One key for the whole query. Results are stored WITH the key that produced
  // them, so "still loading" is derived rather than assigned -- which keeps the
  // effect free of a synchronous setState and, more usefully, means a stale
  // result set can never be shown under a filter that did not produce it.
  const requestKey = JSON.stringify([category, page, queryParam])
  const [result, setResult] = useState({ key: '', error: null, pagination: null, status: 'loading', works: [] })

  useEffect(() => {
    let isMounted = true

    getWorks({ category, page, query: queryParam })
      .then((payload) => {
        if (!isMounted) return
        setResult({
          key: requestKey,
          error: null,
          pagination: payload.pagination || null,
          status: 'ready',
          works: payload.works || [],
        })
      })
      .catch((error) => {
        if (!isMounted) return
        setResult({
          key: requestKey,
          error,
          pagination: null,
          status: 'error',
          works: [],
        })
      })

    return () => {
      isMounted = false
    }
  }, [category, page, queryParam, requestKey])

  const status = result.key === requestKey ? result.status : 'loading'
  const works = result.key === requestKey ? result.works : EMPTY_WORKS
  const pagination = status === 'loading' ? null : result.pagination
  // Translate errors at render time; changing language does not fetch the
  // same catalogue again or discard the current results.
  const message = result.error?.code ? getApiErrorMessage(result.error, copy) : copy.exploreLoadError

  // Every filter change resets to page one. Staying on page 4 while narrowing
  // the results to three works is how a browse page shows an empty screen and
  // looks broken.
  const updateFilters = useCallback(
    (changes) => {
      const next = new URLSearchParams(searchParams)
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value)
        else next.delete(key)
      }
      if (!('page' in changes)) next.delete('page')
      setSearchParams(next)
    },
    [searchParams, setSearchParams],
  )

  // Use the same taxonomy as publishing and the homepage. A filtered page
  // cannot tell us which other categories exist, especially when it is empty.
  const categories = assetCategoryProfiles.map((item) => item.value)
  // Preserve a category from an older/shared link so its active filter remains
  // visible and removable, even if it is not in the current taxonomy.
  if (category && !categories.includes(category)) categories.push(category)

  return (
    <main className="explore-page c-space">
      {/* No page-local header any more: the site's top bar is rendered above
          the router, so the way home and the language switch are in the same
          place on every page instead of being re-invented per page. */}
      <header className="explore-header">
        <div>
          <h1 className="text-heading">{copy.exploreTitle}</h1>
          <p className="text-neutral-400">{copy.exploreSubtitle}</p>
        </div>
      </header>

      <div className="spatial-browse-toggle" role="group" aria-label={copy.spatialView}>
        <button type="button" aria-pressed={view === 'grid'} onClick={() => setView('grid')}>{copy.spatialGrid}</button>
        <button type="button" aria-pressed={view === 'spatial'} onClick={() => setView('spatial')}>{copy.spatialLabel}</button>
      </div>
      <PublishCta authToken={authToken} copy={copy} />

      <form
        className="explore-filters"
        onSubmit={(event) => {
          event.preventDefault()
          updateFilters({ query: String(event.target.elements.query.value || '').trim() })
        }}
      >
        <label className="explore-search-label" htmlFor="explore-search">
          {copy.exploreSearchPlaceholder}
        </label>
        {/* Uncontrolled, keyed on the URL's own value: changing the filter
            remounts it with the new default, which is the syncing an effect
            was doing before, without the effect. */}
        <input
          defaultValue={queryParam}
          id="explore-search"
          key={queryParam}
          name="query"
          placeholder={copy.exploreSearchPlaceholder}
          type="search"
        />
        <select
          aria-label={copy.exploreCategoryAll}
          onChange={(event) => updateFilters({ category: event.target.value })}
          value={category}
        >
          <option value="">{copy.exploreCategoryAll}</option>
          {categories.map((item) => (
            <option key={item} value={item}>
              {assetCategoryLabel(item, language)}
            </option>
          ))}
        </select>
      </form>

      {status === 'loading' && <p className="text-neutral-400">{copy.exploreLoading}</p>}
      {status === 'error' && <p className="text-coral">{message}</p>}

      {status === 'ready' && works.length > 0 && view === 'grid' && (
        <div className="explore-grid">
          {works.map((work) => (
            <WorkCard copy={copy} key={work.id} language={language} work={work} />
          ))}
        </div>
      )}

      {view === 'spatial' && <SpatialGallery works={works} status={status} copy={copy} language={language} />}

      {status === 'ready' && works.length === 0 && view === 'grid' && (
        <div className="asset-empty-state">
          <strong>{copy.exploreEmptyTitle}</strong>
          <span>{copy.exploreEmptyBody}</span>
        </div>
      )}

      {status === 'ready' && (pagination?.hasNext || pagination?.hasPrevious) && (
        <nav className="explore-pagination">
          <button
            disabled={!pagination.hasPrevious}
            onClick={() => updateFilters({ page: String(page - 1) })}
            type="button"
          >
            {copy.explorePrevious}
          </button>
          <span>
            {pagination.page} / {pagination.pages}
          </span>
          <button
            disabled={!pagination.hasNext}
            onClick={() => updateFilters({ page: String(page + 1) })}
            type="button"
          >
            {copy.exploreNext}
          </button>
        </nav>
      )}
    </main>
  )
}

export default ExplorePage
