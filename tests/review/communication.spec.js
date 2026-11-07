import {expect,test} from '@playwright/test'
import {setup,respond} from './helpers/social-fixtures'
const base='/api/account/messages/threads'
const fixture=async(page,{signedIn=true,language='en',pending=false,pendingOut=false,failSend=false,commitBeforeFail=false,failRead=false,failMarkRead=false}={})=>{
 const person={handle:'studio',displayName:'Studio',avatarUrl:'',available:true}
 const state={messages:[{id:'message-1',seq:1,body:'A conversation about creative work.',mine:false,createdAt:'2026-11-07T10:00:00Z'}],thread:{id:'thread-1',peer:person,status:pending?'pending':'active',direction:pending?'incoming':'outgoing',blocked:false,blockedByMe:false,lastSeq:1,readSeq:0,peerReadSeq:0,unread:1},sent:[],reads:[],failSend,failRead,items:[{id:'work-1',kind:'work',title:'A new studio object',body:'Exploring light and material.',image:'/assets/projects/fire-extinguisher.png',url:'/w/studio/console-work',createdAt:'2026-11-07T10:00:00Z',unread:true,author:person},{id:'notice-1',kind:'notice',title:'',body:'Behind the scenes from the studio.',url:'/u/studio',createdAt:'2026-11-07T09:00:00Z',unread:true,author:person}]}
 if(pendingOut){state.messages=[];state.thread.status='pending';state.thread.direction='outgoing';state.thread.lastSeq=0}
 const handler=async(route,url)=>{
  const path=url.pathname,method=route.request().method(),body=method==='GET'?{}:route.request().postDataJSON()
  if(path==='/api/account/communication/summary')return respond(route,{messagesUnread:state.thread.unread,requestsUnread:pending?1:0,feedUnread:state.items.filter(i=>i.unread).length})
  if(path==='/api/creators')return respond(route,{creators:[{...person,workCount:1}]},{pagination:{page:1,total:1,hasNext:false}})
  if(path===base && method==='POST')return respond(route,{thread:state.thread})
  if(path===base)return respond(route,{threads:[state.thread]},{pagination:{page:1,total:1,hasNext:false}})
  if(path===base+'/thread-1' && method==='PATCH'){if(body.action==='accept')state.thread.status='active';if(body.action==='decline')state.thread.status='declined';if(body.action==='block'){state.thread.blocked=true;state.thread.blockedByMe=true}if(body.action==='unblock'){state.thread.blocked=false;state.thread.blockedByMe=false}return respond(route,{thread:state.thread})}
  if(path===base+'/thread-1')return respond(route,{thread:state.thread,messages:state.messages,hasOlder:false})
  if(path.endsWith('/read') && path.startsWith(base)){state.reads.push(body.seq);if(failMarkRead){failMarkRead=false;return respond(route,null,{status:503})}state.thread.unread=0;return respond(route,{readSeq:body.seq})}
  if(path.endsWith('/messages') && path.startsWith(base)){state.sent.push(body);const prior=state.messages.find(m=>m.clientId===body.clientId);if(prior)return respond(route,{message:prior});if(state.failSend && !commitBeforeFail){state.failSend=false;return respond(route,null,{status:503})}const message={id:'message-'+(state.messages.length+1),seq:state.messages.length+1,clientId:body.clientId,body:body.body,mine:true,createdAt:new Date().toISOString()};state.messages.push(message);state.thread.lastSeq=message.seq;if(state.failSend){state.failSend=false;return respond(route,null,{status:503})}return respond(route,{message})}
  if(path==='/api/account/following-feed'){if(state.failRead){state.failRead=false;return respond(route,null,{status:503})}const kind=url.searchParams.get('kind'),items=state.items.filter(i=>!kind||i.kind===kind);return respond(route,{items},{pagination:{page:1,total:items.length,hasNext:false}})}
  if(path==='/api/account/following-feed/read'){for(const item of state.items)if(body.items.some(i=>i.kind===item.kind&&i.id===item.id))item.unread=false;return respond(route,{read:true})}
  throw new Error('Unexpected communication route '+path)
 }
 const handlers=new Proxy({},{get:(_,path)=>path.startsWith(base)||path.startsWith('/api/account/following-feed')||path==='/api/account/communication/summary'||path==='/api/creators'?handler:undefined})
 const calls=await setup(page,{signedIn,language,handlers});return {state,calls}
}
test('global message and following entry points expose unread badges and open their real surfaces',async({page})=>{
 await fixture(page);await page.goto('/community')
 const nav=page.locator('.communication-nav')
 await expect(nav.getByRole('link',{name:'Messages',exact:true})).toHaveAttribute('href','/messages')
 await expect(nav.getByRole('link',{name:'Following feed',exact:true})).toHaveAttribute('href','/following')
 await expect(nav.locator('b')).toHaveCount(2)
 await nav.getByRole('link',{name:'Messages',exact:true}).click();await page.locator('.dm-thread').click();await expect(page.locator('.dm-message')).toHaveCount(1)
 await page.locator('.topbar-avatar').click();await expect(page.getByRole('menuitem',{name:'Messages',exact:true})).toHaveAttribute('href','/messages');await expect(page.getByRole('menuitem',{name:'Following feed',exact:true})).toHaveAttribute('href','/following')
})
test('failed sends preserve text, retry the same key, and new messages and read receipts update automatically',async({page},info)=>{
 const {state}=await fixture(page,{failSend:true});await page.goto('/messages/thread-1')
 const box=page.getByRole('textbox',{name:'Write a message…',exact:true});await box.fill('A message that must arrive once');await box.press('Enter')
 await expect(page.locator('.dm-composer [role=alert]')).toContainText('Could not send. Your message is kept; retrying will not send a duplicate.');await expect(box).toHaveValue('A message that must arrive once')
 await page.locator('.dm-composer').getByRole('button',{name:'Retry',exact:true}).click();await expect(page.locator('.dm-message')).toHaveCount(2);expect(state.sent[0].clientId).toBe(state.sent[1].clientId);await expect(box).toHaveValue('')
 state.messages.push({id:'message-new',seq:3,body:'A live reply',mine:false,createdAt:new Date().toISOString()});state.thread.lastSeq=3;state.thread.peerReadSeq=2
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
 await expect(page.locator('.dm-message')).toHaveCount(3);await expect(page.locator('.dm-message.is-mine footer')).toContainText('Read')
 await page.screenshot({path:info.outputPath('chat-desktop.png'),fullPage:true,animations:'disabled'})
})
test('request acceptance, declining and blocking are explicit and block disables both composer and send',async({page})=>{
 await fixture(page,{pending:true});await page.goto('/messages/thread-1')
 const box=page.getByRole('textbox',{name:'Write a message…',exact:true});await expect(box).toBeDisabled()
 await page.getByRole('button',{name:'Accept request',exact:true}).click();await expect(box).toBeEnabled()
 await page.getByRole('button',{name:'Block conversation',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirm',exact:true}).click()
 await expect(box).toBeDisabled();await page.getByRole('button',{name:'Unblock',exact:true}).click();await expect(box).toBeEnabled()
})
test('new-message dialog finds a creator, releases focus and opens the conversation',async({page})=>{
 await fixture(page);await page.goto('/messages');await page.getByRole('button',{name:'New message +',exact:true}).click()
 const dialog=page.getByRole('dialog');await expect(dialog.getByRole('link',{name:/Studio/})).toBeVisible();await dialog.getByRole('link',{name:/Studio/}).click()
 await expect(dialog).toHaveCount(0);await expect(page).toHaveURL(/messages\/thread-1$/);await expect(page.locator('.dm-conversation-head strong')).toHaveText('Studio')
})
test('following feed filters sources, marks only displayed items as read and retries failure',async({page},info)=>{
 const {state}=await fixture(page,{failRead:true});await page.goto('/following');await page.getByRole('alert').getByRole('button',{name:'Retry',exact:true}).click()
 await expect(page.locator('.following-card')).toHaveCount(2)
 await page.getByRole('button',{name:'New work',exact:true}).click();await expect(page.locator('.following-card')).toHaveCount(1)
 await page.getByRole('button',{name:'Mark this page as read',exact:true}).click();await expect(page.locator('.following-unread')).toHaveCount(0)
 expect(state.items.find(i=>i.kind==='notice').unread).toBe(true)
 await page.getByRole('button',{name:'All',exact:true}).click();await expect(page.locator('.following-unread')).toHaveCount(1)
 await page.screenshot({path:info.outputPath('following-desktop.png'),fullPage:true,animations:'disabled'})
})
test('anonymous messages and following are gated before making private requests',async({page})=>{
 const {calls}=await fixture(page,{signedIn:false});await page.goto('/messages');await expect(page.locator('.communication-gate')).toBeVisible();await expect(page.locator('.communication-gate').getByRole('link')).toHaveAttribute('href','/login?mode=login')
 await page.goto('/following');await expect(page.locator('.communication-gate')).toBeVisible();expect(calls.some(c=>c.path.startsWith('/api/account/'))).toBe(false)
})
for(const [language,label,placeholder] of [['zh','消息','写下你想说的话…'],['en','Messages','Write a message…'],['ja','メッセージ','メッセージを書く…']]){
 test('phone chat and following stay readable with a light theme in '+language,async({page},info)=>{
  await page.setViewportSize({width:390,height:844});await fixture(page,{language});await page.addInitScript(()=>localStorage.setItem('mrright-interface-preferences-v1',JSON.stringify({theme:'paper',motion:'off',effects:false,density:'comfortable'})))
  await page.goto('/messages/thread-1');await expect(page.getByRole('textbox',{name:placeholder,exact:true})).toBeVisible()
  await expect(page.locator('.communication-nav').getByRole('link',{name:label,exact:true})).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:info.outputPath('chat-phone-'+language+'.png'),fullPage:true,animations:'disabled'})
  await page.locator('.dm-back').click();await expect(page.locator('.dm-sidebar')).toBeVisible()
  await page.goto('/following');await expect(page.locator('.following-card')).toHaveCount(2);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:info.outputPath('following-phone-'+language+'.png'),fullPage:true,animations:'disabled'})
 })
}
test('poll failure retains the conversation and draft; Shift Enter produces a newline',async({page})=>{
 await fixture(page);await page.goto('/messages/thread-1');const box=page.getByRole('textbox',{name:'Write a message…',exact:true});await box.fill('First line');await box.press('Shift+Enter');await box.press('A')
 await page.route('**/api/account/messages/threads/thread-1',route=>respond(route,null,{status:503}))
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.locator('.dm-main').getByRole('alert')).toBeVisible()
 await expect(page.locator('.dm-message')).toHaveCount(1);await expect(box).toHaveValue('First line\nA')
})

test('late messages from a previous signed-in account cannot enter the next account view',async({page})=>{
 await fixture(page)
 let release,requested=false
 const gate=new Promise(resolve=>{release=resolve})
 await page.route('**/api/account/messages/threads/thread-1',async route=>{
  if(route.request().headers().authorization?.includes('console-session')){requested=true;await gate;return respond(route,{thread:{id:'thread-1',peer:{available:true,displayName:'Previous account'},status:'active',lastSeq:1},messages:[{id:'old-private',seq:1,body:'Previous account private text',mine:false,createdAt:new Date().toISOString()}]})}
  return respond(route,null,{status:404})
 })
 try{
  await page.goto('/messages/thread-1');await expect.poll(()=>requested).toBe(true)
  await page.evaluate(()=>{localStorage.setItem('mrright-visitor-token','second-session');window.dispatchEvent(new StorageEvent('storage',{key:'mrright-visitor-token'}))})
  await expect(page.locator('.dm-main').getByRole('alert')).toBeVisible()
  const finished=page.waitForResponse(r=>r.url().endsWith('/threads/thread-1') && r.request().headers().authorization?.includes('console-session'))
  release();await finished
  await expect(page.getByText('Previous account private text',{exact:true})).toHaveCount(0)
 }finally{release()}
})

test('an uncertain first request can retry after polling reveals it was already delivered',async({page})=>{
 const {state}=await fixture(page,{pendingOut:true,failSend:true,commitBeforeFail:true})
 await page.goto('/messages/thread-1');const box=page.getByRole('textbox',{name:'Write a message…',exact:true})
 await box.fill('The first request');await page.locator('.dm-composer').getByRole('button',{name:'Send',exact:true}).click()
 await expect(page.locator('.dm-composer [role=alert]')).toBeVisible()
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.locator('.dm-message')).toHaveCount(1)
 await page.locator('.dm-composer').getByRole('button',{name:'Retry',exact:true}).click()
 await expect(page.locator('.dm-composer [role=alert]')).toHaveCount(0)
 expect(state.messages).toHaveLength(1);expect(state.sent[0].clientId).toBe(state.sent[1].clientId)
})

test('a transient read acknowledgement failure retries while the visible conversation stays open',async({page})=>{
 const {state}=await fixture(page,{failMarkRead:true});await page.goto('/messages/thread-1');await page.bringToFront()
 await expect(page.locator('.dm-message')).toHaveCount(1)
 await expect.poll(()=>state.reads.length,{timeout:10000}).toBeGreaterThanOrEqual(2)
 expect(state.thread.unread).toBe(0)
})

test('background polling cannot interrupt a slow conversation action or leave its dialog open',async({page})=>{
 await page.clock.install();await fixture(page)
 let release,started=false
 const gate=new Promise(resolve=>{release=resolve})
 await page.route('**/api/account/messages/threads/thread-1',async route=>{
  if(route.request().method()==='PATCH'){started=true;await gate}
  return route.fallback()
 })
 try{
  await page.goto('/messages/thread-1');await expect(page.locator('.dm-message')).toHaveCount(1)
  await page.getByRole('button',{name:'Block conversation',exact:true}).click()
  const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Confirm',exact:true}).click()
  await expect.poll(()=>started).toBe(true);await expect(dialog.getByRole('button',{name:'Confirm',exact:true})).toBeDisabled()
  await page.clock.runFor(4000);await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  release();await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name:'Unblock',exact:true})).toBeVisible()
 }finally{release()}
})
