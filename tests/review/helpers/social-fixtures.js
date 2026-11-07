

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
    if(path==='/api/works') return respond(route,{works:[work]},{pagination:{page:1,total:1,hasNext:false}})
    if(path==='/api/community/posts') return respond(route,{posts:[]})
    if(path==='/api/community/uploads') return respond(route,{uploads:[]})
    if(path==='/api/users/studio') return respond(route,{profile:{id:'maker',handle:'studio',displayName:'Studio',profilePublic:true,activityPublic:true,contactsPublic:false,skills:[],experience:[],highlights:[],stats:{workCount:1},themeTokens:{'--theme-surface':'#0f1320','--theme-text':'#e4e4ec','--theme-panel':'#191d2a','--theme-muted':'#a0a3b4'}},notices:[]})
    if(path.startsWith('/api/users/studio/')) return respond(route,{posts:[],uploads:[],comments:[],likes:[]})
    if(path==='/api/profile') return respond(route,{ownerHandle:'studio',profile:{}})
    if(path==='/api/auth/me') return respond(route,{user:{id:route.request().headers().authorization?.includes('second-session')?'second':'console',handle:'console',email:'local@example.test',displayName:'Creator',emailVerified:true}})
    if(path==='/api/auth/logout') return respond(route,{ok:true})
    if(path==='/api/account/profile') return respond(route,{profile:{id:'console',handle:'console',displayName:'Creator',stats:{}}})
    if(path==='/api/account/community') return respond(route,{posts:[],uploads:[]})
    if(path==='/api/account/comments') return respond(route,{comments:[],likeCount:0})
    if(path==='/api/account/downloads') return respond(route,{requests:[],downloads:[]})
    if(path==='/api/account/notifications/unread') return respond(route,{unread:0})
    if(path==='/api/account/works') return respond(route,{works:[work]},{pagination:{page:1,total:1,hasNext:false}})
    if(path==='/api/account/analytics') return respond(route,{analytics:report(Number(url.searchParams.get('days')))},{pagination:{page:1,total:1,limit:20,hasNext:false}})
    if(path==='/api/account/favorites') return respond(route,{favorites:saved?[{workId:work.id,available:true,work,savedAt:new Date().toISOString()}]:[]},{pagination:{page:1,total:saved?1:0,limit:24,hasNext:false}})
    if(path==='/api/account/favorites/'+work.id) {saved=false;return respond(route,{saved})}
    if(path==='/api/works/studio/console-work') return respond(route,{work})
    if(path.endsWith('/favorite')) {if(method==='PUT')saved=true;return respond(route,{saved})}
    if(path.endsWith('/likes')) return respond(route,{likeCount:0,liked:false})
    if(path.endsWith('/comments')) return respond(route,{comments:[]})
    if(path.endsWith('/rating')) return respond(route,{ratings:work.ratings,mine:null,contentVersion:1})
    if(path==='/api/account/communication/summary')return respond(route,{messagesUnread:0,requestsUnread:0,feedUnread:0})
    throw new Error('Unexpected API route '+path)
  })
  return calls
}


export {setup,respond,work}
