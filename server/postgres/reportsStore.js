import { randomUUID } from 'node:crypto'
import { socialFail } from '../socialValidation.js'
import { inTransaction,socialLock } from './socialStore.js'
const targetQueries={
 user:"SELECT id,display_name AS label,handle AS slug FROM visitor_users WHERE lower(handle)=lower($1) AND profile_public IS DISTINCT FROM false AND NOT profile_admin_disabled",
 work:"SELECT w.id,w.title AS label,w.slug,u.handle FROM works w JOIN visitor_users u ON u.id=w.creator_id WHERE w.id=$1 AND w.status='published'",
 post:'SELECT id,title AS label FROM community_posts WHERE id=$1',
 comment:'SELECT c.id,c.message AS label,c.post_id FROM community_comments c JOIN community_posts p ON p.id=c.post_id WHERE c.id=$1',
 workComment:"SELECT c.id,c.message AS label,w.slug,u.handle FROM work_comments c JOIN works w ON w.id=c.work_id JOIN visitor_users u ON u.id=w.creator_id WHERE c.id=$1 AND c.status='published' AND w.status='published'",
 resource:"SELECT id,title AS label FROM community_uploads WHERE id=$1 AND status='approved'"
}
const map=row=>({id:row.id,targetType:row.target_type,targetLabel:row.target_label,targetUrl:row.target_url,reason:row.reason,details:row.details,status:row.status,resolution:row.resolution,createdAt:row.created_at.toISOString(),updatedAt:row.updated_at.toISOString()})
export const createReportsStore=({pool})=>({
 createReport:async(userId,input)=>inTransaction(pool,async client=>{
  const target=(await client.query(targetQueries[input.targetType],[input.targetId])).rows[0];if(!target)socialFail('Reported content is unavailable.',404)
  if(input.targetType==='user' && target.id===userId)socialFail('You cannot report yourself.')
  await socialLock(client,'reports:'+userId)
  const existing=await client.query("SELECT * FROM user_reports WHERE reporter_id=$1 AND target_type=$2 AND target_id=$3 AND status='open'",[userId,input.targetType,target.id]);if(existing.rowCount)return map(existing.rows[0])
  const count=await client.query("SELECT count(*)::int AS count FROM user_reports WHERE reporter_id=$1 AND created_at>now()-interval '1 day'",[userId]);if(count.rows[0].count>=20)socialFail('Daily report limit reached.',429)
  const url=input.targetType==='user'?'/u/'+encodeURIComponent(target.slug):['work','workComment'].includes(input.targetType)?'/w/'+encodeURIComponent(target.handle)+'/'+encodeURIComponent(target.slug):input.targetType==='post'?'/community/'+encodeURIComponent(target.id):input.targetType==='comment'?'/community/'+encodeURIComponent(target.post_id):'/community'
  const r=await client.query('INSERT INTO user_reports(id,reporter_id,target_type,target_id,target_label,target_url,reason,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[randomUUID(),userId,input.targetType,target.id,String(target.label || '').slice(0,160),url,input.reason,input.details]);return map(r.rows[0])
 }),
 listReports:async(userId,{status,limit,offset,admin=false})=>{
  const params=admin?[status]:[userId];const where=admin?'($1::text IS NULL OR r.status=$1)':'r.reporter_id=$1'
  const total=await pool.query('SELECT count(*)::int AS count FROM user_reports r WHERE '+where,params)
  const rows=await pool.query('SELECT r.* FROM user_reports r WHERE '+where+' ORDER BY r.created_at DESC,r.id LIMIT $2 OFFSET $3',[...params,limit,offset]);return {total:total.rows[0].count,items:rows.rows.map(map)}
 },
 resolveReport:async(id,adminId,{status,resolution})=>{
  const r=await pool.query("UPDATE user_reports SET status=$2,resolution=$3,resolved_by=$4,updated_at=now() WHERE id=$1 AND status='open' RETURNING *",[id,status,resolution,adminId]);if(!r.rowCount)socialFail('This report was already handled or is unavailable.',409);return map(r.rows[0])
 }
})
