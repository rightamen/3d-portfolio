import { socialFail,textField } from './socialValidation.js'
export const messageInput=body=>{
 const text=textField(body?.body,4000,{required:true})
 if(text.includes(String.fromCharCode(0)))socialFail('Unsupported message character.')
 if(typeof body?.clientId!=='string' || !/^[a-zA-Z0-9-]{16,80}$/.test(body.clientId))socialFail('A valid message retry key is required.')
 return {body:text,clientId:body.clientId}
}
export const messageSequence=(value,{optional=false}={})=>{
 if(optional && value===undefined)return null
 if(!['number','string'].includes(typeof value) || String(value).trim()==='')socialFail('Invalid message position.')
 const n=Number(value)
 if(!Number.isSafeInteger(n) || n<0 || n>2147483647)socialFail('Invalid message position.')
 return n
}
export const feedReadInput=body=>{
 if(!Array.isArray(body?.items) || !body.items.length || body.items.length>50)socialFail('Choose up to 50 displayed updates.')
 return body.items.map(item=>{
  if(!['work','post','notice','resource'].includes(item?.kind))socialFail('Unknown update type.')
  const id=textField(item.id,100,{required:true});if(id.includes(String.fromCharCode(0)))socialFail('Invalid update identifier.')
  return {kind:item.kind,id}
 })
}
