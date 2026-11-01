import { useEffect, useRef, useState } from 'react'
import InfiniteWorks from './InfiniteWorks'
import WorkCard from './WorkCard'
import { getWorks } from '../lib/api'
import { assetCategoryProfiles } from '../lib/assetCategories'

// Filters query the creator's complete public catalogue, not only the first
// loaded page. Panning reuses those rows and never issues catalogue requests.
const CreatorWorksGallery = ({ handle, copy, language, onTotal }) => {
  const [category, setCategory] = useState('')
  const [view, setView] = useState('infinite')
  const [retry, setRetry] = useState(0)
  const [page, setPage] = useState(1)
  const [catalogue, setCatalogue] = useState({ items: [], total: 0, hasNext: false, status: 'loading' })
  const inFlight = useRef(false)

  useEffect(() => {
    let current = true
    inFlight.current = true
    getWorks({ creator: handle, category, page, limit: 24 })
      .then(payload => {
        if (!current) return
        const items = payload.works || []
        const total = payload.pagination?.total ?? items.length
        setCatalogue(previous => ({
          items: page === 1 ? items : [...new Map([...previous.items, ...items].map(work => [work.id, work])).values()],
          total,
          hasNext: payload.pagination?.hasNext === true,
          status: 'ready',
        }))
        if (!category) onTotal(total)
      })
      .catch(() => {
        if (current) setCatalogue(previous => ({ ...previous, status: 'error' }))
      })
      .finally(() => { if (current) inFlight.current = false })
    return () => { current = false }
  }, [category, handle, onTotal, page, retry])

  const changeCategory = value => {
    if (value === category) return
    setCategory(value)
    setPage(1)
    setCatalogue({ items: [], total: 0, hasNext: false, status: 'loading' })
  }
  const loading = catalogue.status === 'loading'
  return (
    <section className="creator-gallery" aria-labelledby="creator-gallery-title" aria-busy={loading}>
      <header className="creator-gallery-heading">
        <div>
          <p className="section-kicker">{copy.profileGalleryKicker}</p>
          <h2 id="creator-gallery-title">{copy.profileGalleryTitle}<span aria-hidden="true">∞</span></h2>
          <p>{copy.profileGalleryIntro}</p>
        </div>
        <div className="exhibit-view-toggle" role="group" aria-label={copy.spatialView}>
          <button type="button" aria-pressed={view === 'infinite'} onClick={() => setView('infinite')}><span aria-hidden="true">∞</span>{copy.infiniteView}</button>
          <button type="button" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><span aria-hidden="true">▦</span>{copy.spatialGrid}</button>
        </div>
      </header>
      <div className="creator-gallery-filters" role="group" aria-label={copy.profileFilterLabel}>
        <button type="button" aria-pressed={!category} onClick={() => changeCategory('')}>{copy.allWork}</button>
        {assetCategoryProfiles.map(item => <button key={item.value} type="button" aria-pressed={category === item.value} onClick={() => changeCategory(item.value)}>{item.shortLabels[language] || item.shortLabels.en}</button>)}
      </div>
      {loading && catalogue.items.length === 0 ? (
        <div className="creator-gallery-loading" role="status"><span aria-hidden="true">∞</span>{copy.exploreLoading}</div>
      ) : catalogue.items.length > 0 ? (
        view === 'infinite' ? <InfiniteWorks key={category} copy={copy} language={language} works={catalogue.items} /> :
        <div className="explore-grid">{catalogue.items.map(work => <WorkCard key={work.id} work={work} copy={copy} language={language} showCreator={false} />)}</div>
      ) : catalogue.status !== 'error' ? (
        <div className="asset-empty-state"><strong>{category ? copy.emptyCategoryTitle : copy.publicProfileNoWorksTitle}</strong><span>{category ? copy.emptyCategoryBody : copy.publicProfileNoWorksBody}</span></div>
      ) : null}
      <footer className="creator-gallery-pagination">
        <p role="status">{catalogue.status === 'error' ? copy.publicProfileWorksLoadError : loading && !catalogue.items.length ? '' : copy.profileWorksLoaded.replace('{loaded}', catalogue.items.length).replace('{total}', catalogue.total)}</p>
        {catalogue.status === 'error' ? <button type="button" className="secondary-action" onClick={() => { setCatalogue(previous => ({ ...previous, status: 'loading' })); setRetry(value => value + 1) }}>{copy.profileRetry}</button> : catalogue.hasNext ? <button type="button" className="secondary-action" disabled={loading} onClick={() => {
          if (inFlight.current) return
          inFlight.current = true
          setCatalogue(previous => ({ ...previous, status: 'loading' }))
          setPage(value => value + 1)
        }}>{loading ? copy.exploreLoading : copy.profileLoadMore}<span aria-hidden="true">＋</span></button> : null}
      </footer>
    </section>
  )
}

export default CreatorWorksGallery
