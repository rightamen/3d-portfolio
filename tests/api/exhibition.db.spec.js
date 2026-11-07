import { expect, test } from '@playwright/test'
import { spawn } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import pg from 'pg'
import { ensureSchema } from '../../server/postgres/schema.js'
import { createWorksStore } from '../../server/postgres/worksStore.js'
import { assertDisposableDatabaseUrl } from '../../scripts/lib/disposable-postgres.mjs'

const databaseUrl = process.env.API_TEST_DATABASE_URL || ''
test.skip(!databaseUrl, 'Use the disposable database runner')
const admin = randomBytes(24).toString('hex')
const creator = randomUUID()
const creatorHandle = 'curation-' + creator.slice(0, 8)
const base = 'http://127.0.0.1:4199'
const voters = Array.from({length:20},()=>({id:randomUUID(),token:randomBytes(24).toString('hex')}))
let pool,store,server,creatorToken
const api = async (method,path,body,token) => {
  const response = await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})
  return {status:response.status,payload:await response.json()}
}
const makeWork = async (title='Curation candidate') => {
  const id=randomUUID(),slug='work-'+id
  await pool.query(`INSERT INTO works(id,creator_id,slug,title,status,image) VALUES($1,$2,$3,$4,'published','/assets/projects/fire-extinguisher.png')`,[id,creator,slug,title])
  return {id,path:'/api/works/'+creatorHandle+'/'+slug,url:'/w/'+creatorHandle+'/'+slug,version:1}
}
const curate = (work,score=94,recommended=true,version=1,token=admin) => api('PATCH','/api/admin/works/'+work.id+'/curation',{score,recommended,version},token)
const list = async () => (await api('GET','/api/works?exhibition=true&limit=60&creator='+creatorHandle)).payload.data.works
const vote = (work,voter,score=5,recommended=true,version=1) => api('PUT',work.path+'/rating',{score,recommended,version},voter.token)
const tenVotes = async (work,score=5) => {
  for(const voter of voters.slice(0,10)) expect((await vote(work,voter,score)).status).toBe(200)
}
test.beforeAll(async()=>{
  assertDisposableDatabaseUrl(databaseUrl)
  pool=new pg.Pool({connectionString:databaseUrl})
  await ensureSchema(pool);store=createWorksStore({pool})
  creatorToken=randomBytes(24).toString('hex')
  for(const [index,user] of [{id:creator,token:creatorToken},...voters].entries()){
    await pool.query(`INSERT INTO visitor_users(id,email,display_name,password_hash,handle,email_verified_at)
      VALUES($1,$2,$3,'test-only',$4,now())`,[user.id,user.id+'@example.test','Exhibition voter '+index,index===0?creatorHandle:null])
    await pool.query(`INSERT INTO visitor_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')`,[createHash('sha256').update(user.token).digest('hex'),user.id])
  }
  server=spawn(process.execPath,['server/index.js'],{cwd:process.cwd(),env:{...process.env,DATABASE_URL:databaseUrl,ADMIN_TOKEN:admin,PORT:'4199',NODE_ENV:'test'},stdio:'ignore'})
  await expect.poll(async()=>fetch(base+'/api/health').then(r=>r.status).catch(()=>0),{timeout:30000}).toBe(200)
})
test.afterAll(async()=>{if(server){const stopped=new Promise(resolve=>server.once('exit',resolve));server.kill('SIGTERM');await stopped}await pool?.end()})

test('unscored works stay in the public catalogue but outside the exhibition',async()=>{
  const work=await makeWork()
  expect((await list()).some(w=>w.id===work.id)).toBe(false)
  const ordinary=await api('GET','/api/works?creator='+creatorHandle)
  expect(ordinary.payload.data.works.some(w=>w.id===work.id)).toBe(true)
})
test('only an administrator can set a qualifying score and recommendation',async()=>{
  const work=await makeWork()
  expect((await curate(work,94,true,1,voters[0].token)).status).toBe(401)
  for(const score of [null,89,101,-1,94.5,'95']) expect((await curate(work,score,true)).status).toBe(400)
  for(const version of ['1',0,2147483648,1e100]) {
    expect((await curate(work,94,true,version)).status).toBe(400)
    expect((await vote(work,voters[0],5,true,version)).status).toBe(400)
  }
  expect((await curate(work,90,false)).status).toBe(200)
  expect((await list()).some(w=>w.id===work.id)).toBe(false)
  expect((await curate(work,90,true)).status).toBe(200)
  expect((await list()).some(w=>w.id===work.id)).toBe(true)
  await curate(work,90,false)
  expect((await list()).some(w=>w.id===work.id)).toBe(false)
})
test('ten verified high-score recommendations qualify independently of the curator',async()=>{
  const work=await makeWork()
  for(const voter of voters.slice(0,9)) expect((await vote(work,voter)).status).toBe(200)
  expect((await list()).some(w=>w.id===work.id)).toBe(false)
  expect((await vote(work,voters[9])).status).toBe(200)
  const selected=(await list()).find(w=>w.id===work.id)
  expect(selected.ratings).toEqual({count:10,average:5,recommendations:10})
  expect(selected.curation.recommended).toBe(false)
})
test('rating updates replace a vote and withdrawal removes community eligibility',async()=>{
  const work=await makeWork();await tenVotes(work)
  const responses=await Promise.all(Array.from({length:6},()=>vote(work,voters[0],4,true)))
  expect(responses.every(r=>r.status===200)).toBe(true)
  let current=(await api('GET',work.path+'/rating',undefined,voters[0].token)).payload.data
  expect(current.ratings.count).toBe(10);expect(current.ratings.average).toBe(4.9)
  await vote(work,voters[0],5,false)
  current=(await api('GET',work.path+'/rating')).payload.data
  expect(current.ratings.recommendations).toBe(9)
  expect((await list()).some(w=>w.id===work.id)).toBe(false)
})
test('all valid ratings count toward the average and rounded displays cannot admit a low score',async()=>{
  const work=await makeWork()
  for(const [index,voter] of voters.entries()) expect((await vote(work,voter,index<9?5:4)).status).toBe(200)
  const ratings=(await api('GET',work.path+'/rating')).payload.data.ratings
  expect(ratings).toEqual({count:20,average:4.45,recommendations:20})
  expect((await list()).some(w=>w.id===work.id)).toBe(false)
  await vote(work,voters[9],5)
  expect((await list()).some(w=>w.id===work.id)).toBe(true)
})
test('anonymous, self and unverified voting are rejected; clients cannot forge curation',async()=>{
  const work=await makeWork()
  expect((await api('PUT',work.path+'/rating',{score:5,recommended:true,version:1})).status).toBe(401)
  expect((await api('PUT',work.path+'/rating',{score:5,recommended:true,version:1},creatorToken)).status).toBe(403)
  await pool.query('UPDATE visitor_users SET email_verified_at=NULL WHERE id=$1',[voters[19].id])
  expect([401,403]).toContain((await vote(work,voters[19])).status)
  await pool.query('UPDATE visitor_users SET email_verified_at=now() WHERE id=$1',[voters[19].id])
  expect((await vote(work,voters[0],3,true)).status).toBe(400)
  await api('PATCH','/api/account/works/'+work.id,{curation:{score:100,recommended:true},ratings:{average:5,count:100,recommendations:100}},creatorToken)
  expect((await list()).some(w=>w.id===work.id)).toBe(false)
})
test('new content invalidates both recommendations and stale decisions cannot apply',async()=>{
  const work=await makeWork();await tenVotes(work);await curate(work)
  expect((await list()).some(w=>w.id===work.id)).toBe(true)
  expect((await api('PATCH','/api/account/works/'+work.id,{title:'Revised candidate'},creatorToken)).status).toBe(200)
  const changed=(await api('GET',work.path)).payload.data.work
  expect(changed.contentVersion).toBe(2);expect(changed.curation.recommended).toBe(false);expect(changed.ratings.count).toBe(0)
  expect((await list()).some(w=>w.id===work.id)).toBe(false)
  expect((await vote(work,voters[0],5,true,1)).status).toBe(409)
  expect((await curate(work,95,true,1)).status).toBe(409)
  expect((await api('GET',work.path+'/rating',undefined,voters[0].token)).payload.data.mine).toBeNull()
  expect((await curate(work,95,true,2)).status).toBe(200)
})
test('unpublishing always removes a work, regardless of its recommendation source',async()=>{
  const work=await makeWork();await tenVotes(work);await curate(work)
  await api('PATCH','/api/admin/works/'+work.id+'/status',{status:'hidden'},admin)
  expect((await list()).some(w=>w.id===work.id)).toBe(false)
  expect((await api('GET',work.path+'/rating')).status).toBe(404)
})
test('failed asset updates roll back admission; valid asset changes require a new review',async()=>{
  const work=await makeWork();await curate(work)
  await expect(store.addAsset(work.id,{kind:'invalid',fileName:'test',fileUrl:'/test'})).rejects.toThrow()
  expect((await store.getWorkById(work.id)).curation.recommended).toBe(true)
  const asset=await store.addAsset(work.id,{kind:'image',fileName:'test',fileUrl:'/test'})
  let current=await store.getWorkById(work.id)
  expect(current.contentVersion).toBe(2);expect(current.curation.recommended).toBe(false)
  await curate(work,95,true,2)
  await store.removeAsset(work.id,asset.id)
  current=await store.getWorkById(work.id)
  expect(current.contentVersion).toBe(3);expect(current.curation.recommended).toBe(false)
})
test('admin review UI saves a score and explicit recommendation through the real API',async({page})=>{
  const work=await makeWork('Admin exhibition journey')
  await page.addInitScript(({token})=>{localStorage.setItem('mrright-admin-token',token);localStorage.setItem('mrright-admin-language','en')},{token:admin})
  await page.goto(base+'/admin')
  await page.getByRole('button',{name:'Curated exhibition',exact:true}).click()
  const row=page.locator('.admin-curation-work').filter({hasText:'Admin exhibition journey'})
  await expect(row).toBeVisible()
  await row.getByLabel('Curator score (0–100)',{exact:true}).fill('96')
  await row.getByLabel('Recommend for the exhibition',{exact:true}).check()
  await row.getByRole('button',{name:'Save review',exact:true}).click()
  await expect(row.getByText('Review saved',{exact:true})).toBeVisible()
  expect((await list()).some(w=>w.id===work.id)).toBe(true)
})

test('verified user can rate and recommend from the real page and complete community admission',async({page})=>{
  await page.setViewportSize({width:390,height:844})
  const work=await makeWork('Community exhibition journey')
  for(const voter of voters.slice(1,10)) expect((await vote(work,voter)).status).toBe(200)
  await page.addInitScript(({token})=>{localStorage.setItem('mrright-visitor-token',token);localStorage.setItem('mrright-language','en')},{token:voters[0].token})
  await page.goto(base+work.url)
  const section=page.getByRole('region',{name:'Ratings and exhibition recommendations',exact:true})
  await section.getByRole('radio',{name:'5 stars',exact:true}).check()
  await section.getByRole('checkbox',{name:'Recommend for exhibition (4+ stars)',exact:true}).check()
  await section.getByRole('button',{name:'Save rating and recommendation',exact:true}).click()
  await expect(section.getByText('Rating saved. Updating it does not add another vote.',{exact:true})).toBeVisible()
  expect((await list()).find(w=>w.id===work.id).ratings).toEqual({count:10,average:5,recommendations:10})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.reload()
  await expect(section.getByRole('radio',{name:'5 stars',exact:true})).toBeChecked()
  await expect(section.getByRole('checkbox',{name:'Recommend for exhibition (4+ stars)',exact:true})).toBeChecked()
})

test('administrator system settings share the interface palette and motion controls through real auth',async({page})=>{
  await page.addInitScript(({token})=>{localStorage.setItem('mrright-admin-token',token);localStorage.setItem('mrright-admin-language','en')},{token:admin})
  await page.goto(base+'/admin')
  await page.locator('.admin-sidebar').getByRole('button',{name:'System',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Make this space your own.',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Warm paper',exact:true}).click()
  await expect(page.locator('html')).toHaveAttribute('data-ui-theme','paper')
  await expect(page.locator('.admin-panel').first()).toHaveCSS('background-color','rgb(250, 248, 242)')
  await page.getByRole('button',{name:'Static',exact:true}).click()
  await expect(page.locator('html')).toHaveAttribute('data-ui-motion','off')
  await expect.poll(()=>page.evaluate(()=>document.getAnimations().filter(animation=>animation.playState==='running').length)).toBe(0)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})
