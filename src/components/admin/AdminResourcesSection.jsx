import {useEffect,useState} from 'react'
import {getAdminWorks,getAdminWork,saveAdminWorkClassification,moderateAdminWork} from '../../lib/api'
import {getCopy} from '../../lib/i18n'
import {resourceTypes,resourceLabels,assetKindLabels} from '../../lib/resources'
import {assetCategoryProfiles} from '../../lib/assetCategories'
import {localizedWorkField} from '../../lib/works'
import {useAdminI18n} from '../../lib/admin/i18nAdmin'
import ResourceMedia from '../ResourceMedia'

const statusLabels=copy=>({draft:copy.worksStatusDraft,review:copy.worksStatusReview,published:copy.worksStatusPublished,hidden:copy.worksStatusHidden,rejected:copy.worksStatusRejected})
const ResourceReviewCard=({work,token,onChange})=>{
 const {language,t}=useAdminI18n(),copy=getCopy(language),labels=resourceLabels(copy)
 const [type,setType]=useState(work.resourceType || 'model'),[category,setCategory]=useState(work.assetCategory || ''),[expanded,setExpanded]=useState(false)
 const [detail,setDetail]=useState(null),[detailError,setDetailError]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
 useEffect(()=>{
  if(!expanded)return
  let active=true
  getAdminWork(token,work.id).then(payload=>{if(active){setDetail(payload.work);setDetailError(false)}}).catch(()=>{if(active)setDetailError(true)})
  return()=>{active=false}
 },[expanded,token,work.id])
 const run=async task=>{
  if(busy)return;setBusy(true);setError('')
  try{const payload=await task();onChange(payload.work)}
  catch(e){setError(e.status===409?t('resources.stale'):t('resources.error'))}
  finally{setBusy(false)}
 }
 return <article className="admin-resource-card">
  <header>{work.thumbnail || work.image?<img alt="" src={work.thumbnail || work.image}/>:null}<div><h3>{localizedWorkField(work,'title',language)}</h3><p>@{work.creator?.handle}</p><div className="resource-review-badges"><span>{labels[work.resourceType || 'model']}</span><span>{statusLabels(copy)[work.status]}</span></div></div></header>
  <details className="resource-classification-form"><summary>{t('resources.classification')}</summary><form onSubmit={e=>{e.preventDefault();run(()=>saveAdminWorkClassification(token,work.id,{resourceType:type,assetCategory:type==='model'?category:'',version:work.contentVersion}))}}>
   <label>{copy.resourceType}<select aria-label={copy.resourceType} disabled={busy} value={type} onChange={e=>{setType(e.target.value);setCategory('')}}>{resourceTypes.map(value=><option key={value} value={value}>{labels[value]}</option>)}</select></label>
   {type==='model' && <label>{copy.resourceSubtype}<select aria-label={copy.resourceSubtype} disabled={busy} value={category} onChange={e=>setCategory(e.target.value)}><option value="">—</option>{assetCategoryProfiles.map(c=><option key={c.value} value={c.value}>{c.shortLabels[language]}</option>)}</select></label>}
   <p>{t('resources.note')}</p><button className="secondary-action" disabled={busy || type===(work.resourceType || 'model') && category===(work.assetCategory || '')}>{t('resources.save')}</button>
  </form></details>
  <button className="secondary-action" type="button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{t('resources.inspect')}</button>
  {expanded && <section className="admin-resource-inspector">
   {!detail && !detailError?<p role="status">{copy.loading}</p>:detailError?<p role="alert">{t('resources.error')}</p>:<>
    {detail.resourceType!=='model'?<ResourceMedia work={detail} copy={copy}/>:detail.image && <img className="admin-model-cover" src={detail.image} alt=""/>}
    <p>{copy.resourcePrivacy}</p>
    <ul className="resource-asset-list">{(detail.assets || []).map(asset=><li key={asset.id}><span>{assetKindLabels(copy)[asset.kind] || copy.resourceFiles}</span><strong>{asset.fileName}</strong><small>{(asset.bytes/1024/1024).toFixed(2)} MB</small>{!asset.protected && asset.fileUrl?<a href={asset.fileUrl} target="_blank" rel="noreferrer">{copy.communityOpenFile}</a>:<small>{copy.resourceOriginal}</small>}</li>)}</ul>
   </>}
  </section>}
  <div className="resource-review-actions">
   {work.status!=='published' && <button className="primary-action" type="button" disabled={busy} onClick={()=>run(()=>moderateAdminWork(token,work.id,{status:'published',version:work.contentVersion}))}>{t('common.publish')}</button>}
   {work.status==='review' && <button className="danger-action" type="button" disabled={busy} onClick={()=>run(()=>moderateAdminWork(token,work.id,{status:'rejected',version:work.contentVersion}))}>{t('common.reject')}</button>}
   {work.status==='published' && <button className="secondary-action" type="button" disabled={busy} onClick={()=>run(()=>moderateAdminWork(token,work.id,{status:'hidden',version:work.contentVersion}))}>{t('resources.hide')}</button>}
  </div>{error && <p role="alert">{error}</p>}
 </article>
}
const AdminResourcesSection=({token})=>{
 const {language,t}=useAdminI18n(),copy=getCopy(language),labels=resourceLabels(copy)
 const [type,setType]=useState(''),[status,setStatus]=useState('review'),[query,setQuery]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[nonce,setNonce]=useState(0),[message,setMessage]=useState('')
 const key=JSON.stringify([token,type,status,query,page,nonce]),[loaded,setLoaded]=useState({key:'',works:[],pagination:{},error:false})
 useEffect(()=>{
  let active=true
  getAdminWorks(token,{page,status,resourceType:type,q:query}).then(payload=>{if(active)setLoaded({key,works:payload.works || [],pagination:payload.pagination || {},error:false})}).catch(()=>{if(active)setLoaded({key,works:[],pagination:{},error:true})})
  return()=>{active=false}
 },[key,token,type,status,query,page])
 const ready=loaded.key===key
 const refresh=()=>{setMessage('');setNonce(v=>v+1)}
 const updated=()=>{setMessage(t('resources.saved'));setNonce(v=>v+1)}
 return <section className="admin-section admin-resources-section">
  <div className="admin-section-header"><div><h2>{t('resources.title')}</h2><p>{t('resources.intro')}</p></div><button className="secondary-action" onClick={refresh}>{t('common.refresh')}</button></div>
  <div className="resource-list-controls">
   <label>{copy.resourceFilterType}<select aria-label={copy.resourceFilterType} value={type} onChange={e=>{setType(e.target.value);setPage(1)}}><option value="">{copy.resourceAll}</option>{resourceTypes.map(value=><option key={value} value={value}>{labels[value]}</option>)}</select></label>
   <label>{copy.resourceFilterStatus}<select aria-label={copy.resourceFilterStatus} value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}}><option value="">{copy.resourceAllStatuses}</option>{Object.entries(statusLabels(copy)).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   <form onSubmit={e=>{e.preventDefault();setQuery(search.trim());setPage(1)}}><label>{t('resources.search')}<input type="search" aria-label={t('resources.search')} value={search} onChange={e=>setSearch(e.target.value)}/></label><button className="secondary-action">{t('common.search')}</button></form>
  </div>
  {message && <p role="status">{message}</p>}
  {!ready?<p role="status">{t('common.loading')}</p>:loaded.error?<p role="alert">{t('curation.loadError')}</p>:<>
   {loaded.works.length?loaded.works.map(work=><ResourceReviewCard key={work.id+':'+work.contentVersion} work={work} token={token} onChange={updated}/>):<p>{t('curation.empty')}</p>}
   <nav className="visitor-pagination"><button className="secondary-action" disabled={!loaded.pagination.hasPrevious} onClick={()=>setPage(v=>v-1)}>{t('common.previous')}</button><span>{t('common.pageOf',{page:loaded.pagination.page || page,pages:loaded.pagination.pages || 1})}</span><button className="secondary-action" disabled={!loaded.pagination.hasNext} onClick={()=>setPage(v=>v+1)}>{t('common.next')}</button></nav>
  </>}
 </section>
}
export default AdminResourcesSection
