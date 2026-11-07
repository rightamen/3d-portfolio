import {NavLink} from 'react-router-dom'
import {useLiveCommunication} from '../hooks/useLiveCommunication'
const CommunicationNav=({authToken,copy})=>{
 const {data}=useLiveCommunication(authToken?'/api/account/communication/summary':null,authToken,20000)
 const count=Number(data?.messagesUnread || 0)+Number(data?.requestsUnread || 0)
 return <nav className="communication-nav" aria-label={copy.commMessages+' / '+copy.commFollowing}>
  <NavLink to="/following" title={copy.commFollowing} aria-label={copy.commFollowing}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 4h16v16H4z M8 9h8 M8 13h8 M8 17h4"/></svg><span>{copy.commFollowing}</span>{data?.feedUnread>0 && <b>{Math.min(data.feedUnread,99)}{data.feedUnread>99?'+':''}</b>}</NavLink>
  <NavLink to="/messages" title={copy.commMessages} aria-label={copy.commMessages}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 4h18v13H9l-6 4V4Z M7 8h10 M7 12h6"/></svg><span>{copy.commMessages}</span>{count>0 && <b>{Math.min(count,99)}{count>99?'+':''}</b>}</NavLink>
 </nav>
}
export default CommunicationNav
