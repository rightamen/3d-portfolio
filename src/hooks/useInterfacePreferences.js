import { useSyncExternalStore } from 'react'
import { INTERFACE_DEFAULTS,INTERFACE_KEY,normalizeInterfacePreferences,resolveInterfaceMotion } from '../lib/interfacePreferences'
let current=INTERFACE_DEFAULTS
const listeners=new Set()
const read=()=>{try{return normalizeInterfacePreferences(JSON.parse(window.localStorage.getItem(INTERFACE_KEY)))}catch{return INTERFACE_DEFAULTS}}
if(typeof window!=='undefined')current=read()
const notify=()=>{listeners.forEach(listener=>listener());window.dispatchEvent(new Event('mrright-interface-change'))}
if(typeof window!=='undefined')window.addEventListener('storage',event=>{
 if(event.key===INTERFACE_KEY || event.key===null){current=read();notify()}
})
const subscribe=listener=>{listeners.add(listener);return()=>listeners.delete(listener)}
export const getInterfacePreferences=()=>current
export const setInterfacePreferences=patch=>{
 current=normalizeInterfacePreferences({...current,...patch})
 let persisted=true
 try{window.localStorage.setItem(INTERFACE_KEY,JSON.stringify(current))}catch{persisted=false}
 notify();return persisted
}
export const resetInterfacePreferences=()=>setInterfacePreferences(INTERFACE_DEFAULTS)
export const useInterfacePreferences=()=>useSyncExternalStore(subscribe,getInterfacePreferences,()=>INTERFACE_DEFAULTS)
export const readInterfaceMotion=()=>resolveInterfaceMotion(current,typeof window!=='undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
export const readInterfaceEffects=()=>current.effects && readInterfaceMotion()==='full'
export const useInterfaceMotion=()=>{
 const prefs=useInterfacePreferences()
 const reduced=useSyncExternalStore(callback=>{
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');media.addEventListener('change',callback);return()=>media.removeEventListener('change',callback)
 },()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches,()=>false)
 return resolveInterfaceMotion(prefs,reduced)
}
