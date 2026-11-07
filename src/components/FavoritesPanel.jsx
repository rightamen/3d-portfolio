import { CollectionManager,CollectionPicker } from './CollectionLibrary'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import WorkCard from './WorkCard'
import { getAccountFavorites, removeWorkFavorite } from '../lib/api'
import { getApiErrorMessage } from '../lib/i18n'

const FavoritesPanel = ({authToken,copy,language}) => {
  const [page,setPage]=useState(1)
  const [showFolders,setShowFolders]=useState(false),[selected,setSelected]=useState({id:'',name:''}),[organize,setOrganize]=useState('')
  const [revision,setRevision]=useState(0)
  const [loaded,setLoaded]=useState({key:'',favorites:[],pagination:{},error:null})
  const [busyId,setBusyId]=useState('')
  const [actionError,setActionError]=useState(null)
  const epoch=useRef(0),returnFocus=useRef(false)
  const identity=JSON.stringify([authToken,page,selected.id])
  const key=JSON.stringify([authToken,page,revision,selected.id])
  useEffect(()=>{
    const current=++epoch.current
    getAccountFavorites(authToken,page,selected.id).then(payload=>{
      if(epoch.current!==current) return
      if(!payload.favorites?.length && page>1) {setPage(value=>value-1);return}
      setLoaded({key,identity,favorites:payload.favorites || [],pagination:payload.pagination || {},error:null})
    }).catch(error=>{if(epoch.current===current) setLoaded({key,identity,favorites:[],pagination:{},error})})
    return ()=>{epoch.current=current+1}
  },[authToken,page,revision,key,selected.id,identity])
  const loading=loaded.key!==key
  useEffect(()=>{if(!loading && returnFocus.current){if(document.activeElement===document.body)document.getElementById('saved-title')?.focus({preventScroll:true});returnFocus.current=false}},[loading])
  const remove=async workId=>{
    if(busyId) return
    const current=epoch.current
    setBusyId(workId);setActionError(null)
    try {
      await removeWorkFavorite(workId,authToken)
      if(epoch.current===current) {setRevision(value=>value+1);setBusyId('')}
    } catch(error) {if(epoch.current===current) {setActionError(error);setBusyId('')}}
  }
  return <section className="creator-console creator-saved" aria-labelledby="saved-title" aria-busy={loading}>
    <header className="creator-console-heading"><div><p className="section-kicker">{copy.accountNavFavorites}</p><h2 id="saved-title" tabIndex={-1}>{copy.favoritesTitle}</h2><p>{copy.favoritesIntro}</p></div><span className="creator-private-tag">◈ {copy.creatorPrivate}</span></header>
    <div className="collection-toolbar"><button type="button" className="secondary-action" aria-pressed={!selected.id} onClick={()=>{setSelected({id:'',name:''});setPage(1)}}>{copy.collectionAll}</button><button type="button" className="secondary-action" aria-expanded={showFolders} onClick={()=>setShowFolders(value=>!value)}>{copy.collectionManage} ▱</button>{selected.id && <strong>{selected.name}</strong>}</div>
    {showFolders && <CollectionManager key={authToken} authToken={authToken} copy={copy} selected={selected.id} version={revision} onSelect={(id,name)=>{setSelected({id,name});setPage(1)}}/>}
    {actionError && <p className="creator-console-error" role="alert">{getApiErrorMessage(actionError,copy,copy.favoriteActionError)}</p>}
    {loading && loaded.identity!==identity ? <div className="creator-console-loading" role="status">{copy.loading}</div> : loaded.error ?
      <div className="creator-console-empty" role="alert"><p>{getApiErrorMessage(loaded.error,copy,copy.favoritesLoadError)}</p><button className="secondary-action" type="button" onClick={()=>setRevision(value=>value+1)}>{copy.favoriteRetry}</button></div> : loaded.favorites.length ? <>
        <div className="creator-saved-grid">{loaded.favorites.map(item=><div className="creator-saved-item" key={item.workId}>
          {item.available && item.work ? <WorkCard work={item.work} copy={copy} language={language} /> : <div className="creator-saved-unavailable"><span aria-hidden="true">◇</span><h3>{copy.favoritesUnavailable}</h3><p>{copy.favoritesUnavailableBody}</p></div>}
          <div className="creator-saved-footer"><small>{copy.favoritesSavedAt} {new Date(item.savedAt).toLocaleDateString(language)}</small><button type="button" className="collection-organize" onClick={()=>setOrganize(item.workId)}>{copy.collectionOrganize}</button><button className="creator-save-remove" type="button" disabled={Boolean(busyId)} onClick={()=>remove(item.workId)} aria-label={copy.favoriteRemove+(item.work ? ' · '+item.work.title : '')}>{busyId===item.workId ? copy.loading : copy.favoriteRemove}</button></div>
        </div>)}</div>
        <nav className="creator-console-pagination" aria-label={copy.accountNavFavorites}><p>{copy.creatorPage.replace('{page}',page).replace('{total}',loaded.pagination.total ?? loaded.favorites.length)}</p><div><button className="secondary-action" type="button" disabled={page===1 || Boolean(busyId)} onClick={()=>setPage(value=>value-1)}>{copy.creatorPrevious}</button><button className="secondary-action" type="button" disabled={!loaded.pagination.hasNext || Boolean(busyId)} onClick={()=>setPage(value=>value+1)}>{copy.creatorNext}</button></div></nav>
      </> : <div className="creator-console-empty"><span aria-hidden="true">◇</span><h3>{selected.id?copy.collectionNoWorks:copy.favoritesEmpty}</h3><p>{selected.id?copy.collectionNoWorksHint:copy.favoritesEmptyBody}</p><Link className="primary-action" to="/explore">{copy.favoritesExplore} ↗</Link></div>}
    {organize && <CollectionPicker key={authToken+organize} authToken={authToken} copy={copy} workId={organize} onClose={()=>{returnFocus.current=true;setOrganize('');setRevision(x=>x+1)}}/>}
  </section>
}
export default FavoritesPanel
