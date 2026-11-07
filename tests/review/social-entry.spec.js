import {expect,test} from '@playwright/test'
import {setup,respond,work} from './helpers/social-fixtures'
const configure=async(page,{signedIn=true,language='en',self=false,privateAuthor=false,failDirectory=false}={})=>{
 const state={following:false,friendship:null,directoryReads:0},creator={handle:self?'console':'studio',displayName:'Studio',avatarUrl:'',bio:'Objects, spaces and experiments.',location:'Shanghai',workCount:1}
 await setup(page,{signedIn,language,handlers:{
  '/api/creators':(route,url)=>{if(failDirectory && !state.directoryReads++)return respond(route,null,{status:503});return respond(route,{creators:url.searchParams.get('q')==='missing'?[]:[creator]},{pagination:{total:1,hasNext:false,page:1}})},
  '/api/users/studio/relationship':route=>respond(route,{self,following:state.following,friendship:state.friendship,followers:0,followingCount:0}),
  '/api/users/studio/follow':route=>{state.following=route.request().postDataJSON().following;return respond(route,{following:state.following})},
  '/api/users/studio/friend':route=>{state.friendship={id:'entry-request',status:'pending',direction:'outgoing'};return respond(route,{friendship:state.friendship})},
  '/api/works/studio/console-work':route=>respond(route,{work:privateAuthor?{...work,creator:{displayName:'Private creator',profilePublic:false}}:self?{...work,creator:{...work.creator,handle:'console'}}:work})
 }})
 return state
}
test('global discovery and author entry points perform follow and friend actions',async({page},info)=>{
 const state=await configure(page)
 await page.goto('/community')
 await page.locator('.topbar-links').getByRole('link',{name:'Creators',exact:true}).click()
 const card=page.locator('.creator-directory-card')
 await card.getByRole('button',{name:'Follow',exact:true}).click()
 await expect(card.getByRole('button',{name:'Unfollow',exact:true})).toBeEnabled()
 await card.getByRole('button',{name:'Add friend',exact:true}).click()
 await expect(card.getByRole('button',{name:'Cancel request',exact:true})).toBeEnabled()
 expect(state.following).toBe(true);expect(state.friendship.status).toBe('pending')
 await page.screenshot({path:info.outputPath('creators-desktop.png'),animations:'disabled',fullPage:true})
 await page.goto(work.url)
 await expect(page.locator('.work-author-connections').getByRole('button',{name:'Unfollow',exact:true})).toBeEnabled()
 await expect(page.locator('.work-author-connections').getByRole('button',{name:'Cancel request',exact:true})).toBeEnabled()
 await page.locator('.topbar-avatar').click()
 await expect(page.getByRole('menuitem',{name:'Connections',exact:true})).toHaveAttribute('href','/account/connections')
 await expect(page.getByRole('menuitem',{name:'Find creators',exact:true})).toHaveAttribute('href','/creators')
})
test('own creator card and author section provide discovery, while anonymous visitors see both actions',async({page})=>{
 await configure(page,{self:true});await page.goto('/creators')
 await expect(page.locator('.creator-directory-card').getByRole('link',{name:/My profile/})).toHaveAttribute('href','/u/console')
 await expect(page.locator('.creator-directory-card').getByRole('button',{name:'Follow',exact:true})).toHaveCount(0)
 await page.goto(work.url);await expect(page.locator('.work-author-connections').getByRole('link',{name:/Find creators/})).toHaveAttribute('href','/creators')
})
for(const [language,follow,friend] of [['zh','关注','加为好友'],['en','Follow','Add friend'],['ja','フォロー','友達申請']]){
 test('anonymous discovery on mobile has explicit actions: '+language,async({page},info)=>{
  await page.setViewportSize({width:390,height:844});await configure(page,{signedIn:false,language})
  await page.goto('/creators')
  const card=page.locator('.creator-directory-card')
  await expect(card.getByRole('link',{name:follow,exact:true})).toHaveAttribute('href','/login?mode=login')
  await expect(card.getByRole('link',{name:friend,exact:true})).toHaveAttribute('href','/login?mode=login')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:info.outputPath('creators-mobile-'+language+'.png'),animations:'disabled',fullPage:true})
  await page.goto(work.url)
  await expect(page.locator('.work-author-connections').getByRole('link',{name:follow,exact:true})).toBeVisible()
  await expect(page.locator('.work-author-connections').getByRole('link',{name:friend,exact:true})).toBeVisible()
 })
}
test('creator search presents useful empty state and supports a new search',async({page})=>{
 await configure(page);await page.goto('/creators')
 await page.locator('.creators-search input').fill('missing');await page.locator('.creators-search').getByRole('button').click()
 await expect(page.locator('.social-empty')).toBeVisible()
 await page.locator('.creators-search input').fill('Studio');await page.locator('.creators-search').getByRole('button').click()
 await expect(page.locator('.creator-directory-card')).toHaveCount(1)
})

test('discovery retries unavailable API and keeps the light theme and mobile navigation usable',async({page},info)=>{
 await configure(page,{failDirectory:true,signedIn:false})
 await page.addInitScript(()=>localStorage.setItem('mrright-interface-preferences-v1',JSON.stringify({theme:'paper',motion:'off',effects:false,density:'comfortable'})))
 await page.setViewportSize({width:1024,height:900});await page.goto('/creators')
 await expect(page.getByRole('alert')).toBeVisible();await page.getByRole('button',{name:'Retry',exact:true}).click()
 await expect(page.locator('.creator-directory-card')).toHaveCount(1)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 await page.setViewportSize({width:390,height:844});await page.locator('.topbar-toggle').click()
 await page.locator('.topbar-mobile').getByRole('link',{name:'Creators',exact:true}).click()
 await expect(page.locator('.topbar-mobile')).toHaveCount(0)
 await page.screenshot({path:info.outputPath('creators-paper-mobile.png'),fullPage:true,animations:'disabled'})
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})
test('a private author never receives public connection controls',async({page})=>{
 await configure(page,{privateAuthor:true});await page.goto(work.url)
 await expect(page.locator('.work-info h1')).toBeVisible()
 await expect(page.locator('.work-author-connections')).toHaveCount(0)
})
