import {test,expect} from '@playwright/test'
import {setup,respond,work as original} from './helpers/social-fixtures'
const fixture=async(page,{type='image',language='en',failSecond=false,signedIn=true}={})=>{
 const image='/assets/projects/fire-extinguisher.png'
 const state={work:{...original,id:'console-work',slug:'console-work',url:'/w/console/console-work',resourceType:type,status:'draft',image,thumbnail:image,modelUrl:'',creator:{...original.creator,id:'console',handle:'console'},assets:[]},uploads:[],patches:[],tickets:[]}
 const handler=async(route,url)=>{
  const path=url.pathname
  if(path==='/api/users/console/relationship')return respond(route,{self:true,following:false,friendship:null,followers:0,followingCount:0})
  if(path==='/api/account/works')return respond(route,{works:[state.work]},{pagination:{total:1,page:1,hasNext:false}})
  if(path==='/api/account/works/console-work'){const data=route.request().postDataJSON();state.patches.push(data);Object.assign(state.work,data);return respond(route,{work:state.work})}
  if(path==='/api/account/works/console-work/assets'){
   const raw=route.request().postDataBuffer().toString('latin1'),name=/filename="([^"]+)"/.exec(raw)?.[1] || 'asset',kind=url.searchParams.get('kind');state.uploads.push({kind,name})
   if(failSecond && state.uploads.length===2)return respond(route,null,{status:503})
   const asset={id:'asset-'+state.uploads.length,fileName:name,kind,bytes:128,protected:kind==='source',fileUrl:kind==='source'?null:image}
   state.work.assets.push(asset);return respond(route,{asset,work:state.work})
  }
  if(path==='/api/works/console/console-work' || path==='/api/works/studio/console-work')return respond(route,{work:state.work})
  if(path.endsWith('/download-ticket')){state.tickets.push(route.request().postDataJSON());return respond(route,{ticket:{url:'/download?ticket=resource-test'}})}
  throw new Error('Unexpected resource route '+path)
 }
 const handlers=new Proxy({},{get:(_,path)=>path==='/api/users/console/relationship'||path==='/api/account/works'||path.startsWith('/api/account/works/console-work')||path==='/api/works/console/console-work'||path==='/api/works/studio/console-work'||path.endsWith('/download-ticket')?handler:undefined})
 await setup(page,{language,signedIn,handlers})
 await page.route('**/assets/resource-preview.webm',route=>route.fulfill({path:'tests/fixtures/resources/sample.webm',contentType:'video/webm'}))
 await page.route('**/assets/resource-preview.wav',route=>route.fulfill({path:'tests/fixtures/resources/sample.wav',contentType:'audio/wav'}))
 return state
}
test('publishing offers resource types, relevant upload slots and batch originals',async({page},info)=>{
 const state=await fixture(page,{type:'model'});await page.goto('/account/works');await page.locator('.works-row').getByRole('button',{name:'Edit',exact:true}).click()
 const editor=page.locator('.works-editor');await editor.getByLabel('Resource type',{exact:true}).selectOption('video')
 const input=editor.getByLabel('Upload · Video trailer / public preview',{exact:true});await expect(input).toHaveAttribute('accept','.mp4,.webm,.mov')
 await input.setInputFiles('tests/fixtures/resources/sample.webm');await expect(editor.locator('.works-asset-row')).toHaveCount(1);await expect(input).toBeEnabled()
 await editor.getByLabel('Upload · Original / download files',{exact:true}).setInputFiles([{name:'one.zip',mimeType:'application/zip',buffer:Buffer.from('PK')},{name:'two.psd',mimeType:'image/vnd.adobe.photoshop',buffer:Buffer.from('8BPS')}])
 await expect(editor.locator('.works-asset-row')).toHaveCount(3)
 expect(state.patches.some(p=>p.resourceType==='video')).toBe(true);expect(state.uploads.map(u=>u.kind)).toEqual(['video','source','source'])
 await page.screenshot({path:info.outputPath('publisher-video.png'),fullPage:true,animations:'disabled'})
})
test('a partially failed batch retains the successful file and permits retry',async({page})=>{
 const state=await fixture(page,{failSecond:true});await page.goto('/account/works');await page.locator('.works-row').getByRole('button',{name:'Edit',exact:true}).click()
 const editor=page.locator('.works-editor');await editor.getByLabel('Upload · Original / download files',{exact:true}).setInputFiles([{name:'one.zip',mimeType:'application/zip',buffer:Buffer.from('PK')},{name:'two.zip',mimeType:'application/zip',buffer:Buffer.from('PK')}])
 await expect(editor.locator('.works-asset-row')).toHaveCount(1);await expect(editor.getByLabel('Upload · Original / download files',{exact:true})).toBeEnabled()
 expect(state.work.assets[0].fileName).toBe('one.zip')
})
test('image works show a navigable gallery and no 3D viewer',async({page},info)=>{
 const state=await fixture(page);state.work.status='published';state.work.assets=[{id:'image1',kind:'image',fileUrl:state.work.image+'?view=2',fileName:'another.png'}]
 await page.goto('/w/console/console-work');const gallery=page.locator('.resource-gallery')
 await expect(gallery.locator('img')).toBeVisible();await gallery.getByRole('button',{name:'Next preview',exact:true}).click();await expect(gallery.locator('img')).toHaveAttribute('src',/view=2/)
 await expect(page.getByRole('button',{name:'Open 3D viewer',exact:true})).toHaveCount(0)
 await page.screenshot({path:info.outputPath('image-gallery.png'),fullPage:true,animations:'disabled'})
})
for(const [type,tag,extension] of [['video','video','webm'],['audio','audio','wav']])test(type+' previews decode in the actual browser without exposing the original',async({page})=>{
 const state=await fixture(page,{type});state.work.status='published';state.work.assets=[{id:'preview',kind:type,fileName:'preview.'+extension,fileUrl:'/assets/resource-preview.'+extension},{id:'original',kind:'source',protected:true,fileName:'original.'+extension,fileUrl:null}]
 await page.goto('/w/console/console-work');const player=page.locator('.resource-media '+tag)
 await expect(player).toBeVisible();await player.evaluate(async node=>{await node.play();node.pause()});await expect.poll(()=>player.evaluate(v=>v.readyState)).toBeGreaterThanOrEqual(2)
 await expect(page.locator('a[href*="original."]')).toHaveCount(0)
})
test('per-file download requests bind the selected asset and initiate a browser download',async({page})=>{
 await page.emulateMedia({reducedMotion:'no-preference'});const state=await fixture(page);state.work.status='published';state.work.assets=[{id:'source-one',kind:'source',protected:true,fileName:'one.zip'},{id:'source-two',kind:'source',protected:true,fileName:'two.zip'}]
 await page.route('**/download?ticket=resource-test',route=>route.fulfill({body:'Source bytes',headers:{'Content-Disposition':'attachment; filename=two.zip'},contentType:'application/octet-stream'}))
 await page.goto('/w/console/console-work');await expect(page.locator('.work-author-connections .social-self-entry')).toBeVisible();
 await page.locator('.resource-gallery img').evaluate(node=>node.decode());await page.evaluate(()=>document.fonts.ready);const button=page.locator('.work-files li').filter({hasText:'two.zip'}).getByRole('button',{name:'Download this file',exact:true});await button.scrollIntoViewIfNeeded();const download=page.waitForEvent('download');await button.click();await expect.poll(()=>state.tickets.length).toBe(1);await download
 expect(state.tickets).toEqual([{assetId:'source-two'}])
})
for(const language of ['zh','en','ja'])test('mobile resource publisher and media view fit the selected theme in '+language,async({page},info)=>{
 await page.setViewportSize({width:390,height:844});const state=await fixture(page,{type:'video',language});await page.addInitScript(()=>localStorage.setItem('mrright-interface-preferences-v1',JSON.stringify({theme:'paper',motion:'off',effects:false,density:'comfortable'})))
 await page.goto('/account/works');const edit={zh:'编辑',en:'Edit',ja:'編集'}[language];await page.locator('.works-row').getByRole('button',{name:edit,exact:true}).click()
 await expect(page.locator('.works-editor input[type=file]')).toHaveCount(3);expect(await page.locator('.resource-works-panel .admin-section-header>button').evaluate(node=>node.getBoundingClientRect().height)).toBeLessThan(60);expect(await page.evaluate(()=>getComputedStyle(document.querySelector('.works-fields label>span')).color===getComputedStyle(document.querySelector('.resource-create-type')).color)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 await page.screenshot({path:info.outputPath('publisher-phone-'+language+'.png'),fullPage:true,animations:'disabled'})
 state.work.status='published';state.work.assets=[{id:'preview',kind:'video',fileUrl:'/assets/resource-preview.webm',fileName:'sample.webm'}]
 await page.goto('/w/console/console-work');await expect(page.locator('video')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})
test('resource type filter is part of the server query and resets the page',async({page})=>{
 await fixture(page);const queries=[]
 await page.route('**/api/works?**',route=>{queries.push(new URL(route.request().url()).search);return respond(route,{works:[]},{pagination:{total:0,page:1,hasNext:false}})})
 await page.goto('/explore?page=3');await page.getByRole('combobox',{name:'Resource type',exact:true}).selectOption('video')
 await expect(page).toHaveURL(/resourceType=video/);expect(new URL(page.url()).searchParams.get('page')).toBe(null)
 await expect.poll(()=>queries.some(q=>q.includes('resourceType=video'))).toBe(true)
})
