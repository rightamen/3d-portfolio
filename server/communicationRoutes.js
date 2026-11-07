import {SocialError,socialFail,textField} from './socialValidation.js'
import {messageInput,messageSequence,feedReadInput} from './communicationValidation.js'
export const registerCommunicationRoutes=({app,store,requireVisitor,requireWorksStore,sendData,sendPage,sendError,codes,normalizePagination,toPaginatedPayload,limiter})=>{
 const wrap=run=>async(req,res,next)=>{try{if(Object.values(req.params).some(value=>String(value).includes(String.fromCharCode(0))))socialFail('Invalid identifier.');await run(req,res)}catch(error){if(error instanceof SocialError || error.code==='23505'){const status=error.code==='23505'?409:error.status;return sendError(res,status===429?codes.RATE_LIMITED:status===403||status===404?codes.RESOURCE_FORBIDDEN:codes.VALIDATION_ERROR,error.code==='23505'?'Message retry key already used.':error.message,status)}next(error)}}
 const route=(method,path,run)=>app[method](path,requireVisitor,requireWorksStore,(_req,res,next)=>{res.set('Cache-Control','private, no-store');next()},...(method==='get'?[]:[limiter]),wrap(run))
 const paged=(res,result,key,page,limit)=>{const payload=toPaginatedPayload(result,page,limit);return sendPage(res,{[key]:payload.items},payload.pagination)}
 route('get','/api/account/communication/summary',async(req,res)=>sendData(res,await store.communicationSummary(req.visitorUser.id)))
 route('get','/api/account/messages/threads',async(req,res)=>{
  const tab=req.query.tab || 'inbox';if(!['inbox','requests'].includes(tab))socialFail('Unknown inbox.')
  const paging=normalizePagination(req.query,20,50)
  return paged(res,await store.listConversations(req.visitorUser.id,{tab,...paging}),'threads',paging.page,paging.limit)
 })
 route('post','/api/account/messages/threads',async(req,res)=>{const handle=textField(req.body?.handle,40,{required:true});if(handle.includes(String.fromCharCode(0)))socialFail('Invalid creator.');return sendData(res,{thread:await store.openConversation(req.visitorUser.id,handle)})})
 route('get','/api/account/messages/threads/:id',async(req,res)=>sendData(res,await store.getConversation(req.visitorUser.id,req.params.id,{before:messageSequence(req.query.before,{optional:true})})))
 route('post','/api/account/messages/threads/:id/messages',async(req,res)=>sendData(res,{message:await store.sendMessage(req.visitorUser.id,req.params.id,messageInput(req.body))}))
 route('put','/api/account/messages/threads/:id/read',async(req,res)=>sendData(res,await store.readConversation(req.visitorUser.id,req.params.id,messageSequence(req.body?.seq))))
 route('patch','/api/account/messages/threads/:id',async(req,res)=>{
  if(!['accept','decline','block','unblock'].includes(req.body?.action))socialFail('Unknown conversation action.')
  return sendData(res,{thread:await store.changeConversation(req.visitorUser.id,req.params.id,req.body.action)})
 })
 route('get','/api/account/following-feed',async(req,res)=>{
  const kind=req.query.kind || '';if(!['','work','post','notice','resource'].includes(kind))socialFail('Unknown update type.')
  const paging=normalizePagination(req.query,20,50)
  return paged(res,await store.listFollowingFeed(req.visitorUser.id,{kind,...paging}),'items',paging.page,paging.limit)
 })
 route('put','/api/account/following-feed/read',async(req,res)=>sendData(res,await store.readFollowingFeed(req.visitorUser.id,feedReadInput(req.body))))
}
