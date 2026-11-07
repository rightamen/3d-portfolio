import { useState } from 'react'
import { getCopy } from '../lib/i18n'
import { INTERFACE_THEMES,resolveInterfacePalette } from '../lib/interfacePreferences'
import { resetInterfacePreferences,setInterfacePreferences,useInterfaceMotion,useInterfacePreferences } from '../hooks/useInterfacePreferences'

const themeLabels={native:'uiThemeNative',midnight:'uiThemeMidnight',graphite:'uiThemeGraphite',forest:'uiThemeForest',ember:'uiThemeEmber',paper:'uiThemePaper',porcelain:'uiThemePorcelain',system:'uiThemeSystem'}
const InterfaceSettings=({language='zh',standalone=false})=>{
 const copy=getCopy(language),preferences=useInterfacePreferences(),motion=useInterfaceMotion()
 const [persisted,setPersisted]=useState(true)
 const update=patch=>setPersisted(setInterfacePreferences(patch))
 const Heading=standalone?'h1':'h2',Container=standalone?'main':'section'
 return <Container className={'interface-settings'+(standalone?' interface-settings-page':'')} aria-labelledby="interface-settings-title">
  <header className="interface-settings-header"><p className="section-kicker">{copy.uiKicker}</p><Heading id="interface-settings-title">{copy.uiTitle}</Heading><p>{copy.uiIntro}</p></header>
  <div className="interface-settings-layout"><div className="interface-settings-controls">
   <section className="interface-setting-group"><h3>{copy.uiThemes}</h3><p>{copy.uiThemesHint}</p><div className="interface-theme-grid" role="group" aria-label={copy.uiThemes}>{Object.keys(INTERFACE_THEMES).map(theme=>{
    const palette=resolveInterfacePalette({...preferences,theme},true)
    return <button type="button" aria-pressed={preferences.theme===theme} className="interface-theme-choice" key={theme} onClick={()=>update({theme})}><span className="interface-theme-swatch" style={{background:palette.bg,borderColor:palette.muted}} aria-hidden="true"><i style={{background:palette.panel}}/><i style={{background:palette.accent}}/><i style={{background:palette.raised}}/></span><span>{copy[themeLabels[theme]]}</span><b aria-hidden="true">{preferences.theme===theme?'✓':'○'}</b></button>
   })}</div></section>
   <section className="interface-setting-group"><h3>{copy.uiAccent}</h3><p>{copy.uiAccentHint}</p><div className="interface-color-controls"><label><span>{copy.uiAccent}</span><input type="color" value={preferences.accent} onChange={event=>update({accent:event.target.value})}/></label><code>{preferences.accent.toUpperCase()}</code><div className="interface-accent-swatches">{['#33c2cc','#b7a3ee','#cf9d68','#86b59b','#df92ab'].map(accent=><button key={accent} type="button" style={{background:accent}} aria-label={accent} aria-pressed={preferences.accent===accent} onClick={()=>update({accent})}/>)}</div></div></section>
   <section className="interface-setting-group"><h3>{copy.uiMotion}</h3><p>{copy.uiMotionHint}</p><div className="interface-segment" role="group" aria-label={copy.uiMotion}>{[['full',copy.uiMotionFull],['soft',copy.uiMotionSoft],['off',copy.uiMotionOff]].map(([value,label])=><button key={value} type="button" aria-pressed={preferences.motion===value} onClick={()=>update({motion:value})}>{label}</button>)}</div>{motion==='off' && preferences.motion!=='off' && <p className="interface-system-note">{copy.uiSystemReduced}</p>}<label className="interface-toggle"><span><strong>{copy.uiEffects}</strong><small>{copy.uiEffectsHint}</small></span><input type="checkbox" checked={preferences.effects} onChange={event=>update({effects:event.target.checked})}/></label></section>
   <section className="interface-setting-group"><h3>{copy.uiDensity}</h3><p>{copy.uiDensityHint}</p><div className="interface-segment" role="group" aria-label={copy.uiDensity}>{[['comfortable',copy.uiComfortable],['compact',copy.uiCompact]].map(([value,label])=><button key={value} type="button" aria-pressed={preferences.density===value} onClick={()=>update({density:value})}>{label}</button>)}</div></section>
  </div><aside className="interface-live-preview"><p className="section-kicker">{copy.uiPreview}</p><div className="interface-preview-orbit" aria-hidden="true"><i/><i/><b>✦</b></div><h3>{copy.uiPreviewTitle}</h3><p>{copy.uiPreviewBody}</p><span className="interface-preview-action">{copy.uiPreviewAction} ↗</span><div className="interface-preview-bars" aria-hidden="true">{[28,48,37,75,62,89,68,100].map((height,index)=><i key={index} style={{height:height+'%'}}/>)}</div></aside></div>
  <footer className="interface-settings-footer"><p role="status">{persisted?copy.uiSaved:copy.uiSaveFailed}</p><button type="button" className="secondary-action" onClick={()=>setPersisted(resetInterfacePreferences())}>{copy.uiReset}</button></footer>
 </Container>
}
export default InterfaceSettings
