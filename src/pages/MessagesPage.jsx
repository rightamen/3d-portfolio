import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {Link,useNavigate,useParams,useSearchParams} from 'react-router-dom'
import {getPrivateSocial,writePrivateSocial} from '../lib/api'
import {communicationChanged,useLiveCommunication} from '../hooks/useLiveCommunication'
import SocialDialog from '../components/SocialDialog'
import {SocialPagination} from '../components/ConnectionsPanel'
import CommunicationGate from '../components/CommunicationGate'
const root='/api/account/messages/threads'
const Avatar=({person})=><span className="dm-avatar">{person?.avatarUrl?<img src={person.avatarUrl} alt=""/>:person?.displayName?.slice(0,1)||'◇'}</span>
const OpenConversation=({handle,token,copy})=>{
 const navigate=useNavigate(),[attempt,setAttempt]=useState(0),[error,setError]=useState(false)
 useEffect(()=>{let current=true;writePrivateSocial(root,token,'POST',{handle}).then(data=>{if(current){communicationChanged();navigate('/messages/'+data.thread.id,{replace:true})}}).catch(()=>{if(current)setError(true)});return()=>{current=false}},[handle,token,navigate,attempt])
 return <div className="dm-empty" role={error?'alert':'status'}><p>{error?copy.socialError:copy.loading}</p>{error && <button className="secondary-action" type="button" onClick={()=>{setError(false);setAttempt(n=>n+1)}}>{copy.socialRetry}</button>}</div>
}
const NewMessage=({token,copy,onClose,selfHandle})=>{
 const [query,setQuery]=useState(''),[search,setSearch]=useState('')
 const resource=useLiveCommunication('/api/creators?limit=24&q='+encodeURIComponent(search),token,60000)
 return <SocialDialog title={copy.dmNew} copy={copy} onClose={onClose}><p>{copy.dmNewIntro}</p><form className="social-search" onSubmit={e=>{e.preventDefault();setSearch(query.trim())}}><label><span>{copy.socialSearch}</span><input type="search" maxLength={60} value={query} onChange={e=>setQuery(e.target.value)}/></label><button type="submit" className="primary-action">{copy.socialFind}</button></form>{resource.error?<p role="alert">{copy.socialError}<button className="secondary-action" type="button" onClick={resource.refresh}>{copy.socialRetry}</button></p>:!resource.data?<p role="status">{copy.loading}</p>:<div className="dm-new-people">{resource.data.creators.filter(p=>p.handle!==selfHandle).map(person=><Link key={person.handle} to={'/messages?to='+encodeURIComponent(person.handle)} onClick={onClose}><Avatar person={person}/><span><strong>{person.displayName}</strong><small>@{person.handle}</small></span><span aria-hidden="true">↗</span></Link>)}{!resource.data.creators.some(p=>p.handle!==selfHandle) && <p>{copy.socialDirectoryEmpty}</p>}</div>}</SocialDialog>
}
const ThreadView=({id,token,copy,language})=>{
 const path=root+'/'+encodeURIComponent(id),resource=useLiveCommunication(path,token),data=resource.data
 const [history,setHistory]=useState([]),[older,setOlder]=useState({busy:false,error:false,done:false}),[draft,setDraft]=useState(''),[sending,setSending]=useState(false),[failed,setFailed]=useState(null),[confirm,setConfirm]=useState(false)
 const viewport=useRef(null),nearBottom=useRef(true),read=useRef(0),sendLock=useRef(false),alive=useRef(true)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 const rows=useMemo(()=>[...new Map([...history,...(data?.messages||[])].map(m=>[m.seq,m])).values()].sort((a,b)=>a.seq-b.seq),[history,data?.messages])
 const latest=rows.at(-1)?.seq || 0
 const gap=rows.find((message,index)=>index>0 && message.seq>rows[index-1].seq+1)
 const markRead=useCallback(()=>{
  if(!latest || document.hidden || !navigator.onLine || !document.hasFocus() || !nearBottom.current || read.current>=latest)return
  const old=read.current;read.current=latest
  writePrivateSocial(path+'/read',token,'PUT',{seq:latest}).then(()=>{if(alive.current)communicationChanged()}).catch(()=>{if(alive.current && read.current===latest)read.current=old})
 },[latest,path,token])
 useEffect(()=>{
  if(nearBottom.current && viewport.current)viewport.current.scrollTop=viewport.current.scrollHeight
  markRead()
 },[latest,markRead])
 useEffect(()=>{
  const update=()=>markRead(),timer=setInterval(update,3000)
  window.addEventListener('focus',update);document.addEventListener('visibilitychange',update)
  return()=>{clearInterval(timer);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update)}
 },[markRead])
 const send=async event=>{
  event.preventDefault();if(sendLock.current || !draft.trim())return
  const input=failed || {body:draft.trim(),clientId:crypto.randomUUID()}
  sendLock.current=true;setSending(true)
  try{
   await writePrivateSocial(path+'/messages',token,'POST',input)
   if(alive.current){setDraft('');setFailed(null);nearBottom.current=true;resource.refresh();communicationChanged()}
  }catch{if(alive.current)setFailed(input)}
  finally{sendLock.current=false;if(alive.current)setSending(false)}
 }
 const loadOlder=async()=>{
  if(older.busy)return
  const scroll=viewport.current,top=scroll.scrollTop,height=scroll.scrollHeight
  setOlder({busy:true,error:false,done:false})
  try{const result=await getPrivateSocial(path+'?before='+(gap?.seq || rows[0].seq),token);if(alive.current){setHistory(current=>[...result.messages,...current]);setOlder({busy:false,error:false,done:!gap && !result.hasOlder});requestAnimationFrame(()=>{if(viewport.current)viewport.current.scrollTop=top+viewport.current.scrollHeight-height})}}
  catch{if(alive.current)setOlder({busy:false,error:true,done:false})}
 }
 if(!data)return <div className="dm-empty"><Link to="/messages">{copy.dmBack}</Link><p role={resource.error?'alert':'status'}>{resource.error?copy.socialError:copy.loading}</p>{resource.error && <button className="secondary-action" type="button" onClick={resource.refresh}>{copy.socialRetry}</button>}</div>
 const thread=data.thread,person=thread.peer,name=person.available?person.displayName:copy.socialUnavailable
 const canSend=person.available && !thread.blocked && thread.status!=='declined' && (thread.status==='active' || thread.direction==='outgoing' && thread.lastSeq===0)
 const change=async action=>{if(await resource.mutate(()=>writePrivateSocial(path,token,'PATCH',{action}))){setConfirm(false);communicationChanged()}}
 return <section className="dm-conversation" aria-label={name}>
  <header className="dm-conversation-head"><Link className="dm-back" to="/messages" aria-label={copy.dmBack}>←</Link><Avatar person={person}/><div>{person.available?<Link to={'/u/'+person.handle}><strong>{name}</strong></Link>:<strong>{name}</strong>}<small>{copy.dmSync}</small></div><button className="dm-block-button" type="button" disabled={resource.busy} onClick={()=>thread.blockedByMe?change('unblock'):setConfirm(true)}>{thread.blockedByMe?copy.dmUnblock:copy.dmBlock}</button></header>
  {(resource.error || resource.actionError) && <div className="dm-error" role="alert">{copy.socialError}<button type="button" onClick={resource.refresh}>{copy.socialRetry}</button></div>}
  {thread.status==='pending' && !thread.blocked && <div className="dm-request-banner"><p>{thread.direction==='incoming'?copy.dmPendingIn:copy.dmPendingOut}</p>{thread.direction==='incoming' && <div><button className="primary-action" type="button" disabled={resource.busy} onClick={()=>change('accept')}>{copy.socialAccept}</button><button className="secondary-action" type="button" disabled={resource.busy} onClick={()=>change('decline')}>{copy.socialDecline}</button></div>}</div>}
  {thread.status==='declined' && thread.direction==='incoming' && !thread.blocked && <div className="dm-request-banner"><p>{copy.dmUnavailable}</p><button className="secondary-action" type="button" disabled={resource.busy} onClick={()=>change('accept')}>{copy.socialAccept}</button></div>}
  <div className="dm-message-log" role="log" aria-label={copy.commMessages} aria-live="polite" aria-relevant="additions" ref={viewport} onScroll={()=>{const node=viewport.current;nearBottom.current=node.scrollHeight-node.scrollTop-node.clientHeight<60;if(nearBottom.current)markRead()}}>
   {(gap || (data.hasOlder || history.length>0) && !older.done) && <button className="dm-older" type="button" disabled={older.busy} onClick={loadOlder}>{older.error?copy.socialRetry:copy.dmOlder}</button>}
   {!rows.length && <p className="dm-log-empty">{copy.dmNoMessages}</p>}
   {rows.map(message=><article key={message.id} className={'dm-message'+(message.mine?' is-mine':'')}><p>{message.body}</p><footer><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString(language,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time>{message.mine && <span>{message.seq<=thread.peerReadSeq?copy.dmRead:copy.dmDelivered}</span>}</footer></article>)}
  </div>
  <form className="dm-composer" onSubmit={send}>{failed && <p className="dm-error" role="alert">{copy.dmFailed}<button type="button" disabled={sending} onClick={()=>setFailed(null)}>{copy.socialCancel}</button></p>}{!canSend && <p className="dm-composer-note">{thread.status==='pending' && !thread.blocked?copy.dmPendingOut:copy.dmUnavailable}</p>}<label className="sr-only" htmlFor="dm-draft">{copy.dmPlaceholder}</label><textarea id="dm-draft" rows={2} maxLength={4000} placeholder={copy.dmPlaceholder} value={draft} disabled={!canSend || sending || Boolean(failed)} onChange={e=>setDraft(e.target.value)} onKeyDown={event=>{if(event.key==='Enter' && !event.shiftKey && !event.nativeEvent.isComposing){event.preventDefault();event.currentTarget.form.requestSubmit()}}}/><div><small>{draft.length}/4000 · {copy.dmHint}</small><button type="submit" className="primary-action" disabled={sending || (!canSend && !failed) || !draft.trim()}>{sending?copy.loading:failed?copy.socialRetry:copy.dmSubmit}<span aria-hidden="true">↗</span></button></div></form>
  {confirm && <SocialDialog title={copy.dmBlock} copy={copy} onClose={()=>setConfirm(false)}><p>{copy.dmBlockConfirm}</p>{resource.actionError && <p role="alert">{copy.socialError}</p>}<div className="social-form-actions"><button className="secondary-action" type="button" onClick={()=>setConfirm(false)}>{copy.socialCancel}</button><button className="primary-action" type="button" disabled={resource.busy} onClick={()=>change('block')}>{copy.socialConfirm}</button></div></SocialDialog>}
 </section>
}
const MessagesPage=({authToken,visitorUser,copy,language})=>{
 const {threadId}=useParams(),[params]=useSearchParams(),to=params.get('to'),[tab,setTab]=useState('inbox'),[page,setPage]=useState(1),[create,setCreate]=useState(false)
 const resource=useLiveCommunication(authToken?root+'?tab='+tab+'&page='+page:null,authToken,5000)
 const summary=useLiveCommunication(authToken?'/api/account/communication/summary':null,authToken,20000)
 if(!authToken)return <CommunicationGate copy={copy}/>
 return <main className="messages-page" lang={language}><header className="communication-heading"><div><p className="section-kicker">MESSAGES / YOUR CIRCLE</p><h1>{copy.commMessages}</h1><p>{copy.dmIntro}</p></div><button className="primary-action" type="button" onClick={()=>setCreate(true)}>{copy.dmNew} +</button></header><div className={'dm-workspace'+(threadId||to?' has-active':'')}><aside className="dm-sidebar" aria-label={copy.dmInbox}><div className="dm-tabs"><button type="button" aria-pressed={tab==='inbox'} onClick={()=>{setTab('inbox');setPage(1)}}>{copy.dmInbox}</button><button type="button" aria-pressed={tab==='requests'} onClick={()=>{setTab('requests');setPage(1)}}>{copy.dmRequests}{summary.data?.requestsUnread>0 && <b>{summary.data.requestsUnread}</b>}</button></div>{resource.error && <div className="dm-error" role="alert">{copy.socialError}<button type="button" onClick={resource.refresh}>{copy.socialRetry}</button></div>}<div className="dm-thread-list">{!resource.data?<p role="status">{copy.loading}</p>:resource.data.threads.length?resource.data.threads.map(thread=><Link className="dm-thread" key={thread.id} to={'/messages/'+thread.id} aria-current={thread.id===threadId?'page':undefined}><Avatar person={thread.peer}/><span><strong>{thread.peer.available?thread.peer.displayName:copy.socialUnavailable}</strong><small>{thread.lastMessage?.body || copy.dmNoMessages}</small></span>{thread.unread>0 && <b>{thread.unread}</b>}</Link>):<div className="dm-empty"><p>{copy.dmEmpty}</p><Link to="/creators">{copy.socialFind} ↗</Link></div>}</div><SocialPagination copy={copy} page={page} pagination={resource.data?.pagination} onPage={setPage}/></aside><div className="dm-main">{to?<OpenConversation key={to} handle={to} token={authToken} copy={copy}/>:threadId?<ThreadView key={threadId} id={threadId} token={authToken} copy={copy} language={language}/>:<div className="dm-empty dm-welcome"><span aria-hidden="true">✳</span><h2>{copy.dmSelect}</h2><p>{copy.dmIntro}</p><button className="secondary-action" type="button" onClick={()=>setCreate(true)}>{copy.dmNew} ↗</button></div>}</div></div>{create && <NewMessage token={authToken} selfHandle={visitorUser?.handle} copy={copy} onClose={()=>setCreate(false)}/>}</main>
}
export default MessagesPage
