import { Suspense,lazy,useEffect,useRef,useState } from 'react'
import { Link,useNavigate } from 'react-router-dom'
import ModelErrorBoundary from './ModelErrorBoundary'
import { useDocumentVisible,useMediaQuery } from '../lib/admin/motion'
import { useInterfaceMotion,useInterfacePreferences } from '../hooks/useInterfacePreferences'
const Scene=lazy(()=>import('./admin/AdminGalaxyScene'))
const canRender=()=>{try{const gl=document.createElement('canvas').getContext('webgl2');if(!gl)return false;gl.getExtension('WEBGL_lose_context')?.loseContext();return true}catch{return false}}
const CreatorGalaxy=({totals,copy})=>{
 const compact=useMediaQuery('(max-width:640px)')
 const navigate=useNavigate(),motion=useInterfaceMotion(),preferences=useInterfacePreferences(),documentVisible=useDocumentVisible()
 const [supported]=useState(canRender),[mode,setMode]=useState(()=>{try{return localStorage.getItem('mrright-creator-galaxy-mode')==='flat'?'flat':'3d'}catch{return 'flat'}})
 const [visible,setVisible]=useState(false),[seen,setSeen]=useState(false)
 const stage=useRef(null)
 useEffect(()=>{
  const observer=new IntersectionObserver(([entry])=>{setVisible(entry.isIntersecting);if(entry.isIntersecting)setSeen(true)},{threshold:.08})
  observer.observe(stage.current);return()=>observer.disconnect()
 },[])
 const nodes=[
  {key:'works',label:copy.creatorWorks,value:totals.works,url:'/account/works'},
  {key:'sales',label:copy.accountNavSelling,value:totals.orders,pending:totals.pending,url:'/account/selling'},
  {key:'saves',label:copy.creatorFavorites,value:totals.favorites,url:'/account/dashboard#creator-performance'},
  {key:'downloads',label:copy.creatorDownloads,value:totals.downloads,url:'/account/dashboard#creator-performance'},
  {key:'ratings',label:copy.creatorRatings,value:totals.ratings,url:'/account/dashboard#creator-performance'},
  {key:'review',label:copy.worksStatusReview,value:totals.review,pending:totals.review,url:'/account/works'},
 ]
 const label=node=>copy.creatorGalaxyNode.replace('{label}',node.label).replace('{count}',node.value.toLocaleString())
 const flat=<div className="creator-orbit-flat"><div className="creator-orbit-core" aria-hidden="true">✦</div>{nodes.map((node,index)=>{
  const angle=index/nodes.length*Math.PI*2-Math.PI/2
  return <Link key={node.key} to={node.url} className={'creator-orbit-node'+(node.pending?' has-pending':'')} style={{left:50+Math.cos(angle)*35+'%',top:50+Math.sin(angle)*32+'%'}} aria-label={label(node)}><i aria-hidden="true"/><strong>{node.label}</strong><span>{node.value.toLocaleString()}</span></Link>
 })}</div>
 const spatial=supported && mode==='3d' && seen
 return <section className="creator-galaxy creator-console-panel" aria-labelledby="creator-galaxy-title"><header><div><h3 id="creator-galaxy-title">{copy.creatorGalaxyTitle}</h3><p className="creator-console-note">{spatial?copy.creatorGalaxyHint:copy.creatorGalaxyFlatHint}</p></div>{supported && <button className="secondary-action" type="button" onClick={()=>{const value=mode==='3d'?'flat':'3d';setMode(value);try{localStorage.setItem('mrright-creator-galaxy-mode',value)}catch{/* The view remains usable without persistence. */}}}>{mode==='3d'?copy.creatorGalaxyFlat:copy.creatorGalaxy3d}</button>}</header>
  <div className="creator-galaxy-stage" ref={stage} data-view={spatial?'3d':'flat'}><div className="creator-galaxy-readout"><span>{copy.creatorGalaxyCore}</span><strong>{totals.works.toLocaleString()}</strong></div>
   {spatial?<><div className="creator-galaxy-keyboard">{nodes.map(node=><Link key={node.key} to={node.url}>{label(node)}</Link>)}</div><ModelErrorBoundary resetKey="creator-galaxy" fallback={flat}><Suspense fallback={flat}><Scene compact={compact} nodes={nodes.map(node=>({...node,valueLabel:node.value.toLocaleString(),pendingLabel:copy.creatorGalaxyPending.replace('{count}',node.pending || 0)}))} onSelect={node=>navigate(node.url)} running={visible && documentVisible && motion==='full' && preferences.effects} spin={motion==='full' && preferences.effects}/></Suspense></ModelErrorBoundary></>:flat}
  </div><p className="creator-console-note">{copy.creatorGalaxyNote}</p>
 </section>
}
export default CreatorGalaxy
