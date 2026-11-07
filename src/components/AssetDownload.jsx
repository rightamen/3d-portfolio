import {useRef,useState,useEffect} from 'react'
import {Link} from 'react-router-dom'
import {createWorkDownloadTicket} from '../lib/api'
const AssetDownload=({asset,authToken,handle,slug,copy})=>{
 const [busy,setBusy]=useState(false),[error,setError]=useState(false),alive=useRef(true)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 if(!authToken)return <Link className="work-file-locked" to="/login?mode=login">{copy.workFileLocked}</Link>
 return <span className="resource-file-download"><button type="button" disabled={busy} onClick={async()=>{
  if(busy)return;setBusy(true);setError(false)
  try{const data=await createWorkDownloadTicket(handle,slug,authToken,asset.id);if(alive.current)window.location.href=data.ticket.url}
  catch{if(alive.current)setError(true)}
  finally{if(alive.current)setBusy(false)}
 }}>{busy?copy.loading:copy.resourceDownload}</button>{error && <small role="alert">{copy.workFileLocked}</small>}</span>
}
export default AssetDownload
