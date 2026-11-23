import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getCreators } from '../lib/api'
import CreatorDirectoryCard from '../components/CreatorDirectoryCard'
import { SocialPagination } from '../components/ConnectionsPanel'

const CreatorsPage = ({ authToken, visitorUser, copy, language }) => {
  const [params, setParams] = useSearchParams()
  const [revision, setRevision] = useState(0)
  const [loaded, setLoaded] = useState({ key: '', data: null, error: null })
  const query = params.get('q') || ''
  const value = Number(params.get('page'))
  const page = Number.isInteger(value) && value > 0 ? value : 1
  const key = JSON.stringify([query, page, revision])

  useEffect(() => {
    let current = true
    getCreators({ query, page })
      .then((data) => { if (current) setLoaded({ key, data, error: null }) })
      .catch((error) => { if (current) setLoaded({ key, data: null, error }) })
    return () => { current = false }
  }, [query, page, revision, key])

  const ready = loaded.key === key
  const creators = ready ? loaded.data?.creators || [] : []
  const changePage = (next) => setParams({ ...(query ? { q: query } : {}), page: String(next) })

  const search = (event) => {
    event.preventDefault()
    const q = event.currentTarget.elements.creatorsQuery.value.trim()
    setParams(q ? { q } : {})
  }

  return (
    <main className="creators-directory" lang={language}>
      <header className="creators-heading">
        <div>
          <p className="section-kicker">PEOPLE / CONNECT</p>
          <h1>{copy.socialDirectoryTitle}</h1>
          <p>{copy.socialDirectoryIntro}</p>
          <small>{copy.socialDirectoryHint}</small>
        </div>
        <Link className="secondary-action" to={authToken ? '/account/connections' : '/login?mode=login'}>
          {copy.socialConnections} ↗
        </Link>
      </header>

      <form className="social-search creators-search" key={query} onSubmit={search}>
        <label>
          <span>{copy.creatorSearchPlaceholder}</span>
          <input type="search" name="creatorsQuery" maxLength={60} defaultValue={query} placeholder={copy.creatorSearchPlaceholder} />
        </label>
        <button className="primary-action" type="submit">{copy.socialFind}</button>
      </form>

      {!ready && <p role="status">{copy.loading}</p>}
      {ready && loaded.error && (
        <div className="social-empty" role="alert">
          <p>{copy.socialError}</p>
          <button className="secondary-action" type="button" onClick={() => setRevision((n) => n + 1)}>
            {copy.socialRetry}
          </button>
        </div>
      )}
      {ready && !loaded.error && (
        <>
          {creators.length ? (
            <div className="creator-directory-grid">
              {creators.map((creator) => (
                <CreatorDirectoryCard key={creator.handle} creator={creator} copy={copy} authToken={authToken} visitorUser={visitorUser} showActions heading="h2" />
              ))}
            </div>
          ) : <p className="social-empty">{copy.socialDirectoryEmpty}</p>}
          {(creators.length > 0 || page > 1) && (
            <SocialPagination page={page} pagination={loaded.data?.pagination} onPage={changePage} copy={copy} />
          )}
        </>
      )}
    </main>
  )
}

export default CreatorsPage
