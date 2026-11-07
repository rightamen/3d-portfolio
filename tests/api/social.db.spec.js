import { expect,test } from '@playwright/test'
import { spawn } from 'node:child_process'
import { createHash,randomBytes,randomUUID } from 'node:crypto'
import pg from 'pg'
import { ensureSchema } from '../../server/postgres/schema.js'
import { assertDisposableDatabaseUrl } from '../../scripts/lib/disposable-postgres.mjs'
const databaseUrl=process.env.API_TEST_DATABASE_URL || ''
test.skip(!databaseUrl,'Requires disposable database')
const base='http://127.0.0.1:4209',adminToken=randomBytes(24).toString('hex')
let pool,server,a,b,c,work,draft
const api=async(method,path,token,body)=>{const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json(),cache:r.headers.get('cache-control')}}
const user=async()=>{const id=randomUUID(),token=randomBytes(24).toString('hex'),handle='person-'+id.slice(0,8);await pool.query("INSERT INTO visitor_users(id,email,display_name,password_hash,handle,email_verified_at) VALUES($1,$2,'Social creator','test',$3,now())",[id,id+'@example.test',handle]);await pool.query("INSERT INTO visitor_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash('sha256').update(token).digest('hex'),id]);return {id,token,handle}}
const makeWork=async(status='published')=>{const id=randomUUID();await pool.query('INSERT INTO works(id,creator_id,slug,title,status,image,thumbnail) VALUES($1,$2,$3,$4,$5,$6,$6)',[id,a.id,'social-'+id,'Social asset',status,'/assets/projects/fire-extinguisher.png']);return {id,path:'/api/works/'+a.handle+'/social-'+id}}
const folder=async(owner=a,name='Ideas')=>(await api('POST','/api/account/collections',owner.token,{name,description:'Private inspiration'})).data.data.collection
const request=async(from=a,to=b)=>api('PUT','/api/users/'+to.handle+'/friend',from.token,{})
const follow=async(from=a,to=b,following=true)=>api('PUT','/api/users/'+to.handle+'/follow',from.token,{following})
test.beforeAll(async()=>{assertDisposableDatabaseUrl(databaseUrl);pool=new pg.Pool({connectionString:databaseUrl});await ensureSchema(pool);server=spawn(process.execPath,['server/index.js'],{env:{...process.env,DATABASE_URL:databaseUrl,ADMIN_TOKEN:adminToken,PORT:'4209',NODE_ENV:'test'},stdio:'ignore'});await expect.poll(()=>fetch(base+'/api/health').then(r=>r.status).catch(()=>0),{timeout:30000}).toBe(200)})
test.beforeEach(async()=>{a=await user();b=await user();c=await user();work=await makeWork();draft=await makeWork('draft')})
test.afterAll(async()=>{if(server){const stopped=new Promise(resolve=>server.once('exit',resolve));server.kill('SIGTERM');await stopped}await pool?.end()})
test('all social, report and folder routes require current visitor auth; admin queue rejects visitors',async()=>{
 for(const [method,path,body] of [['GET','/api/users/'+b.handle+'/relationship'],['PUT','/api/users/'+b.handle+'/follow',{following:true}],['PUT','/api/users/'+b.handle+'/friend',{}],['PATCH','/api/account/friends/x',{action:'accept'}],['GET','/api/account/connections'],['GET','/api/account/people?q=person'],['GET','/api/account/collections'],['POST','/api/account/collections',{name:'X'}],['GET','/api/account/reports'],['POST','/api/reports',{targetType:'work',targetId:work.id,reason:'spam'}]])expect((await api(method,path,null,body)).status).toBe(401)
 expect((await api('GET','/api/admin/reports',a.token)).status).toBe(401)
})
test('concurrent desired-state follows are unique, reversible and do not create friends',async()=>{
 const r=await Promise.all(Array.from({length:5},()=>follow()));expect(r.every(x=>x.status===200)).toBe(true)
 const state=await api('GET','/api/users/'+b.handle+'/relationship',a.token);expect(state.data.data).toMatchObject({following:true,friendship:null,followers:1});expect(state.cache).toContain('no-store')
 expect((await follow(a,a)).status).toBe(400)
 await follow(a,b,false);await follow(a,b,false);expect((await pool.query('SELECT count(*)::int AS n FROM user_follows WHERE follower_id=$1',[a.id])).rows[0].n).toBe(0)
})
test('crossed friend requests never auto-accept; only recipient can accept, outsiders cannot mutate',async()=>{
 const r=await Promise.all([request(a,b),request(b,a),request(a,b)]);expect(r.every(x=>x.status===200)).toBe(true)
 const row=(await pool.query('SELECT * FROM user_friendships WHERE user_low=LEAST($1::text,$2::text) AND user_high=GREATEST($1::text,$2::text)',[a.id,b.id])).rows[0];expect(row.status).toBe('pending')
 const sender=row.requester_id===a.id?a:b,receiver=sender===a?b:a
 expect((await api('PATCH','/api/account/friends/'+row.id,sender.token,{action:'accept'})).status).toBe(409)
 expect((await api('PATCH','/api/account/friends/'+row.id,c.token,{action:'accept'})).status).toBe(404)
 expect((await api('PATCH','/api/account/friends/'+row.id,receiver.token,{action:'accept'})).data.data.friendship.status).toBe('accepted')
 expect((await api('PATCH','/api/account/friends/'+row.id,receiver.token,{action:'accept'})).status).toBe(200)
 for(const person of [a,b])expect((await api('GET','/api/account/connections?tab=friends',person.token)).data.data.connections).toHaveLength(1)
 expect((await api('PATCH','/api/account/friends/'+row.id,a.token,{action:'remove'})).status).toBe(200)
 expect((await request()).status).toBe(429)
})
test('requests can be declined or cancelled without affecting follows; private profiles are hidden and cannot be targeted',async()=>{
 await follow();let r=await request();let id=r.data.data.friendship.id;expect((await api('PATCH','/api/account/friends/'+id,b.token,{action:'decline'})).status).toBe(200)
 r=await request(a,c);id=r.data.data.friendship.id;expect((await api('PATCH','/api/account/friends/'+id,a.token,{action:'cancel'})).status).toBe(200)
 await pool.query('UPDATE visitor_users SET profile_public=false,display_name=$2 WHERE id=$1',[b.id,'PRIVATE_SOCIAL_NAME'])
 const following=await api('GET','/api/account/connections?tab=following',a.token);expect(following.data.data.connections[0].user).toMatchObject({available:false,handle:null,displayName:null});expect(JSON.stringify(following.data)).not.toContain('PRIVATE_SOCIAL_NAME')
 const people=await api('GET','/api/account/people?q='+b.handle,a.token);expect(people.data.data.people).toEqual([])
 expect((await request()).status).toBe(404);expect((await follow()).status).toBe(404)
 expect((await api('DELETE','/api/account/following/'+b.id,a.token)).status).toBe(200)
})
test('folder names and ownership are validated; collection filters never disclose other accounts',async()=>{
 const x=await folder();expect((await api('POST','/api/account/collections',a.token,{name:'ideas'})).status).toBe(409)
 expect((await api('POST','/api/account/collections',a.token,{name:' '.repeat(3)})).status).toBe(400)
 expect((await api('PATCH','/api/account/collections/'+x.id,b.token,{name:'Stolen'})).status).toBe(404)
 expect((await api('DELETE','/api/account/collections/'+x.id,b.token)).status).toBe(404)
 expect((await api('GET','/api/account/favorites?collection='+x.id,b.token)).status).toBe(404)
 expect((await api('PUT','/api/account/collections/'+x.id+'/works/'+work.id,b.token,{included:true})).status).toBe(404)
 const list=await api('GET','/api/account/collections',b.token);expect(list.data.data.collections).toEqual([]);expect(list.cache).toContain('no-store')
})
test('a saved work can belong to several folders; deleting folders retains favorites; unsaving cascades memberships',async()=>{
 const x=await folder(a,'Characters'),y=await folder(a,'Reference')
 expect((await api('PUT','/api/account/collections/'+x.id+'/works/'+work.id,a.token,{included:true})).status).toBe(404)
 await api('PUT',work.path+'/favorite',a.token,{saved:true})
 for(const f of [x,y]){const replies=await Promise.all(Array.from({length:3},()=>api('PUT','/api/account/collections/'+f.id+'/works/'+work.id,a.token,{included:true})));expect(replies.every(r=>r.status===200)).toBe(true)}
 const selected=await api('GET','/api/account/favorites?collection='+x.id,a.token);expect(selected.data.data.favorites.map(i=>i.workId)).toEqual([work.id])
 await api('DELETE','/api/account/collections/'+x.id,a.token);expect((await api('GET',work.path+'/favorite',a.token)).data.data.saved).toBe(true)
 await api('DELETE','/api/account/favorites/'+work.id,a.token);expect((await pool.query('SELECT count(*)::int AS n FROM favorite_collection_items WHERE user_id=$1',[a.id])).rows[0].n).toBe(0)
})
test('hidden saved works stay redacted inside a folder and old favorites survive additive migration',async()=>{
 const x=await folder();await api('PUT',work.path+'/favorite',a.token,{saved:true});await api('PUT','/api/account/collections/'+x.id+'/works/'+work.id,a.token,{included:true})
 await pool.query("UPDATE works SET status='draft',title='PRIVATE_DRAFT' WHERE id=$1",[work.id]);await ensureSchema(pool);await ensureSchema(pool)
 const list=await api('GET','/api/account/favorites?collection='+x.id,a.token);expect(list.data.data.favorites[0]).toMatchObject({available:false,work:null});expect(JSON.stringify(list.data)).not.toContain('PRIVATE_DRAFT')
})
test('reports validate public targets, deduplicate open submissions and keep reporter lists private',async()=>{
 for(const input of [{targetType:'work',targetId:draft.id,reason:'spam'},{targetType:'user',targetId:a.handle,reason:'spam'}])expect([400,404]).toContain((await api('POST','/api/reports',a.token,input)).status)
 expect((await api('POST','/api/reports',a.token,{targetType:'work',targetId:work.id,reason:'other',details:'short'})).status).toBe(400)
 const input={targetType:'work',targetId:work.id,reason:'copyright',details:'Original source and evidence'};const replies=await Promise.all(Array.from({length:4},()=>api('POST','/api/reports',b.token,input)));expect(replies.every(r=>r.status===200)).toBe(true);expect(new Set(replies.map(r=>r.data.data.report.id)).size).toBe(1)
 const mine=await api('GET','/api/account/reports',b.token);expect(mine.data.data.reports).toHaveLength(1);expect(mine.cache).toContain('no-store');expect((await api('GET','/api/account/reports',c.token)).data.data.reports).toEqual([])
})
test('admin resolution records a visible result but never changes content; duplicate decisions conflict',async()=>{
 const r=await api('POST','/api/reports',b.token,{targetType:'work',targetId:work.id,reason:'spam'});const id=r.data.data.report.id
 const queue=await api('GET','/api/admin/reports?status=open',adminToken);expect(queue.data.data.reports.some(x=>x.id===id)).toBe(true)
 expect((await api('PATCH','/api/admin/reports/'+id,b.token,{status:'resolved',resolution:'no'})).status).toBe(401)
 expect((await api('PATCH','/api/admin/reports/'+id,adminToken,{status:'resolved',resolution:'Reviewed by moderator'})).status).toBe(200)
 expect((await api('PATCH','/api/admin/reports/'+id,adminToken,{status:'dismissed',resolution:'stale'})).status).toBe(409)
 const mine=await api('GET','/api/account/reports',b.token);expect(mine.data.data.reports[0]).toMatchObject({status:'resolved',resolution:'Reviewed by moderator'})
 expect((await pool.query('SELECT status FROM works WHERE id=$1',[work.id])).rows[0].status).toBe('published')
})
test('v1 social and collection endpoints keep strict envelopes and pagination',async()=>{
 await follow();const r=await api('GET','/api/v1/account/connections?tab=following&limit=1',a.token);expect(r.status).toBe(200);expect(Object.keys(r.data).sort()).toEqual(['data','error','pagination']);expect(r.data.pagination).toMatchObject({total:1,limit:1,hasNext:false})
 expect((await api('GET','/api/account/connections?tab=constructor',a.token)).status).toBe(400)
 expect((await api('GET','/api/account/people?q=_',a.token)).status).toBe(400)
})

test('folder quota is atomic under concurrent creates and composite foreign keys enforce ownership',async()=>{
 await pool.query("INSERT INTO favorite_collections(id,user_id,name) SELECT $1||g,$2,'Folder '||g FROM generate_series(1,49) g",[randomUUID(),a.id])
 const responses=await Promise.all([api('POST','/api/account/collections',a.token,{name:'Last A'}),api('POST','/api/account/collections',a.token,{name:'Last B'})]);expect(responses.map(x=>x.status).sort()).toEqual([200,409])
 const foreign=await folder(b);await api('PUT',work.path+'/favorite',a.token,{saved:true})
 await expect(pool.query('INSERT INTO favorite_collection_items(collection_id,user_id,work_id) VALUES($1,$2,$3)',[foreign.id,a.id,work.id])).rejects.toMatchObject({code:'23503'})
})
test('literal people search does not interpret percent or underscore as wildcards; report quotas are per account',async()=>{
 expect((await api('GET','/api/account/people?q='+encodeURIComponent('%%'),a.token)).data.data.people).toEqual([])
 expect((await api('GET','/api/account/people?q='+encodeURIComponent('__'),a.token)).data.data.people).toEqual([])
 await pool.query("INSERT INTO user_reports(id,reporter_id,target_type,target_id,target_label,target_url,reason,status) SELECT $1||g,$2,'post','past-'||g,'Past post','/community','spam','resolved' FROM generate_series(1,20) g",[randomUUID(),b.id])
 expect((await api('POST','/api/reports',b.token,{targetType:'work',targetId:work.id,reason:'spam'})).status).toBe(429)
 expect((await api('POST','/api/reports',c.token,{targetType:'work',targetId:work.id,reason:'spam'})).status).toBe(200)
})
test('reports support approved resources, public posts and comments but reject hidden comment/resource content',async()=>{
 const post=randomUUID(),comment=randomUUID(),resource=randomUUID(),wc=randomUUID()
 await pool.query("INSERT INTO community_posts(id,user_id,title,message) VALUES($1,$2,'Post','Public text')",[post,a.id])
 await pool.query("INSERT INTO community_comments(id,post_id,user_id,author,message) VALUES($1,$2,$3,'Author','Comment')",[comment,post,a.id])
 await pool.query("INSERT INTO community_uploads(id,user_id,status,title,description,file_name,file_type,file_size,file_url) VALUES($1,$2,'approved','Resource','Public resource','mesh.zip','application/zip',1,'/test-only.zip')",[resource,a.id])
 await pool.query("INSERT INTO work_comments(id,work_id,user_id,author,message,status) VALUES($1,$2,$3,'Author','Public comment','published')",[wc,work.id,a.id])
 for(const [targetType,targetId] of [['post',post],['comment',comment],['resource',resource],['workComment',wc],['user',a.handle]])expect((await api('POST','/api/reports',b.token,{targetType,targetId,reason:'spam'})).status).toBe(200)
 await pool.query("UPDATE community_uploads SET status='pending' WHERE id=$1",[resource]);await pool.query("UPDATE work_comments SET status='hidden' WHERE id=$1",[wc])
 for(const [targetType,targetId] of [['resource',resource],['workComment',wc]])expect((await api('POST','/api/reports',c.token,{targetType,targetId,reason:'spam'})).status).toBe(404)
})
test('real separate creators follow, accept friendship, organize a saved work and track a moderator decision',async({playwright},info)=>{
 const browser=await playwright.chromium.launch({headless:true}),contexts=[],errors=[]
 const pageFor=async(user,admin=false)=>{const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});contexts.push(context);await context.addInitScript(({token,admin})=>{localStorage.setItem(admin?'mrright-admin-token':'mrright-visitor-token',token);localStorage.setItem('mrright-language','en');localStorage.setItem('mrright-admin-language','en')},{token:admin?adminToken:user.token,admin});const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(15000);return page}
 try{
  const maker=await pageFor(a),fan=await pageFor(b),moderator=await pageFor(null,true)
  console.log('[social-journey] discover creator, follow and request')
  await maker.goto(base+'/creators?q='+b.handle);await expect(maker.locator('.creator-directory-card')).toHaveCount(1);await maker.getByRole('button',{name:'Follow',exact:true}).click();await expect(maker.getByRole('button',{name:'Unfollow',exact:true})).toBeEnabled();await maker.getByRole('button',{name:'Add friend',exact:true}).click();await expect(maker.getByRole('button',{name:'Cancel request',exact:true})).toBeEnabled()
  console.log('[social-journey] accept in second context')
  await fan.goto(base+'/account/connections');await fan.getByRole('button',{name:/Received requests/}).click();await fan.getByRole('button',{name:'Accept request',exact:true}).click();await fan.getByRole('button',{name:/^Friends/}).click();await expect(fan.locator('.social-person')).toHaveCount(1)
  console.log('[social-journey] create and assign folder')
  await api('PUT',work.path+'/favorite',b.token,{saved:true});await fan.goto(base+'/account/favorites');await fan.getByRole('button',{name:/Manage folders/}).click();await fan.getByRole('button',{name:'Create folder',exact:true}).click();let dialog=fan.getByRole('dialog');await dialog.getByLabel('Folder name',{exact:true}).fill('Real references');await dialog.getByRole('button',{name:'Save folder',exact:true}).click();await expect(fan.locator('.collection-folder')).toHaveCount(1)
  await fan.getByRole('button',{name:'Organize into folders',exact:true}).click();dialog=fan.getByRole('dialog');await dialog.getByRole('checkbox',{name:'Real references',exact:true}).click();await expect(dialog.getByRole('checkbox')).toBeChecked();await expect(dialog.getByRole('checkbox')).toBeEnabled();await fan.keyboard.press('Escape');await fan.locator('.collection-open').click();await expect(fan.locator('.creator-saved-item')).toHaveCount(1)
  console.log('[social-journey] submit report')
  const url=work.path.replace('/api/works/','/w/');await fan.goto(base+url);await fan.getByRole('button',{name:'Report',exact:true}).click();dialog=fan.getByRole('dialog');const evidence='Real browser evidence '+work.id;await dialog.getByLabel('Details and evidence references',{exact:true}).fill(evidence);await dialog.getByRole('button',{name:'Submit report',exact:true}).click();await expect(dialog.getByRole('status')).toBeVisible()
  console.log('[social-journey] moderator decision')
  await moderator.goto(base+'/admin',{waitUntil:'domcontentloaded'});await moderator.locator('.admin-sidebar').getByRole('button',{name:'Reports',exact:true}).click()
  const card=moderator.locator('.social-report-card').filter({hasText:evidence});await expect(card).toBeVisible();await moderator.screenshot({path:info.outputPath('admin-reports.png'),animations:'disabled',fullPage:true})
  await card.getByLabel('Resolution visible to reporter',{exact:true}).fill('Reviewed in real moderator interface');await card.getByRole('button',{name:'Resolve',exact:true}).click();await expect(card).toHaveCount(0)
  console.log('[social-journey] reporter result')
  await fan.goto(base+'/account/reports');await expect(fan.locator('.social-report-card').filter({hasText:evidence})).toContainText('Reviewed in real moderator interface');await fan.screenshot({path:info.outputPath('real-social-reports.png'),animations:'disabled',fullPage:true});expect(errors).toEqual([])
 }finally{console.log('[social-journey] closing contexts');for(const context of contexts)await context.close();await browser.close()}
})

test('new friend requests after cooldown replace the old request identity, so stale actions cannot accept them',async()=>{
 const first=(await request()).data.data.friendship.id
 await api('PATCH','/api/account/friends/'+first,b.token,{action:'decline'})
 await pool.query("UPDATE user_friendships SET updated_at=now()-interval '25 hours' WHERE id=$1",[first])
 const second=(await request()).data.data.friendship.id;expect(second).not.toBe(first)
 expect((await api('PATCH','/api/account/friends/'+first,b.token,{action:'accept'})).status).toBe(404)
 expect((await api('PATCH','/api/account/friends/'+second,b.token,{action:'accept'})).status).toBe(200)
})

test('public creator discovery exposes only public fields, counts published works, and paginates without login',async()=>{
 await pool.query("UPDATE visitor_users SET profile_public=false WHERE id=$1",[b.id])
 await pool.query("UPDATE visitor_users SET profile_admin_disabled=true WHERE id=$1",[c.id])
 const found=await api('GET','/api/creators?q='+a.handle)
 expect(found.status).toBe(200)
 expect(found.data.data.creators).toHaveLength(1)
 const creator=found.data.data.creators[0]
 expect(Object.keys(creator).sort()).toEqual(['avatarUrl','bio','displayName','handle','location','workCount'])
 expect(creator).toMatchObject({handle:a.handle,workCount:1})
 for(const hidden of [b,c])expect((await api('GET','/api/creators?q='+hidden.handle)).data.data.creators).toEqual([])
 expect((await api('GET','/api/creators?q=%25')).data.data.creators).toEqual([])
 const paged=await api('GET','/api/v1/creators?limit=1&page=2')
 expect(paged.status).toBe(200);expect(paged.data.data.creators).toHaveLength(1)
 expect(paged.data.pagination).toMatchObject({page:2,limit:1})
 expect((await api('GET','/api/creators?q='+encodeURIComponent('x'.repeat(61)))).status).toBe(400)
})
