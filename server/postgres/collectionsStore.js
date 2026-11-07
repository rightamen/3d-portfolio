import { randomUUID } from 'node:crypto'
import { socialFail } from '../socialValidation.js'
import { inTransaction,socialLock } from './socialStore.js'
const map=row=>({id:row.id,name:row.name,description:row.description,count:row.count || 0,createdAt:row.created_at.toISOString()})
export const createCollectionsStore=({pool})=>({
 listCollections:async userId=>{const r=await pool.query('SELECT c.*,count(i.work_id)::int AS count FROM favorite_collections c LEFT JOIN favorite_collection_items i ON i.collection_id=c.id WHERE c.user_id=$1 GROUP BY c.id ORDER BY c.created_at,c.id',[userId]);return r.rows.map(map)},
 createCollection:async(userId,{name,description})=>inTransaction(pool,async client=>{
  await socialLock(client,'collections:'+userId);const count=await client.query('SELECT count(*)::int AS count FROM favorite_collections WHERE user_id=$1',[userId]);if(count.rows[0].count>=50)socialFail('Maximum 50 folders per account.',409)
  const r=await client.query('INSERT INTO favorite_collections(id,user_id,name,description) VALUES($1,$2,$3,$4) RETURNING *',[randomUUID(),userId,name,description]);return map(r.rows[0])
 }),
 updateCollection:async(userId,id,{name,description})=>{const r=await pool.query('UPDATE favorite_collections SET name=$3,description=$4,updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING *',[id,userId,name,description]);if(!r.rowCount)socialFail('Folder not found.',404);return map(r.rows[0])},
 deleteCollection:async(userId,id)=>{const r=await pool.query('DELETE FROM favorite_collections WHERE id=$1 AND user_id=$2 RETURNING id',[id,userId]);if(!r.rowCount)socialFail('Folder not found.',404);return {deleted:true}},
 getCollectionMemberships:async(userId,workId)=>{const r=await pool.query('SELECT c.id,EXISTS(SELECT 1 FROM favorite_collection_items i WHERE i.collection_id=c.id AND i.work_id=$2) AS included FROM favorite_collections c WHERE c.user_id=$1 ORDER BY c.created_at,c.id',[userId,workId]);return r.rows},
 setCollectionItem:async(userId,id,workId,included)=>inTransaction(pool,async client=>{
  const c=await client.query('SELECT id FROM favorite_collections WHERE id=$1 AND user_id=$2 FOR UPDATE',[id,userId]);if(!c.rowCount)socialFail('Folder not found.',404)
  if(included){
   const f=await client.query('SELECT work_id FROM work_favorites WHERE user_id=$1 AND work_id=$2 FOR KEY SHARE',[userId,workId]);if(!f.rowCount)socialFail('Save this work before organizing it.',404)
   await client.query('INSERT INTO favorite_collection_items(collection_id,user_id,work_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[id,userId,workId])
  }else await client.query('DELETE FROM favorite_collection_items WHERE collection_id=$1 AND user_id=$2 AND work_id=$3',[id,userId,workId])
  return {included}
 })
})
