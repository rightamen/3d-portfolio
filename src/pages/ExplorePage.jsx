import {resourceTypes,resourceLabels} from '../lib/resources'
import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { isCreatorNumberQuery } from '../../server/creatorNumbers.js'
import { parseResourceNumber } from '../../server/resourceNumbers.js'
import CommunityResourceCard from '../components/CommunityResourceCard'
import CreatorDirectoryCard from '../components/CreatorDirectoryCard'
import SpatialGallery from '../components/SpatialGallery'
import PublishCta from '../components/PublishCta'
import WorkCard from '../components/WorkCard'
import { getCommunityUploads, getCreators, getWorks } from '../lib/api'
import { getApiErrorMessage } from '../lib/i18n'
import { assetCategoryProfiles } from '../lib/assetCategories'
import { assetCategoryLabel } from '../lib/works'

// Browse, search and filter. Flat DOM on purpose -- ADR_PLATFORM_PIVOT §5 puts
// 3D where the subject is three-dimensional or where spatial browsing beats a
// grid, and a results list is neither. The 3D lives one click away, on the work
// itself, and this page loads without touching three.js at all.

// A stable identity for "nothing yet", so a render with no results does not
// invalidate the memo below.
const EMPTY_RESULTS = []

const ExplorePage = ({ authToken, copy, language }) => {
  // The filters live in the URL, not in component state alone: a filtered
  // catalogue is a thing people link to and reload, and losing the filter on
  // refresh is the kind of small betrayal that makes a browse page feel cheap.
  const [view, setView] = useState('grid')
  const [searchParams, setSearchParams] = useSearchParams()
  const category = searchParams.get('category') || ''
  const resourceType=searchParams.get('resourceType') || ''
  const requestedPage = Number(searchParams.get('page') || 1)
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const queryParam = searchParams.get('query') || ''
  const normalizedQuery = queryParam.trim().normalize('NFKC')
  const number = parseResourceNumber(normalizedQuery)
  const creatorOnly = normalizedQuery.startsWith('@') || /^0[0-9]{5}$/.test(normalizedQuery)
  const lookupNumber = !creatorOnly && !category && !resourceType && page === 1 ? number : null
  const creatorQuery = page === 1 && !normalizedQuery.startsWith('#') &&
    (!number || isCreatorNumberQuery(normalizedQuery)) ? queryParam.trim().slice(0, 60) : ''

  // Keep the data keyed by the URL so an older request cannot render under
  // newer search terms or filters.
  const requestKey = JSON.stringify([category, page, queryParam, resourceType])
  const [result, setResult] = useState(null)

  useEffect(() => {
    let isMounted = true

    Promise.allSettled([
      creatorOnly ? null : getWorks({ category, page, query: queryParam, resourceType }),
      lookupNumber ? getCommunityUploads(lookupNumber) : null,
      creatorQuery ? getCreators({ query: creatorQuery, limit: 6 }) : null,
    ]).then(([catalogue, community, people]) => {
      if (!isMounted) return
      setResult({
        key: requestKey,
        catalogue: catalogue.value,
        uploads: community.value?.uploads || EMPTY_RESULTS,
        people: people.value,
        resourceError: catalogue.reason || community.reason,
        creatorError: people.reason,
      })
    })

    return () => {
      isMounted = false
    }
  }, [category, page, queryParam, requestKey, resourceType, lookupNumber, creatorOnly, creatorQuery])

  const data = result?.key === requestKey ? result : null
  const status = data ? 'ready' : 'loading'
  const works = data?.catalogue?.works || EMPTY_RESULTS
  const uploads = data?.uploads || EMPTY_RESULTS
  const creators = data?.people?.creators || EMPTY_RESULTS
  const pagination = data?.catalogue?.pagination
  const resourceError = data?.resourceError
  const creatorError = data?.creatorError
  const showSpatial = !creatorOnly && view === 'spatial' && uploads.length === 0 &&
    (works.length > 0 || !creators.length)
  const showEmpty = data && !resourceError && !creatorError && !showSpatial &&
    !works.length && !uploads.length && !creators.length
  const creatorsUrl = '/creators?' + new URLSearchParams({ q: creatorQuery })

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

      {!creatorOnly && (
        <div className="spatial-browse-toggle" role="group" aria-label={copy.spatialView}>
          <button type="button" aria-pressed={view === 'grid'} onClick={() => setView('grid')}>{copy.spatialGrid}</button>
          <button type="button" aria-pressed={view === 'spatial'} onClick={() => setView('spatial')}>{copy.spatialLabel}</button>
        </div>
      )}
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
        <div className="explore-search-field">
          <input
            defaultValue={queryParam}
            id="explore-search"
            key={queryParam}
            name="query"
            placeholder={copy.exploreSearchPlaceholder}
            type="search"
          />
          <button className="secondary-action" type="submit">{copy.resourceSearchSubmit}</button>
        </div>
        {!creatorOnly && (
          <>
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
            <select aria-label={copy.resourceType} value={resourceType} onChange={e=>updateFilters({resourceType:e.target.value})}><option value="">{copy.resourceAll}</option>{resourceTypes.map(t=><option key={t} value={t}>{resourceLabels(copy)[t]}</option>)}</select>
          </>
        )}
      </form>

      {status === 'loading' && <p className="text-neutral-400">{copy.exploreLoading}</p>}
      {resourceError && (
        <p className="text-coral" role="alert">
          {getApiErrorMessage(resourceError, copy, copy.exploreLoadError)}
        </p>
      )}
      {creatorError && <p className="text-coral" role="alert">{copy.socialError}</p>}
      {creators.length > 0 && (
        <section className="explore-creator-results" aria-labelledby="creator-results-title">
          <header>
            <h2 id="creator-results-title">{copy.socialCreators}</h2>
            {data.people.pagination?.hasNext && (
              <Link className="secondary-action" to={creatorsUrl}>{copy.creatorSearchMore}</Link>
            )}
          </header>
          <div className="creator-directory-grid">
            {creators.map((creator) => (
              <CreatorDirectoryCard key={creator.handle} creator={creator} copy={copy} />
            ))}
          </div>
        </section>
      )}

      {status === 'ready' && works.length > 0 && view === 'grid' && (
        <div className="explore-grid">
          {works.map((work) => (
            <WorkCard copy={copy} key={work.id} language={language} work={work} />
          ))}
        </div>
      )}

      {uploads.length > 0 && (
        <div className="community-grid">
          {uploads.map((upload) => (
            <CommunityResourceCard key={upload.id} upload={upload} authToken={authToken} copy={copy} language={language} />
          ))}
        </div>
      )}

      {showSpatial && <SpatialGallery works={works} status={resourceError ? 'error' : status} copy={copy} language={language} />}

      {showEmpty && (
        <div className="asset-empty-state">
          <strong>{creatorOnly ? copy.socialDirectoryEmpty : copy.exploreEmptyTitle}</strong>
          {!creatorOnly && <span>{copy.exploreEmptyBody}</span>}
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
