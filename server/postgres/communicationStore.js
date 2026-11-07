import {randomUUID} from 'node:crypto'
import {inTransaction,socialLock} from './socialStore.js'
import {socialFail} from '../socialValidation.js'
const visible="u.profile_public IS DISTINCT FROM false AND NOT u.profile_admin_disabled AND u.handle IS NOT NULL"
const peerId=(c,id)=>c.user_low===id?c.user_high:c.user_low
const readSeq=(c,id)=>c.user_low===id?c.read_low:c.read_high
const blockedMe=(c,id)=>c.user_low===id?c.blocked_low:c.blocked_high
const requireThread=async(db,userId,id,lock=false)=>{
 const r=await db.query('SELECT * FROM direct_conversations WHERE id=$1 AND $2 IN(user_low,user_high)'+(lock?' FOR UPDATE':''),[id,userId])
 if(!r.rowCount)socialFail('Conversation unavailable.',404)
 return r.rows[0]
}
const mapMessage=(m,userId)=>({id:m.id,seq:m.seq,clientId:m.sender_id===userId?m.client_id:undefined,body:m.body,mine:m.sender_id===userId,createdAt:m.created_at.toISOString()})
const peer=async(db,c,userId)=>{
 const r=await db.query('SELECT u.handle,u.display_name,u.avatar_url,('+visible+') AS available FROM visitor_users u WHERE u.id=$1',[peerId(c,userId)])
 const p=r.rows[0]
 return p?.available?{available:true,handle:p.handle,displayName:p.display_name,avatarUrl:p.avatar_url}:{available:false,handle:null,displayName:null,avatarUrl:null}
}
const mapThread=async(db,c,userId)=>{
 const [person,last,count]=await Promise.all([peer(db,c,userId),db.query('SELECT * FROM direct_messages WHERE conversation_id=$1 ORDER BY seq DESC LIMIT 1',[c.id]),db.query('SELECT count(*)::int AS n FROM direct_messages WHERE conversation_id=$1 AND sender_id<>$2 AND seq>$3',[c.id,userId,readSeq(c,userId)])])
 return {id:c.id,peer:person,status:c.status,direction:c.requester_id===userId?'outgoing':'incoming',blocked:c.blocked_low||c.blocked_high,blockedByMe:blockedMe(c,userId),lastSeq:c.last_seq,readSeq:readSeq(c,userId),peerReadSeq:readSeq(c,peerId(c,userId)),unread:count.rows[0].n,lastMessage:last.rows[0]?mapMessage(last.rows[0],userId):null,updatedAt:c.updated_at.toISOString()}
}
// Shared visibility source for feed and unread counts. No publication fan-out,
// no copied private content, and a read row refers only to a displayed item.
const feedSql=`
 WITH events AS (
 SELECT 'work'::text AS kind,w.id,w.creator_id AS author_id,w.title,w.summary AS body,COALESCE(w.thumbnail,w.image) AS image,
 '/w/'||u.handle||'/'||w.slug AS url,COALESCE(w.published_at,w.created_at) AS created_at FROM works w JOIN visitor_users u ON u.id=w.creator_id WHERE w.status='published'
 UNION ALL SELECT 'post',p.id,p.user_id,p.title,p.message,p.image_url,'/community/'||p.id,p.created_at FROM community_posts p
 UNION ALL SELECT 'notice',n.id,n.creator_id,''::text,n.body,NULL::text,'/u/'||u.handle,n.created_at FROM creator_notices n JOIN visitor_users u ON u.id=n.creator_id
 UNION ALL SELECT 'resource',r.id,r.user_id,r.title,r.description,r.preview_url,'/community',r.created_at FROM community_uploads r WHERE r.status='approved'
 ), visible_events AS (
 SELECT e.*,u.handle,u.display_name,u.avatar_url,(r.item_id IS NULL) AS unread
 FROM events e JOIN user_follows f ON f.followed_id=e.author_id AND f.follower_id=$1
 JOIN visitor_users u ON u.id=e.author_id
 LEFT JOIN following_feed_reads r ON r.user_id=$1 AND r.kind=e.kind AND r.item_id=e.id
 WHERE `+visible+` AND (e.kind IN('work','notice') OR u.activity_public IS DISTINCT FROM false)
 ) `
export const createCommunicationStore=({pool})=>({
 openConversation:async(userId,handle)=>inTransaction(pool,async db=>{
  const target=(await db.query('SELECT u.id FROM visitor_users u WHERE lower(u.handle)=lower($1) AND '+visible,[handle])).rows[0]
  if(!target || target.id===userId)socialFail('Choose another available creator.',404)
  const pair=[userId,target.id].sort();await socialLock(db,'dm-open:'+userId);await socialLock(db,'dm-pair:'+JSON.stringify(pair))
  let c=(await db.query('SELECT * FROM direct_conversations WHERE user_low=$1 AND user_high=$2 FOR UPDATE',pair)).rows[0]
  if(!c){
   const n=(await db.query("SELECT count(*)::int AS n FROM direct_conversations WHERE requester_id=$1 AND created_at>now()-interval '1 day'",[userId])).rows[0].n
   if(n>=20)socialFail('Daily conversation limit reached.',429)
   const friends=await db.query("SELECT 1 FROM user_friendships WHERE user_low=$1 AND user_high=$2 AND status='accepted'",pair)
   c=(await db.query('INSERT INTO direct_conversations(id,user_low,user_high,requester_id,status) VALUES($1,$2,$3,$4,$5) RETURNING *',[randomUUID(),...pair,userId,friends.rowCount?'active':'pending'])).rows[0]
  }
  if(c.status==='pending' && !c.blocked_low && !c.blocked_high){
   const friend=await db.query("SELECT 1 FROM user_friendships WHERE user_low=$1 AND user_high=$2 AND status='accepted'",pair)
   if(friend.rowCount)c=(await db.query("UPDATE direct_conversations SET status='active' WHERE id=$1 RETURNING *",[c.id])).rows[0]
  }
  return mapThread(db,c,userId)
 }),
 listConversations:async(userId,{tab,limit,offset})=>{
  const where="$1 IN(c.user_low,c.user_high) AND (c.last_seq>0 OR c.requester_id=$1) AND "+(tab==='requests'?"c.status='pending' AND c.requester_id<>$1 AND NOT c.blocked_low AND NOT c.blocked_high":"NOT(c.status='pending' AND c.requester_id<>$1 AND NOT c.blocked_low AND NOT c.blocked_high)")
  const total=(await pool.query('SELECT count(*)::int AS n FROM direct_conversations c WHERE '+where,[userId])).rows[0].n
  const rows=await pool.query('SELECT c.* FROM direct_conversations c WHERE '+where+' ORDER BY c.updated_at DESC,c.id LIMIT $2 OFFSET $3',[userId,limit,offset])
  return {total,items:await Promise.all(rows.rows.map(c=>mapThread(pool,c,userId)))}
 },
 getConversation:async(userId,id,{before=null,limit=50}={})=>{
  const c=await requireThread(pool,userId,id)
  const rows=(await pool.query('SELECT * FROM direct_messages WHERE conversation_id=$1 AND ($2::int IS NULL OR seq<$2) ORDER BY seq DESC LIMIT $3',[id,before,limit+1])).rows
  const messages=rows.slice(0,limit).reverse().map(m=>mapMessage(m,userId))
  return {thread:await mapThread(pool,c,userId),messages,hasOlder:rows.length>limit}
 },
 sendMessage:async(userId,id,input)=>inTransaction(pool,async db=>{
  const c=await requireThread(db,userId,id,true)
  const prior=(await db.query('SELECT * FROM direct_messages WHERE sender_id=$1 AND client_id=$2',[userId,input.clientId])).rows[0]
  if(prior){if(prior.conversation_id!==id || prior.body!==input.body)socialFail('Retry key belongs to another message.',409);return mapMessage(prior,userId)}
  const person=await peer(db,c,userId)
  if(!person.available || c.blocked_low || c.blocked_high || c.status==='declined')socialFail('Messaging is unavailable for this conversation.',403)
  if(c.status==='pending'){
   const friend=await db.query("SELECT 1 FROM user_friendships WHERE user_low=$1 AND user_high=$2 AND status='accepted'",[c.user_low,c.user_high])
   if(friend.rowCount){c.status='active';await db.query("UPDATE direct_conversations SET status='active' WHERE id=$1",[id])}
   else if(c.requester_id!==userId || c.last_seq>0)socialFail('Wait for the message request to be accepted.',403)
  }
  await socialLock(db,'dm-send:'+userId)
  const count=(await db.query("SELECT count(*)::int AS n FROM direct_messages WHERE sender_id=$1 AND created_at>now()-interval '1 minute'",[userId])).rows[0].n
  if(count>=30)socialFail('Too many messages. Please try again shortly.',429)
  const seq=c.last_seq+1
  const message=(await db.query('INSERT INTO direct_messages(id,conversation_id,seq,sender_id,client_id,body) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[randomUUID(),id,seq,userId,input.clientId,input.body])).rows[0]
  await db.query('UPDATE direct_conversations SET last_seq=$2,updated_at=now() WHERE id=$1',[id,seq])
  return mapMessage(message,userId)
 }),
 readConversation:async(userId,id,seq)=>{
  const c=await requireThread(pool,userId,id)
  if(seq>c.last_seq)socialFail('Cannot read a message that has not arrived.')
  const column=c.user_low===userId?'read_low':'read_high'
  const result=await pool.query('UPDATE direct_conversations SET '+column+'=GREATEST('+column+',$2) WHERE id=$1 RETURNING '+column+' AS read_seq',[id,seq])
  return {readSeq:result.rows[0].read_seq}
 },
 changeConversation:async(userId,id,action)=>inTransaction(pool,async db=>{
  const c=await requireThread(db,userId,id,true)
  if(['accept','decline'].includes(action)){
   if(c.requester_id===userId || c.blocked_low || c.blocked_high || (action==='decline' && c.status!=='pending') || (action==='accept' && c.status==='active'))socialFail('This request cannot be changed.',409)
   if(!(await peer(db,c,userId)).available)socialFail('Creator unavailable.',404)
   await db.query('UPDATE direct_conversations SET status=$2,updated_at=now() WHERE id=$1',[id,action==='accept'?'active':'declined'])
  }else{
   const column=c.user_low===userId?'blocked_low':'blocked_high'
   await db.query('UPDATE direct_conversations SET '+column+'=$2,updated_at=now() WHERE id=$1',[id,action==='block'])
  }
  return mapThread(db,await requireThread(db,userId,id),userId)
 }),
 listFollowingFeed:async(userId,{kind='',limit,offset})=>{
  const filter=" WHERE ($2='' OR kind=$2)"
  const total=(await pool.query(feedSql+'SELECT count(*)::int AS n FROM visible_events'+filter,[userId,kind])).rows[0].n
  const rows=(await pool.query(feedSql+'SELECT * FROM visible_events'+filter+' ORDER BY created_at DESC,kind,id DESC LIMIT $3 OFFSET $4',[userId,kind,limit,offset])).rows
  return {total,items:rows.map(e=>({id:e.id,kind:e.kind,title:e.title,body:e.body,image:e.image,url:e.url,createdAt:e.created_at.toISOString(),unread:e.unread,author:{handle:e.handle,displayName:e.display_name,avatarUrl:e.avatar_url}}))}
 },
 readFollowingFeed:async(userId,items)=>{
  const keys=items.map(i=>i.kind+':'+i.id)
  await pool.query(feedSql+"INSERT INTO following_feed_reads(user_id,kind,item_id) SELECT $1,kind,id FROM visible_events WHERE kind||':'||id=ANY($2::text[]) ON CONFLICT DO NOTHING",[userId,keys])
  return {read:true}
 },
 communicationSummary:async userId=>{
  const [dm,feed]=await Promise.all([
   pool.query(`SELECT count(*) FILTER(WHERE c.status<>'pending' OR c.requester_id=$1)::int AS messages,
    count(DISTINCT c.id) FILTER(WHERE c.status='pending' AND c.requester_id<>$1)::int AS requests
    FROM direct_messages m JOIN direct_conversations c ON c.id=m.conversation_id
    WHERE $1 IN(c.user_low,c.user_high) AND NOT c.blocked_low AND NOT c.blocked_high AND c.status<>'declined'
    AND m.sender_id<>$1 AND m.seq>CASE WHEN c.user_low=$1 THEN c.read_low ELSE c.read_high END`,[userId]),
   pool.query(feedSql+'SELECT count(*)::int AS n FROM visible_events WHERE unread',[userId])
  ])
  return {messagesUnread:dm.rows[0].messages,requestsUnread:dm.rows[0].requests,feedUnread:feed.rows[0].n}
 }
})
