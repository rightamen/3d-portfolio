import { useState } from 'react'
import { Link } from 'react-router-dom'
import { writePrivateSocial } from '../lib/api'
import { socialErrorText,useSocialResource } from '../hooks/useSocialResource'
import SocialDialog from './SocialDialog'
const SocialActions=({handle,authToken,copy,isSelf=false})=>{
 const path='/api/users/'+encodeURIComponent(handle),resource=useSocialResource(authToken && !isSelf?path+'/relationship':null,authToken),[confirm,setConfirm]=useState(false)
 const state=resource.data,friend=state?.friendship
 const run=(suffix,body,method='PUT')=>resource.mutate(()=>writePrivateSocial(suffix.startsWith('/api/')?suffix:path+suffix,authToken,method,body))
 if(!authToken)return <div className="social-actions social-anonymous"><Link className="primary-action" to="/login?mode=login">{copy.socialFollow}</Link><Link className="secondary-action" to="/login?mode=login">{copy.socialAddFriend}</Link><Link className="secondary-action" to={"/messages?to="+encodeURIComponent(handle)}>{copy.dmSend}</Link><small>{copy.socialLogin}</small></div>
 if(isSelf || state?.self)return <div className="social-self-entry"><small>{copy.socialSelf}</small><Link className="secondary-action" to="/creators">{copy.socialFind} ↗</Link></div>
 return <div className="social-actions">
  {resource.error?<div role="alert"><span>{copy.socialError}</span><button type="button" className="secondary-action" onClick={resource.refresh}>{copy.socialRetry}</button></div>:<>
   <button className="primary-action" type="button" disabled={!state || resource.busy} aria-pressed={Boolean(state?.following)} onClick={()=>run('/follow',{following:!state.following})}>{state?.following?copy.socialUnfollow:copy.socialFollow}</button>
   {!friend?<button className="secondary-action" type="button" disabled={!state || resource.busy} onClick={()=>run('/friend',{})}>{copy.socialAddFriend}</button>:friend.status==='accepted'?<button className="secondary-action" type="button" disabled={resource.busy} onClick={()=>setConfirm(true)}>{copy.socialFriends} · {copy.socialRemoveFriend}</button>:friend.direction==='outgoing'?<button className="secondary-action" type="button" disabled={resource.busy} onClick={()=>run('/api/account/friends/'+friend.id,{action:'cancel'},'PATCH')}>{copy.socialCancelRequest}</button>:<><button className="secondary-action" type="button" disabled={resource.busy} onClick={()=>run('/api/account/friends/'+friend.id,{action:'accept'},'PATCH')}>{copy.socialAccept}</button><button className="secondary-action" type="button" disabled={resource.busy} onClick={()=>run('/api/account/friends/'+friend.id,{action:'decline'},'PATCH')}>{copy.socialDecline}</button></>}
   {state && <small>{copy.socialFollowers} {state.followers} · {copy.socialFollowing} {state.followingCount}</small>}
  </>}
  {resource.actionError && <p role="alert">{socialErrorText(resource.actionError,copy)}</p>}
  {confirm && <SocialDialog title={copy.socialRemoveFriend} copy={copy} onClose={()=>setConfirm(false)}><p>{copy.socialRemoveConfirm}</p>{resource.actionError && <p role="alert">{socialErrorText(resource.actionError,copy)}</p>}<div className="social-form-actions"><button className="secondary-action" type="button" onClick={()=>setConfirm(false)}>{copy.socialCancel}</button><button className="primary-action" type="button" disabled={resource.busy} onClick={async()=>{if(await run('/api/account/friends/'+friend.id,{action:'remove'},'PATCH'))setConfirm(false)}}>{copy.socialConfirm}</button></div></SocialDialog>}
 </div>
}
export default SocialActions
