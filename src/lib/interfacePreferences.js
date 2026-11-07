import { contrastRatio } from '../../server/themes.js'

export const INTERFACE_KEY='mrright-interface-preferences-v1'
export const INTERFACE_DEFAULTS=Object.freeze({theme:'native',accent:'#33c2cc',motion:'full',density:'comfortable',effects:true})
export const INTERFACE_THEMES=Object.freeze({
 native:{bg:'#0b0c12',panel:'#171820',raised:'#22242e',text:'#eeedf4',muted:'#aaadbd'},
 midnight:{bg:'#060914',panel:'#0e1421',raised:'#182234',text:'#edf3fa',muted:'#a2afc4'},
 graphite:{bg:'#111214',panel:'#1b1d20',raised:'#292c31',text:'#f1f0ee',muted:'#b1b2b4'},
 forest:{bg:'#0b1412',panel:'#15231e',raised:'#23382f',text:'#edf5ee',muted:'#a6c1b1'},
 ember:{bg:'#17100d',panel:'#261d17',raised:'#382b22',text:'#f8eee5',muted:'#cab5a3'},
 paper:{bg:'#f1eee6',panel:'#faf8f2',raised:'#e6e0d5',text:'#302d28',muted:'#686052'},
 porcelain:{bg:'#edf0f6',panel:'#fafbfe',raised:'#e0e5ef',text:'#292e42',muted:'#59627a'},
 system:null,
})
export const normalizeInterfacePreferences=input=>({
 theme:Object.hasOwn(INTERFACE_THEMES,input?.theme) ? input.theme : INTERFACE_DEFAULTS.theme,
 accent:/^#[0-9a-f]{6}$/i.test(input?.accent || '') ? input.accent.toLowerCase() : INTERFACE_DEFAULTS.accent,
 motion:['full','soft','off'].includes(input?.motion) ? input.motion : INTERFACE_DEFAULTS.motion,
 density:['comfortable','compact'].includes(input?.density) ? input.density : INTERFACE_DEFAULTS.density,
 effects:typeof input?.effects==='boolean' ? input.effects : INTERFACE_DEFAULTS.effects,
})
const mix=(a,b,t)=>'#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('')
export const resolveInterfacePalette=(preferences,dark=true)=>{
 const prefs=normalizeInterfacePreferences(preferences)
 const palette={...INTERFACE_THEMES[prefs.theme==='system' ? dark?'midnight':'porcelain':prefs.theme]}
 let accent=prefs.accent
 for(let step=1;step<=20 && Math.min(contrastRatio(accent,palette.bg),contrastRatio(accent,palette.panel))<3;step++)accent=mix(prefs.accent,palette.text,step/20)
 return {...palette,accent,onAccent:contrastRatio('#ffffff',accent)>contrastRatio('#000000',accent)?'#ffffff':'#000000',light:contrastRatio(palette.bg,'#000000')>contrastRatio(palette.bg,'#ffffff')}
}
export const resolveInterfaceMotion=(preferences,reduced=false)=>reduced ? 'off':normalizeInterfacePreferences(preferences).motion
