import { useLayoutEffect } from 'react'
import { useInterfacePreferences } from '../hooks/useInterfacePreferences'
import { resolveInterfacePalette,resolveInterfaceMotion } from '../lib/interfacePreferences'

const InterfaceRoot=({children})=>{
 const preferences=useInterfacePreferences()
 useLayoutEffect(()=>{
  const root=document.documentElement
  const dark=window.matchMedia('(prefers-color-scheme: dark)'),reduced=window.matchMedia('(prefers-reduced-motion: reduce)')
  let frame=0
  const apply=()=>{
   const palette=resolveInterfacePalette(preferences,dark.matches),motion=resolveInterfaceMotion(preferences,reduced.matches)
   root.dataset.uiTheme=preferences.theme;root.dataset.uiTone=palette.light?'light':'dark'
   root.dataset.uiCustom=String(preferences.theme!=='native' || preferences.accent!=='#33c2cc')
   root.dataset.uiMotion=motion;root.dataset.uiDensity=preferences.density;root.dataset.uiEffects=String(preferences.effects)
   Object.entries(palette).filter(([,value])=>typeof value==='string').forEach(([key,value])=>root.style.setProperty('--ui-'+key.replace(/[A-Z]/g,letter=>'-'+letter.toLowerCase()),value))
   root.style.setProperty('--ui-line',palette.light?'#242c431e':'#c2d1e51c')
   root.style.setProperty('--ui-soft',palette.light?'#242c4308':'#ffffff06')
   root.style.setProperty('--ui-timing',motion==='full'?'1':motion==='soft'?'.55':'0')
   if(motion==='off')document.getAnimations().forEach(animation=>animation.cancel())
  }
  const move=event=>{
   if(frame || event.pointerType!=='mouse' || !preferences.effects || resolveInterfaceMotion(preferences,reduced.matches)!=='full')return
   const x=event.clientX,y=event.clientY
   frame=requestAnimationFrame(()=>{frame=0;root.style.setProperty('--ui-pointer-x',x+'px');root.style.setProperty('--ui-pointer-y',y+'px')})
  }
  const hidden=()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0}}
  dark.addEventListener('change',apply);reduced.addEventListener('change',apply)
  window.addEventListener('pointermove',move,{passive:true});document.addEventListener('visibilitychange',hidden)
  apply()
  return()=>{cancelAnimationFrame(frame);dark.removeEventListener('change',apply);reduced.removeEventListener('change',apply);window.removeEventListener('pointermove',move);document.removeEventListener('visibilitychange',hidden)}
 },[preferences])
 return <>{children}<div className="interface-atmosphere" aria-hidden="true" /></>
}
export default InterfaceRoot
