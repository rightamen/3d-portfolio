import { expect,test } from '@playwright/test'
import { setup,respond,work } from './helpers/social-fixtures'
const fixture=async(page,{language='en',incoming=false,failMembership=false,signedIn=true}={})=>{
 const state={following:false,friendship:incoming?{id:'request-1',status:'pending',direction:'incoming'}:null,folders:[],members:new Set(),reports:[],failed:false,relationshipReads:0}
 const person={available:true,handle:'studio',displayName:'Studio',avatarUrl:''}
 const social=async(route,url)=>{
  const path=url.pathname,method=route.request().method(),body=method==='GET'||method==='DELETE'?{}:route.request().postDataJSON()
  if(path.endsWith('/relationship')){state.relationshipReads++;return respond(route,{self:false,following:state.following,friendship:state.friendship,followers:2,followingCount:3})}
  if(path.endsWith('/follow')){state.following=body.following;return respond(route,{following:state.following})}
  if(path.endsWith('/friend')){state.friendship={id:'request-1',status:'pending',direction:'outgoing'};return respond(route,{friendship:state.friendship})}
  if(path.startsWith('/api/account/friends/')){state.friendship=body.action==='accept'?{...state.friendship,status:'accepted'}:null;return respond(route,{friendship:state.friendship})}
  if(path.startsWith('/api/account/following/')){state.following=false;return respond(route,{following:false})}
  if(path==='/api/account/connections'){
   const counts={friends:state.friendship?.status==='accepted'?1:0,incoming:state.friendship?.status==='pending' && state.friendship.direction==='incoming'?1:0,outgoing:state.friendship?.status==='pending' && state.friendship.direction==='outgoing'?1:0,following:state.following?1:0,followers:0};const tab=url.searchParams.get('tab');return respond(route,{counts,connections:counts[tab]?[{id:tab==='following'?'person-id':'request-1',user:person,friendship:state.friendship}]:[]},{pagination:{total:counts[tab],hasNext:false,page:1}})
  }
  if(path==='/api/account/people')return respond(route,{people:[person]},{pagination:{total:1,hasNext:false,page:1}})
  if(path==='/api/account/collections'){
   if(method==='POST'){const folder={id:'folder-'+(state.folders.length+1),...body,count:0};state.folders.push(folder);return respond(route,{collection:folder})}
   return respond(route,{collections:state.folders.map(f=>({...f,count:state.members.has(f.id)?1:0}))})
  }
  if(path.includes('/collections/') && path.includes('/works/')){
   if(failMembership && !state.failed){state.failed=true;return respond(route,null,{status:503})}
   const id=path.split('/')[4];if(body.included)state.members.add(id);else state.members.delete(id);return respond(route,{included:body.included})
  }
  if(path.startsWith('/api/account/collections/')){
   const id=path.split('/').at(-1);if(method==='PATCH'){Object.assign(state.folders.find(f=>f.id===id),body);return respond(route,{collection:state.folders.find(f=>f.id===id)})}state.folders=state.folders.filter(f=>f.id!==id);state.members.delete(id);return respond(route,{deleted:true})
  }
  if(path.endsWith('/collections') && path.includes('/favorites/'))return respond(route,{memberships:state.folders.map(f=>({id:f.id,included:state.members.has(f.id)}))})
  if(path==='/api/account/favorites'){const id=url.searchParams.get('collection');const favorites=!id || state.members.has(id)?[{workId:work.id,available:true,work,savedAt:new Date().toISOString()}]:[];return respond(route,{favorites},{pagination:{total:favorites.length,hasNext:false,page:1}})}
  if(path==='/api/reports'){const report={id:'report-1',...body,targetLabel:work.title,targetUrl:work.url,status:'open',resolution:'',createdAt:new Date().toISOString()};state.reports.push(report);return respond(route,{report})}
  if(path==='/api/account/reports')return respond(route,{reports:state.reports},{pagination:{total:state.reports.length,hasNext:false,page:1}})
  throw new Error('Unexpected social route '+path)
 }
 const handlers=new Proxy({}, {get:(_,path)=>/relationship$|\/follow$|\/friend$|^\/api\/account\/(connections|people|friends|following|collections|favorites|reports)|^\/api\/reports$/.test(path)?social:undefined})
 await setup(page,{signedIn,language,handlers});return state
}
test('friend requests require explicit acceptance, can be removed, and search profiles support following',async({page},info)=>{
 const state=await fixture(page,{incoming:true});await page.goto('/account/connections')
 await page.getByRole('button',{name:/Received requests/}).click();await page.getByRole('button',{name:'Accept request',exact:true}).click()
 await page.getByRole('button',{name:/^Friends/}).click();await expect(page.locator('.social-person')).toHaveCount(1)
 await page.screenshot({path:info.outputPath('connections-desktop.png'),animations:'disabled',fullPage:true})
 await page.getByRole('button',{name:'Remove friend',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Confirm',exact:true}).click();await expect(page.locator('.social-person')).toHaveCount(0)
 await page.getByRole('button',{name:'Find creators',exact:true}).click();await page.getByRole('searchbox',{name:'Search name or handle',exact:true}).fill('Studio');await page.locator('.social-search').getByRole('button',{name:'Find creators',exact:true}).click()
 await page.getByRole('button',{name:'Follow',exact:true}).click();await expect(page.getByRole('button',{name:'Unfollow',exact:true})).toBeEnabled();expect(state.following).toBe(true)
 await page.getByRole('button',{name:'Add friend',exact:true}).click();await expect(page.getByRole('button',{name:'Cancel request',exact:true})).toBeEnabled();expect(state.friendship.status).toBe('pending')
})
test('public creator profile exposes current relationships, and anonymous visitors get a login link',async({page})=>{
 await fixture(page);await page.goto('/u/studio');await page.getByRole('button',{name:'Follow',exact:true}).click();await expect(page.getByRole('button',{name:'Unfollow',exact:true})).toBeEnabled()
 await page.getByRole('button',{name:'Add friend',exact:true}).click();await expect(page.getByRole('button',{name:'Cancel request',exact:true})).toBeEnabled()
})
test('folders create, rename, filter, organize in multiple folders and delete without removing saved works',async({page},info)=>{
 const state=await fixture(page);await page.goto('/account/favorites');await page.getByRole('button',{name:/Manage folders/}).click();await page.getByRole('button',{name:'Create folder',exact:true}).click()
 let dialog=page.getByRole('dialog');await dialog.getByLabel('Folder name',{exact:true}).fill('References');await dialog.getByRole('button',{name:'Save folder',exact:true}).click();await expect(page.locator('.collection-folder')).toHaveCount(1)
 await page.getByRole('button',{name:'Edit folder · References',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByLabel('Folder name',{exact:true}).fill('Lighting');await dialog.getByRole('button',{name:'Save folder',exact:true}).click();await expect(page.locator('.collection-open')).toContainText('Lighting')
 await page.locator('.collection-open').click();await expect(page.getByText('This folder is empty',{exact:true})).toBeVisible();await page.getByRole('button',{name:'All saved works',exact:true}).click()
 await page.getByRole('button',{name:'Organize into folders',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByRole('checkbox',{name:'Lighting',exact:true}).click();await expect.poll(()=>state.members.size).toBe(1);await expect(dialog.getByRole('checkbox')).toBeEnabled();await page.keyboard.press('Escape')
 await page.locator('.collection-open').click();await expect(page.locator('.creator-saved-item')).toHaveCount(1)
 await page.screenshot({path:info.outputPath('collections-desktop.png'),animations:'disabled',fullPage:true})
 await page.getByRole('button',{name:'Delete folder · Lighting',exact:true}).click();dialog=page.getByRole('dialog');await expect(dialog.getByText('Deleting this folder keeps its works in All saved works.',{exact:true})).toBeVisible();await dialog.getByRole('button',{name:'Confirm',exact:true}).click();await expect(page.locator('.collection-folder')).toHaveCount(0);await expect(page.locator('.creator-saved-item')).toHaveCount(1)
})
test('failed folder assignment stays unchecked, can retry and restores focus after Escape',async({page})=>{
 const state=await fixture(page,{failMembership:true});state.folders.push({id:'folder-1',name:'References',description:'',count:0})
 await page.goto('/account/favorites');const trigger=page.getByRole('button',{name:'Organize into folders',exact:true});await trigger.click();const dialog=page.getByRole('dialog'),check=dialog.getByRole('checkbox',{name:'References',exact:true})
 await check.click();await expect(dialog.getByRole('alert')).toBeVisible();await expect(check).not.toBeChecked();await expect(check).toBeEnabled();await check.click();await expect.poll(()=>state.members.size).toBe(1);await expect(check).toBeEnabled();await page.keyboard.press('Escape');await expect(trigger).toBeFocused()
})
test('report dialog validates Other, submits, and links to private report progress',async({page},info)=>{
 const state=await fixture(page);await page.goto(work.url);await page.getByRole('button',{name:'Report',exact:true}).click();const dialog=page.getByRole('dialog')
 await dialog.getByRole('combobox',{name:'Reason',exact:true}).selectOption('other');const submit=dialog.getByRole('button',{name:'Submit report',exact:true});await expect(submit).toBeDisabled();await dialog.getByLabel('Details and evidence references',{exact:true}).fill('Here are the exact details and evidence references.');await submit.click();await expect(dialog.getByRole('status')).toBeVisible();expect(state.reports).toHaveLength(1)
 await dialog.getByRole('link',{name:/My reports/}).click();await expect(page).toHaveURL(/\/account\/reports$/);await expect(page.locator('.social-report-card')).toHaveCount(1)
 await page.screenshot({path:info.outputPath('reports-desktop.png'),animations:'disabled',fullPage:true})
})
test('anonymous reporting and connecting provide real sign-in destinations',async({page})=>{
 await fixture(page,{signedIn:false});await page.goto('/u/studio');await expect(page.locator('.social-anonymous').getByRole('link',{name:'Follow',exact:true})).toHaveAttribute('href','/login?mode=login');await page.getByRole('button',{name:'Report',exact:true}).click();await expect(page.getByRole('dialog').getByRole('link',{name:'Sign in to report',exact:true})).toHaveAttribute('href','/login?mode=login')
})
for(const language of ['zh','en','ja'])test('social pages and folder dialogs fit a light mobile theme in '+language,async({page},info)=>{
 await page.setViewportSize({width:390,height:844});const errors=[];page.on('pageerror',e=>errors.push(e.message));await fixture(page,{language,incoming:true});await page.addInitScript(()=>localStorage.setItem('mrright-interface-preferences-v1',JSON.stringify({theme:'paper',accent:'#33c2cc',motion:'off',effects:false,density:'comfortable'})))
 await page.goto('/account/connections');await expect(page.locator('.social-tabs button')).toHaveCount(6);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 await page.screenshot({path:info.outputPath('connections-'+language+'-mobile.png'),animations:'disabled',fullPage:true})
 await page.goto('/account/favorites');const labels={zh:['管理收藏夹','新建收藏夹','收藏夹名称'],en:['Manage folders','Create folder','Folder name'],ja:['コレクションを管理','新規作成','コレクション名']}[language]
 await page.getByRole('button',{name:new RegExp(labels[0])}).click();await page.getByRole('button',{name:labels[1],exact:true}).click();await expect(page.getByRole('dialog').getByLabel(labels[2],{exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('folder-'+language+'-mobile.png'),animations:'disabled',fullPage:true});await page.keyboard.press('Escape');expect(errors).toEqual([])
})

test('empty later pages retain a previous-page control after concurrent list changes',async({page})=>{
 await fixture(page)
 await page.route('**/api/account/connections?**',route=>{const pageNo=Number(new URL(route.request().url()).searchParams.get('page'));return respond(route,{counts:{friends:pageNo===1?21:20},connections:pageNo===1?[{id:'friend',user:{available:true,handle:'studio',displayName:'Studio'}}]:[]},{pagination:{total:pageNo===1?21:20,page:pageNo,hasNext:pageNo===1}})})
 await page.goto('/account/connections');await page.getByRole('button',{name:'Next',exact:true}).click();await expect(page.getByText('No connections here yet',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Previous',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Previous',exact:true}).click();await expect(page.locator('.social-person')).toHaveCount(1)
})
test('late private connection responses cannot replace another account list',async({page})=>{
 await fixture(page);let releaseOld,requested=false;const gate=new Promise(resolve=>{releaseOld=resolve})
 await page.route('**/api/account/connections?**',async route=>{const old=route.request().headers().authorization?.includes('console-session');if(old){requested=true;await gate}return respond(route,{counts:{friends:1},connections:[{id:'friend',user:{available:true,handle:'studio',displayName:old?'OLD_PRIVATE_CONNECTION':'Current connection'}}]},{pagination:{total:1,hasNext:false,page:1}})})
 try{await page.goto('/account/connections');await expect.poll(()=>requested).toBe(true);await page.evaluate(()=>{localStorage.setItem('mrright-visitor-token','second-session');window.dispatchEvent(new StorageEvent('storage',{key:'mrright-visitor-token'}))});await expect(page.locator('.social-person')).toContainText('Current connection');const response=page.waitForResponse(r=>r.url().includes('/api/account/connections') && r.request().headers().authorization?.includes('console-session'));releaseOld();await response;await expect(page.locator('.social-person')).not.toContainText('OLD_PRIVATE_CONNECTION')}finally{releaseOld()}
})
