import { expect, test } from '@playwright/test'
import { spawn } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import pg from 'pg'
import { ensureSchema } from '../../server/postgres/schema.js'
import { createCreatorStore } from '../../server/postgres/creatorStore.js'
import { assertDisposableDatabaseUrl } from '../../scripts/lib/disposable-postgres.mjs'

const databaseUrl=process.env.API_TEST_DATABASE_URL || ''
test.skip(!databaseUrl,'Requires the disposable database runner')
const base='http://127.0.0.1:4200'
let pool,server,store,owner,other,fan,work,draft,foreignWork
const api=async(method,path,token,body)=>{
  const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})
  return {status:response.status,payload:await response.json(),cache:response.headers.get('cache-control')}
}
const makeUser=async()=>{
  const id=randomUUID(),token=randomBytes(24).toString('hex'),handle='studio-'+id.slice(0,8)
  await pool.query(`INSERT INTO visitor_users(id,email,display_name,password_hash,handle,email_verified_at) VALUES($1,$2,'Studio creator','test-only',$3,now())`,[id,id+'@example.test',handle])
  await pool.query(`INSERT INTO visitor_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')`,[createHash('sha256').update(token).digest('hex'),id])
  return {id,token,handle}
}
const makeWork=async(user,status='published')=>{
  const id=randomUUID(),slug='asset-'+id
  await pool.query(`INSERT INTO works(id,creator_id,slug,title,status,image,thumbnail,published_at) VALUES($1,$2,$3,$4,$5,'/assets/projects/fire-extinguisher.png','/assets/projects/fire-extinguisher.png',now())`,[id,user.id,slug,'Studio '+status,status])
  return {id,path:'/api/works/'+user.handle+'/'+slug,url:'/w/'+user.handle+'/'+slug}
}
const favorite=(item=work,user=fan)=>api('PUT',item.path+'/favorite',user.token,{saved:true})
const analytics=(user=owner,query='')=>api('GET','/api/account/analytics?days=7'+query,user.token)

test.beforeAll(async()=>{
  assertDisposableDatabaseUrl(databaseUrl)
  pool=new pg.Pool({connectionString:databaseUrl});await ensureSchema(pool)
  store=createCreatorStore({pool})
  server=spawn(process.execPath,['server/index.js'],{env:{...process.env,DATABASE_URL:databaseUrl,ADMIN_TOKEN:randomBytes(24).toString('hex'),PORT:'4200',NODE_ENV:'test'},stdio:'ignore'})
  await expect.poll(()=>fetch(base+'/api/health').then(r=>r.status).catch(()=>0),{timeout:30000}).toBe(200)
})
test.beforeEach(async()=>{owner=await makeUser();other=await makeUser();fan=await makeUser();work=await makeWork(owner);draft=await makeWork(owner,'draft');foreignWork=await makeWork(other)})
test.afterAll(async()=>{if(server){const stopped=new Promise(resolve=>server.once('exit',resolve));server.kill('SIGTERM');await stopped}await pool?.end()})

test('all analytics and collection routes require a visitor session',async()=>{
  for(const [method,path,body] of [['GET','/api/account/analytics'],['GET','/api/account/favorites'],['DELETE','/api/account/favorites/'+work.id],['GET',work.path+'/favorite'],['PUT',work.path+'/favorite',{saved:true}]]) {
    expect((await api(method,path,null,body)).status).toBe(401)
    expect((await api(method,path,'invalid-session',body)).status).toBe(401)
  }
})
test('explicit concurrent saves are unique and repeat-safe, account removal is isolated',async()=>{
  const results=await Promise.all(Array.from({length:5},()=>favorite()))
  expect(results.every(r=>r.status===200 && r.payload.data.saved)).toBe(true)
  const savedAt=(await pool.query('SELECT created_at FROM work_favorites WHERE work_id=$1 AND user_id=$2',[work.id,fan.id])).rows[0].created_at
  await favorite()
  const rows=await pool.query('SELECT created_at FROM work_favorites WHERE work_id=$1 AND user_id=$2',[work.id,fan.id])
  expect(rows.rowCount).toBe(1);expect(rows.rows[0].created_at).toEqual(savedAt)
  expect((await api('GET',work.path+'/favorite',other.token)).payload.data.saved).toBe(false)
  await api('DELETE','/api/account/favorites/'+work.id,other.token)
  expect((await api('GET',work.path+'/favorite',fan.token)).payload.data.saved).toBe(true)
  await api('DELETE','/api/account/favorites/'+work.id,fan.token)
  await api('DELETE','/api/account/favorites/'+work.id,fan.token)
  expect((await api('GET',work.path+'/favorite',fan.token)).payload.data.saved).toBe(false)
})
test('drafts and hidden works cannot be saved, and malformed state is rejected',async()=>{
  expect((await favorite(draft,owner)).status).toBe(404)
  expect((await api('PUT',work.path+'/favorite',fan.token,{saved:'true'})).status).toBe(400)
  await pool.query("UPDATE works SET status='hidden' WHERE id=$1",[work.id])
  expect((await favorite()).status).toBe(404)
})
test('private paginated collection keeps unavailable entries without leaking unpublished content',async()=>{
  await favorite();await favorite(foreignWork)
  const first=await api('GET','/api/account/favorites?limit=1',fan.token)
  expect(first.payload.pagination).toMatchObject({total:2,limit:1,hasNext:true})
  const second=await api('GET','/api/account/favorites?limit=1&page=2',fan.token)
  expect(first.payload.data.favorites[0].workId).not.toBe(second.payload.data.favorites[0].workId)
  await pool.query("UPDATE works SET status='draft',title='PRIVATE_UNPUBLISHED_TITLE',summary='PRIVATE_CONTENT' WHERE id=$1",[work.id])
  const result=await api('GET','/api/account/favorites',fan.token)
  expect(result.payload.data.favorites.find(item=>item.workId===work.id)).toMatchObject({available:false,work:null})
  expect(JSON.stringify(result.payload)).not.toContain('PRIVATE_')
  expect((await api('GET','/api/account/favorites?userId='+fan.id,other.token)).payload.data.favorites).toEqual([])
  expect(result.cache).toContain('no-store')
  await api('DELETE','/api/account/favorites/'+work.id,fan.token)
  expect((await api('GET','/api/account/favorites',fan.token)).payload.pagination.total).toBe(1)
})
test('creator aggregates use only owned works and preserve currency and current-version rules',async()=>{
  await favorite();await favorite(work,other);await favorite(foreignWork)
  await pool.query(`INSERT INTO work_likes(work_id,visitor_id,user_id) VALUES($1,'first',$2),($1,'second',$3),($4,'foreign',$2)`,[work.id,fan.id,other.id,foreignWork.id])
  await pool.query(`INSERT INTO work_comments(id,work_id,user_id,author,message,status) VALUES($1,$2,$3,'Fan','Visible','published'),($4,$2,$3,'Fan','Hidden','hidden')`,[randomUUID(),work.id,fan.id,randomUUID()])
  await pool.query(`INSERT INTO work_ratings(work_id,user_id,score,recommended,work_version) VALUES($1,$2,4,true,1),($1,$3,5,true,1),($1,$4,5,true,1)`,[work.id,fan.id,other.id,owner.id])
  for(const [id,creatorId,workId,status,currency,amount] of [
    [randomUUID(),owner.id,work.id,'paid','usd',1500],[randomUUID(),owner.id,work.id,'paid','cny',6000],
    [randomUUID(),owner.id,work.id,'pending','usd',1000],[randomUUID(),owner.id,work.id,'refunded','usd',2500],
    [randomUUID(),other.id,foreignWork.id,'paid','usd',99999],
  ]) await pool.query('INSERT INTO orders(id,creator_id,work_id,status,currency,amount_cents) VALUES($1,$2,$3,$4,$5,$6)',[id,creatorId,workId,status,currency,amount])
  for(const target of ['work:'+work.id,'work:'+work.id,'work:'+foreignWork.id,work.id]) await pool.query("INSERT INTO download_events(id,project_slug,actor) VALUES($1,$2,'visitor')",[randomUUID(),target])
  const result=await analytics(owner,'&creator='+other.id)
  expect(result.status).toBe(200);expect(result.cache).toContain('no-store')
  const report=result.payload.data.analytics
  expect(report.totals).toMatchObject({works:2,published:1,drafts:1,favorites:2,likes:2,comments:1,downloads:2,ratings:2,recommendations:2,orders:4,paid:2,pending:1})
  expect(report.revenue).toEqual([{currency:'cny',amountCents:6000},{currency:'usd',amountCents:1500}])
  expect(report.works.every(w=>w.creator.id===owner.id)).toBe(true)
  expect(report.works.find(w=>w.id===work.id).metrics).toMatchObject({favorites:2,likes:2,comments:1,downloads:2,paid:2})
  expect(report.works.find(w=>w.id===work.id).ratings).toMatchObject({count:2,average:4.5})
  expect(report.series).toHaveLength(7)
  expect(report.series.at(-1)).toMatchObject({orders:4,downloads:2})
  expect(report.series.slice(0,-1).every(day=>day.orders===0 && day.downloads===0)).toBe(true)
  expect(JSON.stringify(report)).not.toMatch(/password_hash|payment_info|actor|token_hash|@example.test/)
  await pool.query('UPDATE works SET rating_version=2 WHERE id=$1',[work.id])
  expect((await analytics()).payload.data.analytics.totals.ratings).toBe(0)
  const empty=await store.getCreatorAnalytics(fan.id,{days:7})
  expect(empty.totals.works).toBe(0);expect(empty.revenue).toEqual([]);expect(empty.series).toHaveLength(7)
})
test('range validation, bounded pagination, UTC boundary and strict v1 envelope remain correct',async()=>{
  expect((await api('GET','/api/account/analytics?days=365',owner.token)).status).toBe(400)
  const paged=await analytics(owner,'&limit=1&page=2')
  expect(paged.payload.pagination).toMatchObject({page:2,limit:1,total:2})
  expect(paged.payload.data.analytics.works).toHaveLength(1)
  for(const interval of [7,30,90]) expect((await api('GET','/api/account/analytics?days='+interval,owner.token)).payload.data.analytics.series).toHaveLength(interval)
  await favorite()
  const v1=await api('GET','/api/v1/account/favorites',fan.token)
  expect(Object.keys(v1.payload).sort()).toEqual(['data','error','pagination'])
  await ensureSchema(pool)
  expect((await api('GET',work.path+'/favorite',fan.token)).payload.data.saved).toBe(true)
})
test('mobile browser saves across reload, opens private collection and removes through real APIs',async({page})=>{
  await page.setViewportSize({width:390,height:844})
  const errors=[];page.on('pageerror',error=>errors.push(error.message))
  await page.addInitScript(({token})=>{localStorage.setItem('mrright-visitor-token',token);localStorage.setItem('mrright-language','en')},{token:fan.token})
  await page.goto(base+work.url)
  await page.getByRole('button',{name:'Save work',exact:true}).click()
  await expect(page.getByRole('button',{name:'Remove from saved works',exact:true})).toHaveAttribute('aria-pressed','true')
  await page.reload()
  await expect(page.getByRole('button',{name:'Remove from saved works',exact:true})).toBeEnabled()
  await page.goto(base+'/account/favorites')
  await expect(page.locator('.creator-saved-item')).toHaveCount(1)
  await page.locator('.creator-save-remove').click()
  await expect(page.getByText('No saved works yet',{exact:true})).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  expect(errors).toEqual([])
})
test('real creator dashboard exposes accurate owned data and a working date selector',async({page})=>{
  await favorite()
  await page.addInitScript(({token})=>{localStorage.setItem('mrright-visitor-token',token);localStorage.setItem('mrright-language','en')},{token:owner.token})
  await page.goto(base+'/account/dashboard')
  await expect(page.locator('.creator-console-metric').filter({hasText:'Saves received'}).locator('strong')).toHaveText('1')
  await expect(page.locator('.creator-performance-work')).toHaveCount(2)
  await page.getByRole('combobox',{name:'Recent activity'}).selectOption('7')
  await expect(page.locator('.creator-chart-day')).toHaveCount(7)
  await page.getByText('View daily breakdown',{exact:true}).click()
  await expect(page.locator('.creator-daily-details tbody tr')).toHaveCount(7)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})

test('UTC range boundaries remain exact with a non-UTC PostgreSQL session',async()=>{
  const zonedPool=new pg.Pool({connectionString:databaseUrl,options:'-c timezone=Pacific/Honolulu'})
  try {
    const now=new Date()
    const start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())-6*86400000)
    for(const date of [new Date(start.getTime()-1),start]) await pool.query("INSERT INTO download_events(id,project_slug,actor,created_at) VALUES($1,$2,'visitor',$3)",[randomUUID(),'work:'+work.id,date])
    const report=await createCreatorStore({pool:zonedPool}).getCreatorAnalytics(owner.id,{days:7})
    expect(report.series[0]).toMatchObject({date:start.toISOString().slice(0,10),downloads:1})
    expect(report.series.reduce((sum,day)=>sum+day.downloads,0)).toBe(1)
    expect(report.totals.downloads).toBe(2)
  } finally {await zonedPool.end()}
})
