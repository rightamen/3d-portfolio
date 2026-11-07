import { useCallback,useEffect,useRef,useState } from 'react'
import { getPrivateSocial } from '../lib/api'
export const useSocialResource=(path,authToken,version=0,keepDataOnError=false)=>{
 const [revision,setRevision]=useState(0),[loaded,setLoaded]=useState({key:'',data:null,error:null}),[action,setAction]=useState({key:'',busy:false,error:null})
 const epoch=useRef(0),lock=useRef(false),identity=JSON.stringify([path,authToken]),key=JSON.stringify([path,authToken,revision,version])
 useEffect(()=>{
  const current=++epoch.current;lock.current=false
  if(path && authToken)getPrivateSocial(path,authToken).then(data=>{if(epoch.current===current)setLoaded({key,identity,data,error:null})}).catch(error=>{if(epoch.current===current)setLoaded(previous=>({key,identity,data:keepDataOnError && previous.identity===identity?previous.data:null,error}))})
  return()=>{epoch.current=current+1}
 },[path,authToken,key,identity,keepDataOnError])
 const refresh=useCallback(()=>setRevision(x=>x+1),[])
 const mutate=async operation=>{
  if(lock.current)return null
  lock.current=true;const current=epoch.current;setAction({key,busy:true,error:null})
  try{const result=await operation();if(epoch.current!==current)return null;setAction({key,busy:false,error:null});refresh();return result}
  catch(error){if(epoch.current===current)setAction({key,busy:false,error});return null}
  finally{if(epoch.current===current)lock.current=false}
 }
 return {data:loaded.identity===identity?loaded.data:null,error:loaded.key===key?loaded.error:null,loading:Boolean(path && authToken && loaded.key!==key),actionError:action.key===key?action.error:null,busy:action.key===key && action.busy,refresh,mutate}
}
export const socialErrorText=(error,copy)=>error?.status===429?copy.socialWait:copy.socialError
