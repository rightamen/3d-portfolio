import {useEffect} from 'react'
import {useSocialResource} from './useSocialResource'
export const communicationChanged=()=>window.dispatchEvent(new Event('mrright-communication-changed'))
export const useLiveCommunication=(path,token,interval=3000)=>{
 const resource=useSocialResource(path,token,0,true)
 const refresh=resource.refresh,busy=resource.busy
 useEffect(()=>{
  if(!token || !path)return
  const update=()=>{if(!busy && !document.hidden && navigator.onLine)refresh()}
  const timer=setInterval(update,interval)
  document.addEventListener('visibilitychange',update)
  window.addEventListener('focus',update);window.addEventListener('online',update);window.addEventListener('mrright-communication-changed',update)
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',update);window.removeEventListener('focus',update);window.removeEventListener('online',update);window.removeEventListener('mrright-communication-changed',update)}
 },[path,token,refresh,interval,busy])
 return resource
}
