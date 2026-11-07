import { randomUUID } from 'node:crypto'
import { socialFail } from '../socialValidation.js'
export const inTransaction=async(pool,run)=>{const client=await pool.connect();try{await client.query('BEGIN');const value=await run(client);await client.query('COMMIT');return value}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}}
export const socialLock=(client,key)=>client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key])
const publicCondition='u.profile_public IS DISTINCT FROM false AND NOT u.profile_admin_disabled AND u.handle IS NOT NULL'
const personColumns='u.id AS person_id,u.handle,u.display_name,u.avatar_url,('+publicCondition+') AS available'
const person=row=>({available:row.available,handle:row.available?row.handle:null,displayName:row.available?row.display_name:null,avatarUrl:row.available?row.avatar_url:null})
const lookup=async(client,handle,visible=true)=>{const r=await client.query('SELECT u.id,u.handle FROM visitor_users u WHERE lower(u.handle)=lower($1) '+(visible?'AND '+publicCondition:''),[handle]);if(!r.rowCount)socialFail('User unavailable.',404);return r.rows[0]}
const friendship=(row,userId)=>row && ['pending','accepted'].includes(row.status)?{id:row.id,status:row.status,direction:row.requester_id===userId?'outgoing':'incoming'}:null
export const createSocialStore=({pool})=>({
 getSocialState:async(userId,handle)=>{
  const target=await lookup(pool,handle);const [follow,friends,counts]=await Promise.all([
   pool.query('SELECT 1 FROM user_follows WHERE follower_id=$1 AND followed_id=$2',[userId,target.id]),
   pool.query('SELECT * FROM user_friendships WHERE user_low=LEAST($1::text,$2::text) AND user_high=GREATEST($1::text,$2::text)',[userId,target.id]),
   pool.query('SELECT (SELECT count(*)::int FROM user_follows WHERE followed_id=$1) AS followers,(SELECT count(*)::int FROM user_follows WHERE follower_id=$1) AS following',[target.id])
  ]);return {self:target.id===userId,following:Boolean(follow.rowCount),friendship:friendship(friends.rows[0],userId),followers:counts.rows[0].followers,followingCount:counts.rows[0].following}
 },
 setFollowing:async(userId,handle,following)=>{
  const target=await lookup(pool,handle,following);if(target.id===userId)socialFail('You cannot follow yourself.')
  if(following)await pool.query('INSERT INTO user_follows(follower_id,followed_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[userId,target.id]);else await pool.query('DELETE FROM user_follows WHERE follower_id=$1 AND followed_id=$2',[userId,target.id]);return {following}
 },
 removeFollowing:async(userId,targetId)=>{await pool.query('DELETE FROM user_follows WHERE follower_id=$1 AND followed_id=$2',[userId,targetId]);return {following:false}},
 requestFriend:async(userId,handle)=>inTransaction(pool,async client=>{
  const target=await lookup(client,handle);if(target.id===userId)socialFail('You cannot add yourself.')
  const pair=[userId,target.id].sort();await socialLock(client,'friend-request:'+userId);await socialLock(client,'friend-pair:'+JSON.stringify(pair))
  const current=(await client.query('SELECT * FROM user_friendships WHERE user_low=$1 AND user_high=$2 FOR UPDATE',pair)).rows[0]
  if(current && ['pending','accepted'].includes(current.status))return {friendship:friendship(current,userId)}
  if(current && Date.now()-new Date(current.updated_at).getTime()<86400000)socialFail('Wait 24 hours before sending another request.',429)
  const count=await client.query("SELECT count(*)::int AS count FROM user_friendships WHERE requester_id=$1 AND created_at>now()-interval '1 day'",[userId]);if(count.rows[0].count>=100)socialFail('Daily friend request limit reached.',429)
  const result=await client.query("INSERT INTO user_friendships(id,user_low,user_high,requester_id,status) VALUES($1,$2,$3,$4,'pending') ON CONFLICT(user_low,user_high) DO UPDATE SET id=EXCLUDED.id,requester_id=EXCLUDED.requester_id,status='pending',created_at=now(),updated_at=now() RETURNING *",[randomUUID(),...pair,userId]);return {friendship:friendship(result.rows[0],userId)}
 }),
 changeFriend:async(userId,id,action)=>inTransaction(pool,async client=>{
  const row=(await client.query('SELECT * FROM user_friendships WHERE id=$1 AND $2 IN (user_low,user_high) FOR UPDATE',[id,userId])).rows[0];if(!row)socialFail('Friend request not found.',404)
  const receiver=row.requester_id!==userId
  if(action==='accept' && receiver && row.status==='accepted')return {friendship:friendship(row,userId)}
  const allowed=(action==='accept'||action==='decline')?receiver && row.status==='pending':action==='cancel'? !receiver && row.status==='pending':action==='remove' && row.status==='accepted'
  if(!allowed)socialFail('This action is not available for this request.',409)
  const status=action==='accept'?'accepted':action==='decline'?'declined':'cancelled'
  const result=await client.query('UPDATE user_friendships SET status=$2,updated_at=now() WHERE id=$1 RETURNING *',[id,status]);return {friendship:friendship(result.rows[0],userId)}
 }),
 listConnections:async(userId,{tab,limit,offset})=>{
  const counts=(await pool.query("SELECT (SELECT count(*)::int FROM user_follows WHERE follower_id=$1) AS following,(SELECT count(*)::int FROM user_follows WHERE followed_id=$1) AS followers,count(*) FILTER(WHERE status='accepted')::int AS friends,count(*) FILTER(WHERE status='pending' AND requester_id<>$1)::int AS incoming,count(*) FILTER(WHERE status='pending' AND requester_id=$1)::int AS outgoing FROM user_friendships WHERE $1 IN(user_low,user_high)",[userId])).rows[0]
  let from,where,columns,order
  if(['following','followers'].includes(tab)){
   from='user_follows f JOIN visitor_users u ON u.id=f.'+(tab==='following'?'followed_id':'follower_id');where='f.'+(tab==='following'?'follower_id':'followed_id')+'=$1';columns='u.id AS connection_id,f.created_at';order='f.created_at DESC,u.id'
  }else{
   from='user_friendships f JOIN visitor_users u ON u.id=CASE WHEN f.user_low=$1 THEN f.user_high ELSE f.user_low END';where="$1 IN(f.user_low,f.user_high) AND f.status='"+(tab==='friends'?'accepted':'pending')+"' "+(tab==='incoming'?'AND f.requester_id<>$1':tab==='outgoing'?'AND f.requester_id=$1':'');columns='f.id AS connection_id,f.created_at,f.status,f.requester_id';order='f.updated_at DESC,f.id'
  }
  const result=await pool.query('SELECT '+personColumns+','+columns+' FROM '+from+' WHERE '+where+' ORDER BY '+order+' LIMIT $2 OFFSET $3',[userId,limit,offset]);return {counts,total:counts[tab],items:result.rows.map(row=>({id:row.connection_id,user:person(row),createdAt:row.created_at.toISOString(),friendship:friendship({...row,id:row.connection_id},userId)}))}
 },
 listPublicCreators:async({query='',limit=24,offset=0})=>{
  const where=publicCondition+' AND ($1=\'\' OR strpos(lower(u.handle),lower($1))>0 OR strpos(lower(u.display_name),lower($1))>0)'
  const total=await pool.query('SELECT count(*)::int AS count FROM visitor_users u WHERE '+where,[query])
  const result=await pool.query("SELECT u.handle,u.display_name,u.avatar_url,u.bio,u.location,(SELECT count(*)::int FROM works w WHERE w.creator_id=u.id AND w.status='published') AS work_count FROM visitor_users u WHERE "+where+' ORDER BY work_count DESC,lower(u.handle) LIMIT $2 OFFSET $3',[query,limit,offset])
  return {total:total.rows[0].count,items:result.rows.map(row=>({handle:row.handle,displayName:row.display_name,avatarUrl:row.avatar_url,bio:row.bio,location:row.location,workCount:row.work_count}))}
 },
 searchPeople:async(userId,{query,limit,offset})=>{
  const pattern=query;const where=publicCondition+' AND u.id<>$1 AND (strpos(lower(u.handle),lower($2))>0 OR strpos(lower(u.display_name),lower($2))>0)'
  const total=await pool.query('SELECT count(*)::int AS count FROM visitor_users u WHERE '+where,[userId,pattern]);const result=await pool.query('SELECT '+personColumns+' FROM visitor_users u WHERE '+where+' ORDER BY lower(u.handle),u.id LIMIT $3 OFFSET $4',[userId,pattern,limit,offset]);return {total:total.rows[0].count,items:result.rows.map(person)}
 }
})
