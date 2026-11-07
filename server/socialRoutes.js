import { SocialError,collectionInput,reportInput,socialFail,textField } from './socialValidation.js'
// Kept under existing visitor/admin authentication and the API v1 envelope.
export const registerSocialRoutes=({app,store,requireVisitor,requireAdmin,requireWorksStore,sendData,sendPage,sendError,codes,normalizePagination,toPaginatedPayload,limiter})=>{
 const privateRead=(_req,res,next)=>{res.set('Cache-Control','private, no-store');next()}
 const wrap=run=>async(req,res,next)=>{try{await run(req,res)}catch(error){if(error instanceof SocialError || error.code==='23505'){const status=error.code==='23505'?409:error.status;return sendError(res,status===429?codes.RATE_LIMITED:status===404?codes.RESOURCE_FORBIDDEN:codes.VALIDATION_ERROR,error.code==='23505'?'A folder with this name already exists.':error.message,status)}next(error)}}
 const account=(method,path,run)=>app[method](path,requireVisitor,requireWorksStore,privateRead,...(method==='get'?[]:[limiter]),wrap(run))
 const paged=(req,res,result,key,extra={})=>{const {page,limit}=normalizePagination(req.query,20,50);const payload=toPaginatedPayload(result,page,limit);return sendPage(res,{[key]:payload.items,...extra},payload.pagination)}
 account('get','/api/users/:handle/relationship',async(req,res)=>sendData(res,await store.getSocialState(req.visitorUser.id,req.params.handle)))
 account('put','/api/users/:handle/follow',async(req,res)=>{if(typeof req.body?.following!=='boolean')socialFail('Use a boolean following state.');return sendData(res,await store.setFollowing(req.visitorUser.id,req.params.handle,req.body.following))})
 account('delete','/api/account/following/:id',async(req,res)=>sendData(res,await store.removeFollowing(req.visitorUser.id,req.params.id)))
 account('put','/api/users/:handle/friend',async(req,res)=>sendData(res,await store.requestFriend(req.visitorUser.id,req.params.handle)))
 account('patch','/api/account/friends/:id',async(req,res)=>{if(!['accept','decline','cancel','remove'].includes(req.body?.action))socialFail('Unknown friend action.');return sendData(res,await store.changeFriend(req.visitorUser.id,req.params.id,req.body.action))})
 account('get','/api/account/connections',async(req,res)=>{const tab=req.query.tab || 'friends';if(!['friends','following','followers','incoming','outgoing'].includes(tab))socialFail('Unknown relationship list.');const result=await store.listConnections(req.visitorUser.id,{tab,...normalizePagination(req.query,20,50)});return paged(req,res,result,'connections',{counts:result.counts})})
 account('get','/api/account/people',async(req,res)=>{const query=textField(req.query.q ?? '',60);if(query.length<2)socialFail('Enter at least two characters.');return paged(req,res,await store.searchPeople(req.visitorUser.id,{query,...normalizePagination(req.query,20,50)}),'people')})
 account('get','/api/account/collections',async(req,res)=>sendData(res,{collections:await store.listCollections(req.visitorUser.id)}))
 account('post','/api/account/collections',async(req,res)=>sendData(res,{collection:await store.createCollection(req.visitorUser.id,collectionInput(req.body))}))
 account('patch','/api/account/collections/:id',async(req,res)=>sendData(res,{collection:await store.updateCollection(req.visitorUser.id,req.params.id,collectionInput(req.body))}))
 account('delete','/api/account/collections/:id',async(req,res)=>sendData(res,await store.deleteCollection(req.visitorUser.id,req.params.id)))
 account('get','/api/account/favorites/:workId/collections',async(req,res)=>sendData(res,{memberships:await store.getCollectionMemberships(req.visitorUser.id,req.params.workId)}))
 account('put','/api/account/collections/:id/works/:workId',async(req,res)=>{if(typeof req.body?.included!=='boolean')socialFail('Use a boolean membership state.');return sendData(res,await store.setCollectionItem(req.visitorUser.id,req.params.id,req.params.workId,req.body.included))})
 account('post','/api/reports',async(req,res)=>sendData(res,{report:await store.createReport(req.visitorUser.id,reportInput(req.body))}))
 account('get','/api/account/reports',async(req,res)=>paged(req,res,await store.listReports(req.visitorUser.id,normalizePagination(req.query,20,50)),'reports'))
 app.get('/api/admin/reports',requireAdmin,requireWorksStore,privateRead,wrap(async(req,res)=>{const status=req.query.status || null;if(status && !['open','resolved','dismissed'].includes(status))socialFail('Unknown report status.');return paged(req,res,await store.listReports(null,{admin:true,status,...normalizePagination(req.query,20,50)}),'reports')}))
 app.patch('/api/admin/reports/:id',requireAdmin,requireWorksStore,privateRead,wrap(async(req,res)=>{if(!['resolved','dismissed'].includes(req.body?.status))socialFail('Choose a resolution.');const resolution=textField(req.body?.resolution,1000,{required:true});return sendData(res,{report:await store.resolveReport(req.params.id,req.adminAuth?.adminUserId ?? null,{status:req.body.status,resolution})})}))
}
