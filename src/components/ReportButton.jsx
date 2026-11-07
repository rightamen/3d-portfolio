import { useState } from 'react'
import { Link } from 'react-router-dom'
import { writePrivateSocial } from '../lib/api'
import { socialErrorText,useSocialResource } from '../hooks/useSocialResource'
import SocialDialog from './SocialDialog'
import { reportReasons } from '../lib/reportReasons'
const ReportForm=({authToken,targetType,targetId,copy,onClose})=>{
 const [reason,setReason]=useState('spam'),[details,setDetails]=useState(''),[sent,setSent]=useState(false),resource=useSocialResource(null,authToken)
 return <SocialDialog title={copy.reportTitle} copy={copy} onClose={onClose}>{sent?<div className="social-success" role="status"><p>{copy.reportSuccess}</p><Link to="/account/reports" className="primary-action" onClick={onClose}>{copy.reportMine} ↗</Link></div>:<form className="social-form" onSubmit={async event=>{event.preventDefault();if(await resource.mutate(()=>writePrivateSocial('/api/reports',authToken,'POST',{targetType,targetId,reason,details})))setSent(true)}}><p>{copy.reportIntro}</p><label>{copy.reportReason}<select value={reason} onChange={e=>setReason(e.target.value)}>{reportReasons(copy).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label><label>{copy.reportDetails}<textarea value={details} onChange={e=>setDetails(e.target.value)} maxLength={2000} minLength={reason==='other'?10:0} required={reason==='other'} rows={5}/></label>{reason==='other' && <small>{copy.reportOtherHint}</small>}{resource.actionError && <p role="alert">{socialErrorText(resource.actionError,copy)}</p>}<div className="social-form-actions"><button type="button" className="secondary-action" onClick={onClose}>{copy.socialCancel}</button><button className="primary-action" type="submit" disabled={resource.busy || (reason==='other' && details.trim().length<10)}>{resource.busy?copy.loading:copy.reportSubmit}</button></div></form>}</SocialDialog>
}
const ReportButton=({authToken,copy,targetType,targetId})=>{
 const [open,setOpen]=useState(false)
 return <><button type="button" className="social-report-trigger" onClick={()=>setOpen(true)}>{copy.reportTitle}</button>{open && (authToken?<ReportForm key={authToken+'/'+targetType+'/'+targetId} authToken={authToken} targetType={targetType} targetId={targetId} copy={copy} onClose={()=>setOpen(false)}/>:<SocialDialog title={copy.reportTitle} copy={copy} onClose={()=>setOpen(false)}><Link className="primary-action" to="/login?mode=login" onClick={()=>setOpen(false)}>{copy.reportLogin}</Link></SocialDialog>)}</>
}
export default ReportButton
