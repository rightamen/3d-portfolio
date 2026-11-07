import { useEffect,useRef,useState } from 'react'
import { Link } from 'react-router-dom'
import useDialogAccessibility from '../hooks/useDialogAccessibility'
import { initials } from '../lib/initials'

const paths={dashboard:'M3 3h6v6H3z M15 3h6v6h-6z M3 15h6v6H3z M15 15h6v6h-6z',works:'m12 3 9 5-9 5-9-5 9-5 M3 8v9l9 5 9-5V8 M12 13v9',favorites:'M5 3h14v18l-7-5-7 5V3',selling:'M5 3h14v18l-3-2-4 2-4-2-3 2V3 M9 8h6 M9 12h6',community:'M3 5h18v12H9l-6 4V5',notices:'M3 10h5l10-6v16L8 14H3v-4 M8 14l2 7',downloads:'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5',comments:'M3 4h18v14H9l-6 3V4',settings:'M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0 M7 19v-2a5 5 0 0 1 10 0v2 M12 7a3 3 0 1 0 0 6a3 3 0 1 0 0-6',system:'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6',security:'m12 3 8 3v7c0 4-8 8-8 8s-8-4-8-8V6l8-3 M8 12l3 3 5-6',overview:'M3 20h18 M6 16V9 M12 16V4 M18 16v-6'}
const Icon=({name})=><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.dashboard}/></svg>
const CreatorWorkspace=({activeTab,tabs,copy,language,onLanguageChange,onNavigate,onLogout,visitorUser,handle,children})=>{
 const [open,setOpen]=useState(false),[query,setQuery]=useState('')
 const sidebar=useRef(null),closeButton=useRef(null),root=useRef(null)
 useDialogAccessibility({dialogRef:sidebar,initialFocusRef:closeButton,open,onClose:()=>{setOpen(false);setQuery('')}})
 useEffect(()=>{
  const header=document.querySelector('.topbar')
  const update=()=>root.current?.style.setProperty('--workspace-top',(header?.getBoundingClientRect().height || 72)+'px')
  const observer=new ResizeObserver(update);if(header)observer.observe(header);update()
  const resize=()=>{if(window.innerWidth>=1024)setOpen(false)}
  window.addEventListener('resize',resize)
  return()=>{observer.disconnect();window.removeEventListener('resize',resize)}
 },[])
 const groups=[['workspaceOverview',['dashboard','overview']],['workspaceContent',['works','selling','community','notices']],['workspacePersonal',['favorites','downloads','comments','settings']],['workspacePreferences',['system','security']]]
 const matches=tabs.filter(tab=>copy[tab.labelKey]?.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
 const active=tabs.find(tab=>tab.key===activeTab)
 return <div className="creator-workspace account-shell" ref={root}>
  <aside className={'workspace-sidebar'+(open?' is-open':'')} ref={sidebar} role={open?'dialog':undefined} aria-modal={open?'true':undefined} aria-label={copy.workspaceBrand}>
   <div className="workspace-brand"><Link to="/account/dashboard"><span>MR</span><div><strong>{copy.workspaceBrand}</strong><small>mrright.blog / studio</small></div></Link><button className="workspace-close" type="button" ref={closeButton} aria-label={copy.workspaceCloseMenu} onClick={()=>setOpen(false)}>×</button></div>
   <div className="workspace-language" role="group" aria-label={copy.toggleLanguage}>{[['zh','中'],['en','EN'],['ja','日']].map(([value,label])=><button key={value} type="button" aria-pressed={language===value} onClick={()=>onLanguageChange(value)}>{label}</button>)}</div>
   <label className="workspace-search"><span aria-hidden="true">⌕</span><input type="search" aria-label={copy.workspaceSearch} placeholder={copy.workspaceSearch} value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Enter' && matches[0]){event.preventDefault();onNavigate(matches[0].key);setQuery('');setOpen(false)}else if(event.key==='Escape')setQuery('')}}/><kbd>↵</kbd></label>
   <nav className="workspace-navigation" aria-label={copy.workspaceBrand}>{groups.map(([label,keys])=>{
    const entries=keys.map(key=>matches.find(tab=>tab.key===key)).filter(Boolean)
    return entries.length>0 && <div className="workspace-nav-group" key={label}><p>{copy[label]}</p>{entries.map(tab=><button type="button" key={tab.key} className={'workspace-nav-item'+(tab.key===activeTab?' is-active':'')} aria-current={tab.key===activeTab?'page':undefined} onClick={()=>{onNavigate(tab.key);setQuery('');setOpen(false)}}><Icon name={tab.key}/><span>{copy[tab.labelKey]}</span>{tab.key===activeTab && <i aria-hidden="true"/>}</button>)}</div>
   })}{!matches.length && <p className="workspace-search-empty">{copy.workspaceNoResults}</p>}</nav>
   <footer className="workspace-identity"><div><span className="workspace-avatar">{visitorUser.avatarUrl?<img src={visitorUser.avatarUrl} alt=""/>:initials(visitorUser.displayName,visitorUser.email)}</span><div><strong>{visitorUser.displayName}</strong><small>{handle?'@'+handle:copy.accountCenter}</small></div></div>{handle && <Link to={'/u/'+handle}>{copy.workspaceProfile}<span aria-hidden="true">↗</span></Link>}<button type="button" onClick={onLogout}>{copy.accountSignOut}<span aria-hidden="true">↗</span></button></footer>
  </aside>
  {open && <button type="button" className="workspace-scrim" aria-label={copy.workspaceCloseMenu} onClick={()=>setOpen(false)}/>}
  <main className="workspace-main" inert={open?true:undefined}>
   <header className="workspace-header"><div><p>{copy.workspaceBrand} <span>/</span> {active?copy[active.labelKey]:copy.accountCenter}</p><h1>{active?copy[active.labelKey]:copy.accountCenter}</h1></div><div className="workspace-header-actions"><button className="workspace-menu-toggle" type="button" aria-label={copy.workspaceOpenMenu} aria-expanded={open} onClick={()=>setOpen(true)}>☰</button><Link to="/explore">{copy.workspaceHome}<span aria-hidden="true">↗</span></Link></div></header>
   <div className="workspace-view account-content" key={activeTab}>{children}</div>
  </main>
 </div>
}
export default CreatorWorkspace
