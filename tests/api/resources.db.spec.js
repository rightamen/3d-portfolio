import {expect,test} from '@playwright/test'
import {spawn} from 'node:child_process'
import {randomUUID,randomBytes,createHash} from 'node:crypto'
import {readFile,unlink} from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'
import {ensureSchema} from '../../server/postgres/schema.js'
import {assertDisposableDatabaseUrl} from '../../scripts/lib/disposable-postgres.mjs'
const databaseUrl=process.env.API_TEST_DATABASE_URL || ''
test.skip(!databaseUrl,'Requires disposable database')
const base='http://127.0.0.1:4227',admin=randomBytes(24).toString('hex')
let pool,server,a,b,work
const files=new Set()
const api=async(method,url,token,body)=>{const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()}}
const user=async()=>{const id=randomUUID(),token=randomBytes(24).toString('hex'),handle='resource-'+id.slice(0,8);await pool.query("INSERT INTO visitor_users(id,email,display_name,password_hash,handle,email_verified_at) VALUES($1,$2,'Resource creator','test',$3,now())",[id,id+'@example.test',handle]);await pool.query("INSERT INTO visitor_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash('sha256').update(token).digest('hex'),id]);return {id,token,handle}}
const create=async(type='image',priceCents=0)=>(await api('POST','/api/account/works',a.token,{title:'Resource '+randomUUID(),resourceType:type,priceCents})).data.data.work
const bytes=async name=>readFile('tests/fixtures/resources/'+name)
const upload=async(kind,name,buffer,token=a.token,target=work.id)=>{
 const form=new FormData();form.append('kind',kind);form.append('file',new Blob([buffer]),name)
 const r=await fetch(base+'/api/account/works/'+target+'/assets?kind='+kind,{method:'POST',headers:token?{Authorization:'Bearer '+token}:{},body:form}),data=await r.json()
 for(const url of [data.data?.asset?.fileUrl,data.data?.work?.image,data.data?.work?.thumbnail])if(url?.startsWith('/uploads/'))files.add(url)
 return {status:r.status,data:data.data,error:data.error}
}
const makePublic=()=>pool.query("UPDATE works SET status='published',published_at=now() WHERE id=$1",[work.id])
const ticket=async(owner=b,assetId)=>api('POST','/api/works/'+a.handle+'/'+work.slug+'/download-ticket',owner.token,assetId?{assetId}:{})
test.beforeAll(async()=>{assertDisposableDatabaseUrl(databaseUrl);pool=new pg.Pool({connectionString:databaseUrl});await ensureSchema(pool);server=spawn(process.execPath,['server/index.js'],{env:{...process.env,DATABASE_URL:databaseUrl,ADMIN_TOKEN:admin,PORT:'4227',NODE_ENV:'test'},stdio:'ignore'});await expect.poll(()=>fetch(base+'/api/health').then(r=>r.status).catch(()=>0),{timeout:30000}).toBe(200)})
test.beforeEach(async()=>{a=await user();b=await user();work=await create()})
test.afterAll(async()=>{if(server){const stopped=new Promise(resolve=>server.once('exit',resolve));server.kill('SIGTERM');await stopped}for(const url of files){const p=path.resolve('public',url.slice(1));if(p.startsWith(path.resolve('public/uploads')+path.sep))await unlink(p).catch(()=>{})}await pool?.end()})
test('all resource types create and persist while unknown types and other owners are rejected',async()=>{
 for(const type of ['model','image','video','audio','material','document','other'])expect((await create(type)).resourceType).toBe(type)
 expect((await api('POST','/api/account/works',a.token,{title:'Bad',resourceType:'executable'})).status).toBe(400)
 expect((await api('PATCH','/api/account/works/'+work.id,b.token,{resourceType:'video'})).status).toBe(404)
 expect((await api('PATCH','/api/account/works/'+work.id,a.token,{resourceType:'video'})).data.data.work.resourceType).toBe('video')
})
test('an original image stays protected and byte-identical while its generated cover is a separate public preview',async()=>{
 const png=await bytes('sample.png'),r=await upload('source','original.png',png)
 expect(r.status).toBe(201);expect(r.data.work.image).toMatch(/^\/uploads\/work-previews\//);expect(r.data.work.image).not.toBe(r.data.asset.fileUrl)
 await makePublic()
 expect((await fetch(base+r.data.asset.fileUrl)).status).toBe(404);expect((await fetch(base+r.data.work.image)).status).toBe(200)
 const replacement=await upload('preview','custom-cover.png',png);expect(replacement.data.work.image).toBe(replacement.data.asset.fileUrl)
 const publicWork=(await api('GET','/api/works/'+a.handle+'/'+work.slug)).data.data.work;expect(publicWork.assets.find(a=>a.kind==='source')).toMatchObject({fileUrl:null,protected:true})
 const tk=await ticket(b,r.data.asset.id);expect(tk.status).toBe(201)
 const response=await fetch(base+tk.data.data.ticket.url);expect(response.status).toBe(200);expect(response.headers.get('content-disposition')).toContain('attachment');expect(Buffer.from(await response.arrayBuffer())).toEqual(png)
 expect((await fetch(base+tk.data.data.ticket.url)).status).toBe(403)
})
test('video and audio previews are playable byte streams with range support; their originals remain protected',async()=>{
 for(const [type,name,mime] of [['video','sample.webm','video/webm'],['audio','sample.wav','audio/wav']]){
  work=await create(type);const buffer=await bytes(name),preview=await upload(type,name,buffer),original=await upload('source','original-'+name,buffer)
  expect(preview.status).toBe(201);expect(original.status).toBe(201);await makePublic()
  const response=await fetch(base+preview.data.asset.fileUrl,{headers:{Range:'bytes=0-15'}});expect(response.status).toBe(206);expect(response.headers.get('content-type')).toContain(mime);expect((await response.arrayBuffer()).byteLength).toBe(16)
  expect((await fetch(base+original.data.asset.fileUrl)).status).toBe(404)
  expect((await ticket(b)).status).toBe(201)
 }
})
test('resource archives, project files and documents upload as originals and cannot be accessed by guessing their paths',async()=>{
 work=await create('material')
 for(const [name,data] of [['pack.zip',Buffer.from([80,75,5,6,...Array(18).fill(0)])],['project.blend',Buffer.from('BLENDER-v300')],['layers.psd',Buffer.from('8BPS12345678')],['notes.pdf',Buffer.from('%PDF-1.4\nExample')],['readme.txt',Buffer.from('Resource instructions')],['vector.svg',Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')]]){
  const r=await upload('source',name,data);expect(r.status).toBe(201);expect((await fetch(base+r.data.asset.fileUrl)).status).toBe(404)
  const owner=await fetch(base+r.data.asset.fileUrl,{headers:{Authorization:'Bearer '+a.token}});expect(owner.status).toBe(200);expect(owner.headers.get('content-type')).toContain('application/octet-stream')
 }
})
test('download tickets select a specific owned-work file and cannot be switched to another file or work',async()=>{
 const first=await upload('source','one.txt',Buffer.from('First original')),second=await upload('source','two.txt',Buffer.from('Second original'))
 await makePublic()
 const tk=await ticket(b,second.data.asset.id),response=await fetch(base+tk.data.data.ticket.url+'&assetId='+first.data.asset.id)
 expect(await response.text()).toBe('Second original')
 const other=await create('document');const outside=await upload('source','outside.txt',Buffer.from('Outside'),a.token,other.id)
 expect((await ticket(b,outside.data.asset.id)).status).toBe(404)
})
test('paid originals keep their purchase entitlement gate, including image and video formats',async()=>{
 work=await create('video',1000);const r=await upload('source','movie.webm',await bytes('sample.webm'));await makePublic()
 expect((await ticket(b,r.data.asset.id)).status).toBe(403)
 expect((await ticket(a,r.data.asset.id)).status).toBe(201)
 expect((await fetch(base+r.data.asset.fileUrl,{headers:{Authorization:'Bearer '+b.token}})).status).toBe(404)
})
test('extension mismatches, executable files, wrong slots and unauthenticated uploads are rejected',async()=>{
 for(const [kind,name,data] of [['video','fake.mp4',Buffer.from('not video')],['image','clip.webm',await bytes('sample.webm')],['source','run.exe',Buffer.from('MZ')],['video','image.png',await bytes('sample.png')],['source','bad.zip',Buffer.from('not zip')]])expect((await upload(kind,name,data)).status).toBe(400)
 expect((await upload('source','notes.txt',Buffer.from('Content'),null)).status).toBe(401)
 expect((await upload('source','notes.txt',Buffer.from('Content'),b.token)).status).toBe(404)
})
test('public discovery filters resource types with valid pagination and preserves old model defaults',async()=>{
 await makePublic();const id=work.id
 const video=await create('video');await pool.query("UPDATE works SET status='published',published_at=now() WHERE id=$1",[video.id])
 const found=await api('GET','/api/v1/works?resourceType=image&creator='+a.handle+'&limit=1')
 expect(found.status).toBe(200);expect(found.data.data.works.map(w=>w.id)).toEqual([id]);expect(found.data.pagination.total).toBe(1)
 expect((await api('GET','/api/works?resourceType=invalid')).status).toBe(400)
 const legacy=(await pool.query("INSERT INTO works(id,creator_id,slug,title) VALUES($1,$2,$1,'Legacy') RETURNING resource_type",[randomUUID(),a.id])).rows[0];expect(legacy.resource_type).toBe('model')
})
test('a deleted resource URL is denied even if an underlying orphan file remains',async()=>{
 const r=await upload('source','private.txt',Buffer.from('Private'))
 await pool.query('DELETE FROM work_assets WHERE id=$1',[r.data.asset.id])
 expect((await fetch(base+r.data.asset.fileUrl)).status).toBe(404)
})
test('a real creator uploads a video resource and a separate visitor plays its preview',async({playwright},info)=>{
 work=await create('video');const browser=await playwright.chromium.launch(),contexts=[]
 try{
  const owner=await browser.newContext({viewport:{width:1365,height:1000},reducedMotion:'reduce'});contexts.push(owner)
  await owner.addInitScript(({token})=>{localStorage.setItem('mrright-visitor-token',token);localStorage.setItem('mrright-language','en')},{token:a.token})
  const page=await owner.newPage();page.setDefaultTimeout(10000);await page.goto(base+'/account/works');await page.locator('.works-row').filter({hasText:work.title}).getByRole('button',{name:'Edit',exact:true}).click()
  const editor=page.locator('.works-editor')
  await editor.getByLabel('Upload · Video trailer / public preview',{exact:true}).setInputFiles('tests/fixtures/resources/sample.webm')
  await expect(editor.getByText('sample.webm',{exact:true})).toBeVisible()
  await editor.getByLabel('Upload · Original / download files',{exact:true}).setInputFiles('tests/fixtures/resources/sample.webm')
  await expect(editor.locator('.works-asset-row')).toHaveCount(2);await page.screenshot({path:info.outputPath('real-resource-publisher.png'),fullPage:true,animations:'disabled'})
  const stored=(await api('GET','/api/works/'+a.handle+'/'+work.slug,a.token)).data.data.work;for(const asset of stored.assets)files.add(asset.fileUrl)
  await makePublic();const visitor=await browser.newContext();contexts.push(visitor);const view=await visitor.newPage()
  await view.goto(base+'/w/'+a.handle+'/'+work.slug);await expect(view.locator('.resource-media video')).toBeVisible()
  await view.locator('video').evaluate(async video=>{await video.play();video.pause()});await expect.poll(()=>view.locator('video').evaluate(v=>v.readyState)).toBeGreaterThanOrEqual(2)
  expect((await fetch(base+stored.assets.find(a=>a.kind==='source').fileUrl)).status).toBe(404)
  await page.goto(base+'/w/'+a.handle+'/'+work.slug)
  const download=page.waitForEvent('download')
  await page.locator('.work-files li').filter({has:page.getByRole('button',{name:'Download this file',exact:true})}).getByRole('button',{name:'Download this file',exact:true}).click()
  const received=await download
  expect(await readFile(await received.path())).toEqual(await bytes('sample.webm'))

 }finally{for(const context of contexts)await context.close();await browser.close()}
})
