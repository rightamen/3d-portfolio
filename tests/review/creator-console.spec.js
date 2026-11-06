import { expect,test } from '@playwright/test'

const work={id:'console-work',slug:'console-work',url:'/w/studio/console-work',title:'Studio object',titleZh:'空间物件',titleJa:'空間オブジェクト',status:'published',priceCents:0,currency:'usd',thumbnail:'/assets/projects/fire-extinguisher.png',image:'/assets/projects/fire-extinguisher.png',assets:[],tags:[],creator:{id:'maker',handle:'studio',displayName:'Studio',profilePublic:true},ratings:{count:0,average:0,recommendations:0}}
const totals={works:1,published:1,drafts:0,review:0,offline:0,favorites:12,likes:9,comments:3,downloads:8,ratings:2,recommendations:1,orders:4,paid:2,pending:1}
const report=(days=30,favorites=12)=>({generatedAt:new Date().toISOString(),timeZone:'UTC',days,totals:{...totals,favorites},revenue:[{currency:'cny',amountCents:12800},{currency:'usd',amountCents:2400}],series:Array.from({length:days},(_,i)=>({date:new Date(Date.UTC(2026,10,1+i)).toISOString().slice(0,10),orders:i%4,downloads:i%7})),works:[{...work,metrics:{favorites:12,downloads:8,likes:9,comments:3,paid:2}}]})
const respond=(route,data,{status=200,pagination={}}={})=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({data,pagination,error:status===200?null:{code:'SERVICE_UNAVAILABLE',message:'Unavailable'}})})
const setup=async(page,{signedIn=true,language='en',handlers={}}={})=>{
  const calls=[]
  let saved=false
  await page.addInitScript(({signedIn,language})=>{localStorage.setItem('mrright-language',language);if(signedIn)localStorage.setItem('mrright-visitor-token','console-session')},{signedIn,language})
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url()),path=url.pathname,method=route.request().method()
    calls.push({path,method,search:url.search})
    if(handlers[path]) return handlers[path](route,url)
    if(path==='/api/profile') return respond(route,{ownerHandle:'studio',profile:{}})
    if(path==='/api/auth/me') return respond(route,{user:{id:route.request().headers().authorization?.includes('second-session')?'second':'console',handle:'console',email:'local@example.test',displayName:'Creator',emailVerified:true}})
    if(path==='/api/auth/logout') return respond(route,{ok:true})
    if(path==='/api/account/profile') return respond(route,{profile:{id:'console',handle:'console',displayName:'Creator',stats:{}}})
    if(path==='/api/account/community') return respond(route,{posts:[],uploads:[]})
    if(path==='/api/account/comments') return respond(route,{comments:[],likeCount:0})
    if(path==='/api/account/downloads') return respond(route,{requests:[],downloads:[]})
    if(path==='/api/account/notifications/unread') return respond(route,{unread:0})
    if(path==='/api/account/analytics') return respond(route,{analytics:report(Number(url.searchParams.get('days')))},{pagination:{page:1,total:1,limit:20,hasNext:false}})
    if(path==='/api/account/favorites') return respond(route,{favorites:saved?[{workId:work.id,available:true,work,savedAt:new Date().toISOString()}]:[]},{pagination:{page:1,total:saved?1:0,limit:24,hasNext:false}})
    if(path==='/api/account/favorites/'+work.id) {saved=false;return respond(route,{saved})}
    if(path==='/api/works/studio/console-work') return respond(route,{work})
    if(path.endsWith('/favorite')) {if(method==='PUT')saved=true;return respond(route,{saved})}
    if(path.endsWith('/likes')) return respond(route,{likeCount:0,liked:false})
    if(path.endsWith('/comments')) return respond(route,{comments:[]})
    if(path.endsWith('/rating')) return respond(route,{ratings:work.ratings,mine:null,contentVersion:1})
    throw new Error('Unexpected API route '+path)
  })
  return calls
}

test('dashboard shows separate currencies, period changes and accessible daily data',async({page},testInfo)=>{
  const calls=await setup(page)
  await page.goto('/account/dashboard')
  await expect(page.locator('.creator-console-metric')).toHaveCount(4)
  await expect(page.locator('.creator-revenue-values')).toContainText('128.00')
  await expect(page.locator('.creator-revenue-values')).toContainText('24.00')
  await page.getByRole('combobox',{name:'Recent activity'}).selectOption('7')
  await expect(page.locator('.creator-chart-day')).toHaveCount(7)
  await page.getByText('View daily breakdown',{exact:true}).click()
  await expect(page.locator('.creator-daily-details tbody tr')).toHaveCount(7)
  expect(calls.some(call=>call.search.includes('days=7'))).toBe(true)
  await page.evaluate(()=>window.scrollTo(0,0))
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0)
  await page.screenshot({path:testInfo.outputPath('creator-dashboard-desktop.png'),fullPage:true})
})
test('dashboard error can retry; zero data has an honest publishing empty state',async({page})=>{
  let attempts=0
  await setup(page,{handlers:{'/api/account/analytics':route=>++attempts===1 ? respond(route,null,{status:503}) : respond(route,{analytics:{...report(),totals:Object.fromEntries(Object.keys(totals).map(key=>[key,0])),works:[],revenue:[]}},{pagination:{total:0,page:1,hasNext:false}})}})
  await page.goto('/account/dashboard')
  await expect(page.locator('.creator-console [role=alert]')).toBeVisible()
  await page.locator('.creator-console').getByRole('button',{name:'Retry',exact:true}).click()
  await expect(page.getByText('Your next work starts here.',{exact:true})).toBeVisible()
  await expect(page.getByText('No confirmed sales yet',{exact:true})).toBeVisible()
})
test('late private report from a previous account cannot replace the new account data',async({page})=>{
  let releaseOld
  const oldGate=new Promise(resolve=>{releaseOld=resolve})
  let requested=false
  await setup(page,{handlers:{'/api/account/analytics':async route=>{
    const old=route.request().headers().authorization?.includes('console-session')
    if(old){requested=true;await oldGate}
    return respond(route,{analytics:report(30,old?999:2)},{pagination:{total:1,page:1,hasNext:false}})
  }}})
  try {
    await page.goto('/account/dashboard')
    await expect.poll(()=>requested).toBe(true)
    await page.evaluate(()=>{localStorage.setItem('mrright-visitor-token','second-session');window.dispatchEvent(new StorageEvent('storage',{key:'mrright-visitor-token'}))})
    const count=page.locator('.creator-console-metric').filter({hasText:'Saves received'}).locator('strong')
    await expect(count).toHaveText('2')
    const oldResponse=page.waitForResponse(response=>response.url().includes('/api/account/analytics') && response.request().headers().authorization?.includes('console-session'))
    releaseOld()
    await oldResponse
    await expect(count).toHaveText('2')
    await expect(page.locator('.creator-console-metric').filter({hasText:'999'})).toHaveCount(0)
  } finally {releaseOld()}
})
test('bookmark button supports retry and desired-state save/remove with keyboard',async({page})=>{
  let reads=0,saveAttempts=0,saved=false
  await setup(page,{handlers:{'/api/works/studio/console-work/favorite':route=>{
    if(route.request().method()==='GET')return ++reads===1 ? respond(route,null,{status:503}) : respond(route,{saved})
    if(++saveAttempts===1)return respond(route,null,{status:503})
    saved=true;expect(route.request().postDataJSON()).toEqual({saved:true});return respond(route,{saved})
  },['/api/account/favorites/'+work.id]:route=>{saved=false;return respond(route,{saved})}}})
  await page.goto(work.url)
  await page.locator('.creator-favorite-control').getByRole('button',{name:'Retry',exact:true}).click()
  const save=page.getByRole('button',{name:'Save work',exact:true})
  await save.focus();await page.keyboard.press('Enter')
  await expect(page.locator('.creator-favorite-control [role=alert]')).toBeVisible()
  await expect(save).toHaveAttribute('aria-pressed','false')
  await save.click()
  const remove=page.getByRole('button',{name:'Remove from saved works',exact:true})
  await expect(remove).toHaveAttribute('aria-pressed','true')
  await remove.click();await expect(save).toHaveAttribute('aria-pressed','false')
})
test('saved list retries errors, redacts unavailable cards and recovers after removing last page item',async({page})=>{
  let reads=0,deleted=false
  await setup(page,{handlers:{'/api/account/favorites':(route,url)=>{
    if(++reads===1)return respond(route,null,{status:503})
    const pageNumber=Number(url.searchParams.get('page'))
    return respond(route,{favorites:pageNumber===2 && deleted ? [] : [{workId:work.id,available:false,work:null,savedAt:new Date().toISOString()}]},{pagination:{page:pageNumber,total:deleted?1:2,limit:1,hasNext:pageNumber===1 && !deleted}})
  },['/api/account/favorites/'+work.id]:route=>{deleted=true;return respond(route,{saved:false})}}})
  await page.goto('/account/favorites')
  await page.locator('.creator-console').getByRole('button',{name:'Retry',exact:true}).click()
  await expect(page.getByText('Work unavailable',{exact:true})).toBeVisible()
  await page.locator('.creator-console-pagination').getByRole('button',{name:'Next',exact:true}).click()
  await expect(page.locator('.creator-console-pagination')).toContainText('Page 2')
  await page.locator('.creator-save-remove').click()
  await expect(page.locator('.creator-console-pagination')).toContainText('Page 1')
  await expect(page.locator('.creator-console-pagination').getByRole('button',{name:'Next',exact:true})).toBeDisabled()
})
for(const language of ['zh','en','ja']) test('mobile console and collection fit viewport in '+language,async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844})
  const errors=[];page.on('pageerror',error=>errors.push(error.message))
  await setup(page,{language})
  await page.goto('/account/dashboard')
  await expect(page.locator('.creator-console-metric')).toHaveCount(4)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:testInfo.outputPath('creator-dashboard-'+language+'-mobile.png'),fullPage:true})
  await page.goto('/account/favorites')
  await expect(page.locator('.creator-console-empty')).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  expect(errors).toEqual([])
})
test('anonymous collection is gated and save entry offers sign-in',async({page})=>{
  const calls=await setup(page,{signedIn:false})
  await page.goto('/account/favorites')
  await expect(page.getByRole('heading',{name:'Sign In Required'})).toBeVisible()
  expect(calls.some(call=>call.path==='/api/account/favorites')).toBe(false)
  await page.goto(work.url)
  await expect(page.getByRole('link',{name:'Sign in to save',exact:true})).toHaveAttribute('href','/login?mode=login')
})
