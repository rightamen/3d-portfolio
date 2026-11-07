export class SocialError extends Error { constructor(message,status=400){super(message);this.status=status} }
export const socialFail=(message,status=400)=>{throw new SocialError(message,status)}
export const textField=(value,max,{required=false}={})=>{
 if(typeof value!=='string' || value.length>max) socialFail('Invalid text field.')
 const text=value.trim();if(required && !text)socialFail('A name is required.');return text
}
export const collectionInput=body=>({name:textField(body?.name,50,{required:true}),description:textField(body?.description ?? '',300)})
export const REPORT_REASONS=['spam','harassment','copyright','inappropriate','fraud','other']
export const REPORT_TYPES=['user','work','post','comment','workComment','resource']
export const reportInput=body=>{
 if(!REPORT_TYPES.includes(body?.targetType)||!REPORT_REASONS.includes(body?.reason))socialFail('Invalid report category.')
 const targetId=textField(body.targetId,160,{required:true}),details=textField(body.details ?? '',2000)
 if(body.reason==='other' && details.length<10)socialFail('Please describe the issue in at least 10 characters.')
 return {targetType:body.targetType,targetId,reason:body.reason,details}
}
