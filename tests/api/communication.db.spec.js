import {expect,test} from '@playwright/test'
import {spawn} from 'node:child_process'
import {createHash,randomBytes,randomUUID} from 'node:crypto'
import pg from 'pg'
import {ensureSchema} from '../../server/postgres/schema.js'
import {assertDisposableDatabaseUrl} from '../../scripts/lib/disposable-postgres.mjs'
const databaseUrl=process.env.API_TEST_DATABASE_URL || ''
test.skip(!databaseUrl,'Requires disposable database')
const base='http://127.0.0.1:4225',root='/api/account/messages/threads'
let pool,server,a,b,c
const api=async(method,path,token,body)=>{
 const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})
 return {status:r.status,data:await r.json(),cache:r.headers.get('cache-control')}
}
const user=async()=>{const id=randomUUID(),token=randomBytes(24).toString('hex'),handle='chat-'+id.slice(0,8);await pool.query("INSERT INTO visitor_users(id,email,display_name,password_hash,handle,email_verified_at) VALUES($1,$2,$3,'test',$4,now())",[id,id+'@example.test',handle,handle]);await pool.query("INSERT INTO visitor_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash('sha256').update(token).digest('hex'),id]);return {id,token,handle}}
const open=async(from=a,to=b)=>(await api('POST',root,from.token,{handle:to.handle})).data.data.thread
const send=(thread,owner=a,body='Hello',clientId=randomUUID())=>api('POST',root+'/'+thread.id+'/messages',owner.token,{body,clientId})
const action=(thread,owner,action)=>api('PATCH',root+'/'+thread.id,owner.token,{action})
const detail=(thread,owner=a,query='')=>api('GET',root+'/'+thread.id+query,owner.token)
const friends=async()=>pool.query("INSERT INTO user_friendships(id,user_low,user_high,requester_id,status) VALUES($1,LEAST($2,$3),GREATEST($2,$3),$2,'accepted')",[randomUUID(),a.id,b.id])
const follow=()=>api('PUT','/api/users/'+b.handle+'/follow',a.token,{following:true})
const publication=async(owner=b,status='published')=>{const id=randomUUID();await pool.query("INSERT INTO works(id,creator_id,slug,title,status,published_at) VALUES($1,$2,$1,$3,$4,now())",[id,owner.id,'New asset '+id,status]);return id}
test.beforeAll(async()=>{assertDisposableDatabaseUrl(databaseUrl);pool=new pg.Pool({connectionString:databaseUrl});await ensureSchema(pool);server=spawn(process.execPath,['server/index.js'],{env:{...process.env,DATABASE_URL:databaseUrl,ADMIN_TOKEN:randomBytes(24).toString('hex'),PORT:'4225',NODE_ENV:'test'},stdio:'ignore'});await expect.poll(()=>fetch(base+'/api/health').then(r=>r.status).catch(()=>0),{timeout:30000}).toBe(200)})
test.beforeEach(async()=>{a=await user();b=await user();c=await user()})
test.afterAll(async()=>{if(server){const stopped=new Promise(resolve=>server.once('exit',resolve));server.kill('SIGTERM');await stopped}await pool?.end()})
test('all private communication endpoints reject anonymous access and v1 reads stay private',async()=>{
 for(const [method,path,body] of [['GET','/api/account/communication/summary'],['GET',root],['POST',root,{handle:b.handle}],['GET',root+'/unknown'],['POST',root+'/unknown/messages',{body:'X',clientId:randomUUID()}],['PUT',root+'/unknown/read',{seq:1}],['PATCH',root+'/unknown',{action:'accept'}],['GET','/api/account/following-feed'],['PUT','/api/account/following-feed/read',{items:[{kind:'work',id:'x'}]}]])expect((await api(method,path,null,body)).status).toBe(401)
 for(const path of ['/api/v1/account/messages/threads','/api/v1/account/following-feed','/api/v1/account/communication/summary']){
  const r=await api('GET',path,a.token);expect(r.status).toBe(200);expect(r.cache).toContain('no-store');expect(Object.keys(r.data).sort()).toEqual(['data','error','pagination'])
 }
})
test('opening is canonical, self/hidden users cannot be contacted and empty requests do not appear to recipients',async()=>{
 expect((await api('POST',root,a.token,{handle:a.handle})).status).toBe(404)
 await pool.query('UPDATE visitor_users SET profile_public=false WHERE id=$1',[c.id])
 expect((await api('POST',root,a.token,{handle:c.handle})).status).toBe(404)
 const threads=await Promise.all([open(),open(),open(b,a)]);expect(new Set(threads.map(t=>t.id)).size).toBe(1)
 expect((await api('GET',root+'?tab=requests',b.token)).data.data.threads).toHaveLength(0)
})
test('strangers send exactly one request; only its receiver can accept and then both can chat',async()=>{
 const t=await open();expect(t.status).toBe('pending')
 const first=await send(t);expect(first.status).toBe(200)
 expect((await send(t,a,'Hello',first.data.data.message.clientId)).status).toBe(200)
 expect((await send(t,a,'Second')).status).toBe(403);expect((await send(t,b,'Premature reply')).status).toBe(403)
 expect((await action(t,a,'accept')).status).toBe(409);expect((await action(t,c,'accept')).status).toBe(404)
 const requests=await api('GET',root+'?tab=requests',b.token);expect(requests.data.data.threads).toHaveLength(1)
 expect((await action(t,b,'accept')).status).toBe(200);expect((await send(t,b,'Accepted reply')).status).toBe(200)
 expect((await detail(t)).data.data.messages.map(m=>m.body)).toEqual(['Hello','Accepted reply'])
})
test('friends chat immediately; simultaneous sends are sequenced and desired retries never duplicate',async()=>{
 await friends();const t=await open();expect(t.status).toBe('active')
 const key=randomUUID(),replies=await Promise.all(Array.from({length:5},()=>send(t,a,'One message',key)))
 expect(replies.every(r=>r.status===200)).toBe(true);expect(new Set(replies.map(r=>r.data.data.message.id)).size).toBe(1)
 const pair=await Promise.all([send(t,a,'A'),send(t,b,'B')]);expect(pair.every(r=>r.status===200)).toBe(true)
 expect((await detail(t)).data.data.messages.map(m=>m.seq)).toEqual([1,2,3])
 expect((await send(t,a,'Changed body',key)).status).toBe(409)
})
test('third parties cannot read, send, mark read or alter conversations; peer payloads have no internal IDs',async()=>{
 const t=await open();await send(t)
 for(const [method,suffix,body] of [['GET',''],['POST','/messages',{body:'Intrusion',clientId:randomUUID()}],['PUT','/read',{seq:1}],['PATCH','',{action:'block'}]])expect((await api(method,root+'/'+t.id+suffix,c.token,body)).status).toBe(404)
 const d=(await detail(t,b)).data.data;expect(Object.keys(d.thread.peer).sort()).toEqual(['available','avatarUrl','displayName','handle'])
 expect(d.messages[0]).not.toHaveProperty('senderId');expect(d.messages[0]).not.toHaveProperty('clientId')
})
test('unread counts and read receipts are participant-specific, bounded and monotonic',async()=>{
 await friends();const t=await open();await send(t);await send(t,a,'Again')
 expect((await api('GET','/api/account/communication/summary',b.token)).data.data.messagesUnread).toBe(2)
 expect((await api('GET','/api/account/communication/summary',a.token)).data.data.messagesUnread).toBe(0)
 expect((await api('PUT',root+'/'+t.id+'/read',b.token,{seq:999})).status).toBe(400)
 await Promise.all([api('PUT',root+'/'+t.id+'/read',b.token,{seq:2}),api('PUT',root+'/'+t.id+'/read',b.token,{seq:1})])
 expect((await detail(t,a)).data.data.thread.peerReadSeq).toBe(2)
 expect((await api('GET','/api/account/communication/summary',b.token)).data.data.messagesUnread).toBe(0)
})
test('declining stops further messages; either party can block and only that party can unblock',async()=>{
 const t=await open();await send(t);await action(t,b,'decline')
 expect((await send(t)).status).toBe(403);expect((await action(t,b,'accept')).status).toBe(200)
 await action(t,b,'block');await action(t,a,'unblock')
 expect((await send(t)).status).toBe(403);expect((await send(t,b)).status).toBe(403)
 await action(t,b,'unblock');expect((await send(t)).status).toBe(200)
 await pool.query('UPDATE visitor_users SET profile_admin_disabled=true WHERE id=$1',[b.id])
 expect((await send(t)).status).toBe(403);expect((await detail(t)).data.data.thread.peer).toMatchObject({available:false,handle:null,displayName:null})
})
test('message history uses an exclusive cursor and does not expose another thread through retry keys',async()=>{
 await friends();const t=await open(),other=await open(a,c)
 for(let n=1;n<=61;n++)await pool.query('INSERT INTO direct_messages(id,conversation_id,seq,sender_id,client_id,body) VALUES($1,$2,$3,$4,$1,$5)',[randomUUID(),t.id,n,a.id,'Message '+n])
 await pool.query('UPDATE direct_conversations SET last_seq=61 WHERE id=$1',[t.id])
 const latest=(await detail(t,b)).data.data;expect(latest.messages).toHaveLength(50);expect(latest.messages[0].seq).toBe(12);expect(latest.hasOlder).toBe(true)
 const older=(await detail(t,b,'?before=12')).data.data;expect(older.messages.map(m=>m.seq)).toEqual(Array.from({length:11},(_,i)=>i+1));expect(older.hasOlder).toBe(false)
 const key=latest.messages.at(-1).id;expect((await send(other,a,'Message 61',key)).status).toBe(409)
 expect((await detail(t,a,'?before=-1')).status).toBe(400)
})
test('validation and per-account message rate limit enforce meaningful boundaries',async()=>{
 await friends();const t=await open()
 for(const body of [{body:' ',clientId:randomUUID()},{body:'x'.repeat(4001),clientId:randomUUID()},{body:'valid',clientId:'bad'}])expect((await api('POST',root+'/'+t.id+'/messages',a.token,body)).status).toBe(400)
 for(let n=0;n<30;n++)expect((await send(t,a,'Message '+n)).status).toBe(200)
 expect((await send(t)).status).toBe(429)
})
test('following feed includes only followed visible publications and read state never hides concurrently published items',async()=>{
 await follow()
 const work=await publication(),draft=await publication(b,'draft'),unfollowed=await publication(c)
 const post=randomUUID(),notice=randomUUID(),resource=randomUUID(),pending=randomUUID()
 await pool.query("INSERT INTO community_posts(id,user_id,title,message) VALUES($1,$2,'Creator post','News from studio')",[post,b.id])
 await pool.query("INSERT INTO creator_notices(id,creator_id,body) VALUES($1,$2,'A new announcement')",[notice,b.id])
 for(const [id,status] of [[resource,'approved'],[pending,'pending']])await pool.query("INSERT INTO community_uploads(id,user_id,title,description,status,file_name,file_type,file_size,file_url) VALUES($1,$2,'Resource','A resource',$3,'x.txt','text/plain',1,'/assets/x.txt')",[id,b.id,status])
 const feed=(await api('GET','/api/account/following-feed',a.token)).data.data.items
 expect(new Set(feed.map(i=>i.kind))).toEqual(new Set(['work','post','notice','resource']))
 expect(feed.map(i=>i.id)).not.toContain(draft);expect(feed.map(i=>i.id)).not.toContain(unfollowed);expect(feed.map(i=>i.id)).not.toContain(pending)
 expect(feed.every(i=>i.unread)).toBe(true)
 expect((await api('GET','/api/account/communication/summary',a.token)).data.data.feedUnread).toBe(4)
 const newer=await publication()
 await api('PUT','/api/account/following-feed/read',a.token,{items:feed.map(i=>({kind:i.kind,id:i.id}))})
 const again=(await api('GET','/api/account/following-feed',a.token)).data.data.items
 expect(again.filter(i=>i.unread).map(i=>i.id)).toEqual([newer])
 expect((await api('GET','/api/account/following-feed?kind=work&limit=1',a.token)).data.pagination).toMatchObject({limit:1,hasNext:true})
 expect((await api('GET','/api/account/communication/summary',b.token)).data.data.feedUnread).toBe(0)
 expect(feed.find(i=>i.id===work).url).toBe('/w/'+b.handle+'/'+work)
})
test('unfollowing, private profiles/activity and removal immediately retract feed content; forged read IDs do not reserve future items',async()=>{
 await follow();const work=await publication(),post=randomUUID()
 await pool.query("INSERT INTO community_posts(id,user_id,title,message) VALUES($1,$2,'Private activity','Test')",[post,b.id])
 await pool.query('UPDATE visitor_users SET activity_public=false WHERE id=$1',[b.id])
 expect((await api('GET','/api/account/following-feed',a.token)).data.data.items.map(i=>i.id)).toEqual([work])
 const forged=randomUUID();await api('PUT','/api/account/following-feed/read',a.token,{items:[{kind:'work',id:forged}]})
 expect((await pool.query('SELECT count(*)::int AS n FROM following_feed_reads WHERE user_id=$1',[a.id])).rows[0].n).toBe(0)
 await pool.query('UPDATE visitor_users SET profile_public=false WHERE id=$1',[b.id])
 expect((await api('GET','/api/account/following-feed',a.token)).data.data.items).toEqual([])
 await pool.query('UPDATE visitor_users SET profile_public=true WHERE id=$1',[b.id]);await api('PUT','/api/users/'+b.handle+'/follow',a.token,{following:false})
 expect((await api('GET','/api/account/following-feed',a.token)).data.data.items).toEqual([])
})
test('two real browser users request, accept, exchange messages, see read receipts and follow real publications',async({playwright},info)=>{
 const browser=await playwright.chromium.launch(),contexts=[],errors=[]
 const pageFor=async user=>{const context=await browser.newContext({viewport:{width:1365,height:950},reducedMotion:'reduce'});contexts.push(context);await context.addInitScript(({token})=>{localStorage.setItem('mrright-visitor-token',token);localStorage.setItem('mrright-language','en')},{token:user.token});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));return page}
 try{
  const first=await pageFor(a),second=await pageFor(b)
  await first.goto(base+'/messages?to='+b.handle);await first.getByRole('textbox',{name:'Write a message…',exact:true}).fill('Hello from the first creator');await first.getByRole('button',{name:'Send',exact:true}).click()
  await expect(first.locator('.dm-message')).toContainText('Hello from the first creator')
  await second.goto(base+'/messages');await second.getByRole('button',{name:/Message requests/}).click();await second.locator('.dm-thread').click()
  await second.getByRole('button',{name:'Accept request',exact:true}).click()
  await second.getByRole('textbox',{name:'Write a message…',exact:true}).fill('Hello back, request accepted');await second.getByRole('button',{name:'Send',exact:true}).click()
  await expect(second.locator('.dm-message')).toHaveCount(2);await first.bringToFront();await expect(first.locator('.dm-message')).toHaveCount(2)
  await expect.poll(async()=>(await detail({id:new URL(first.url()).pathname.split('/').at(-1)},b)).data.data.thread.peerReadSeq).toBe(2)
  await first.screenshot({path:info.outputPath('real-private-chat.png'),fullPage:true,animations:'disabled'})
  await follow();const id=await publication();await first.goto(base+'/following')
  await expect(first.locator('.following-card').filter({hasText:id})).toBeVisible()
  await first.getByRole('button',{name:'Mark this page as read',exact:true}).click()
  await expect(first.locator('.following-unread')).toHaveCount(0)
  await first.screenshot({path:info.outputPath('real-following-feed.png'),fullPage:true,animations:'disabled'})
  expect(errors).toEqual([])
 }finally{for(const context of contexts)await context.close();await browser.close()}
})

test('concurrent new conversations respect the daily per-account limit',async()=>{
 for(let n=0;n<19;n++){
  const target=randomUUID()
  await pool.query("INSERT INTO visitor_users(id,email,display_name,password_hash,handle) VALUES($1,$2,'Quota target','test',$3)",[target,target+'@example.test','quota-'+target.slice(0,8)])
  await pool.query('INSERT INTO direct_conversations(id,user_low,user_high,requester_id) VALUES($1,LEAST($2,$3),GREATEST($2,$3),$2)',[randomUUID(),a.id,target])
 }
 const outcomes=await Promise.all([api('POST',root,a.token,{handle:b.handle}),api('POST',root,a.token,{handle:c.handle})])
 expect(outcomes.map(r=>r.status).sort()).toEqual([200,429])
 expect((await pool.query('SELECT count(*)::int AS n FROM direct_conversations WHERE requester_id=$1',[a.id])).rows[0].n).toBe(20)
})
