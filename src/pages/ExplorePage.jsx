import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import PublishCta from '../components/PublishCta'
import WorkCard from '../components/WorkCard'
import { getWorks } from '../lib/api'
import { getApiErrorMessage } from '../lib/i18n'

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
  const [searchParams, setSearchParams] = useSearchParams()
  const category = searchParams.get('category') || ''
  const page = Math.max(1, Number(searchParams.get('page') || 1))
  const queryParam = searchParams.get('query') || ''

  // One key for the whole query. Results are stored WITH the key that produced
  // them, so "still loading" is derived rather than assigned -- which keeps the
  // effect free of a synchronous setState and, more usefully, means a stale
  // result set can never be shown under a filter that did not produce it.
  const requestKey = `${category}|${page}|${queryParam}`
  const [result, setResult] = useState({ key: '', message: '', pagination: null, status: 'loading', works: [] })

  useEffect(() => {
    let isMounted = true

    getWorks({ category, page, query: queryParam })
      .then((payload) => {
        if (!isMounted) return
        setResult({
          key: requestKey,
          message: '',
          pagination: payload.pagination || null,
          status: 'ready',
          works: payload.works || [],
        })
      })
      .catch((error) => {
        if (!isMounted) return
        setResult({
          key: requestKey,
          message: error.code ? getApiErrorMessage(error, copy) : copy.exploreLoadError,
          pagination: null,
          status: 'error',
          works: [],
        })
      })

    return () => {
      isMounted = false
    }
  }, [category, copy, page, queryParam, requestKey])

  const status = result.key === requestKey ? result.status : 'loading'
  // Memoised so `categories` below does not see a new array identity on every
  // render. The empty case is a module-level constant for the same reason.
  const works = useMemo(
    () => (result.key === requestKey ? result.works : EMPTY_WORKS),
    [requestKey, result.key, result.works],
  )
  const pagination = status === 'loading' ? null : result.pagination
  const message = result.message

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

  // Built from what actually came back rather than from a hardcoded list, so a
  // category nobody has used does not sit in the filter offering zero results.
  const categories = useMemo(
    () => [...new Set(works.map((work) => work.assetCategory).filter(Boolean))].sort(),
    [works],
  )

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
          {/* The current filter stays listed even when this page of results no
              longer contains it, or selecting it would blank the control. */}
          {[...new Set([...categories, category].filter(Boolean))].sort().map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </form>

      {status === 'loading' && <p className="text-neutral-400">{copy.exploreLoading}</p>}
      {status === 'error' && <p className="text-coral">{message}</p>}

      {status === 'ready' && works.length > 0 && (
        <div className="explore-grid">
          {works.map((work) => (
            <WorkCard copy={copy} key={work.id} language={language} work={work} />
          ))}
        </div>
      )}

      {status === 'ready' && works.length === 0 && (
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
