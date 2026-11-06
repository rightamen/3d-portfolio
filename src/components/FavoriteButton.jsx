import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getWorkFavorite, removeWorkFavorite, saveWorkFavorite } from '../lib/api'
import { getApiErrorMessage } from '../lib/i18n'

const Bookmark = ({ filled=false }) => <svg aria-hidden="true" width="17" height="19" viewBox="0 0 20 22" fill={filled ? 'currentColor' : 'none'}><path d="M4 2h12v18l-6-4-6 4V2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>

const FavoriteButton = ({authToken,copy,handle,slug,workId}) => {
  const [retry,setRetry] = useState(0)
  const [loaded,setLoaded] = useState({key:-1,saved:false,error:null})
  const [busy,setBusy] = useState(false)
  const [actionError,setActionError] = useState(null)
  const epoch = useRef(0)
  useEffect(()=>{
    const current=++epoch.current
    if (authToken) getWorkFavorite(handle,slug,authToken).then(payload=>{
      if(epoch.current===current) setLoaded({key:retry,saved:payload.saved,error:null})
    }).catch(error=>{if(epoch.current===current) setLoaded({key:retry,saved:false,error})})
    return ()=>{epoch.current=current+1}
  },[authToken,handle,slug,retry])
  if (!authToken) return <Link className="creator-favorite-button" to="/login?mode=login"><Bookmark />{copy.favoriteSignIn}</Link>
  const loading=loaded.key!==retry
  const toggle=async()=>{
    if(busy || loading || loaded.error) return
    const current=epoch.current
    setBusy(true);setActionError(null)
    try {
      const payload=await (loaded.saved ? removeWorkFavorite(workId,authToken) : saveWorkFavorite(handle,slug,authToken))
      if(epoch.current===current) setLoaded({key:retry,saved:payload.saved,error:null})
    } catch(error) {if(epoch.current===current) setActionError(error)}
    finally {if(epoch.current===current) setBusy(false)}
  }
  return <div className="creator-favorite-control">
    {loaded.error && !loading ? <><span role="alert">{getApiErrorMessage(loaded.error,copy,copy.favoriteLoadError)}</span><button className="creator-favorite-button" type="button" onClick={()=>setRetry(value=>value+1)}>{copy.favoriteRetry}</button></> :
      <button className={'creator-favorite-button'+(loaded.saved && !loading ? ' is-saved':'')} type="button" disabled={loading || busy} aria-pressed={!loading && loaded.saved} aria-label={loaded.saved && !loading ? copy.favoriteRemove : copy.favoriteSave} onClick={toggle}>
        <Bookmark filled={!loading && loaded.saved} />{loading || busy ? copy.loading : loaded.saved ? copy.favoriteSaved : copy.favoriteSave}
      </button>}
    {!loading && loaded.saved && <Link className="creator-favorites-link" to="/account/favorites">{copy.accountNavFavorites} ↗</Link>}
    {actionError && <p role="alert">{getApiErrorMessage(actionError,copy,copy.favoriteActionError)}</p>}
  </div>
}
export default FavoriteButton
