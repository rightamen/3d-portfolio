import { describe,it,expect } from 'vitest'
import { contrastRatio } from '../../server/themes'
import { INTERFACE_DEFAULTS,INTERFACE_THEMES,normalizeInterfacePreferences,resolveInterfacePalette,resolveInterfaceMotion } from '../../src/lib/interfacePreferences'
describe('device-local interface preferences',()=>{
 it('rejects inherited, malformed and unknown settings without retaining extra data',()=>{
  expect(normalizeInterfacePreferences({theme:'__proto__',accent:'red;display:none',motion:'wild',density:'tiny',effects:'yes',token:'do not retain'})).toEqual(INTERFACE_DEFAULTS)
  expect(normalizeInterfacePreferences(null)).toEqual(INTERFACE_DEFAULTS)
  expect(normalizeInterfacePreferences({theme:'paper',accent:'#AABBCC',motion:'soft',density:'compact',effects:false})).toEqual({theme:'paper',accent:'#aabbcc',motion:'soft',density:'compact',effects:false})
 })
 it('keeps text and custom accents readable across every dark and light palette',()=>{
  for(const theme of Object.keys(INTERFACE_THEMES))for(const dark of [true,false])for(const accent of ['#000000','#ffffff','#777777','#ff0000','#0000ff','#33c2cc']){
   const palette=resolveInterfacePalette({theme,accent},dark)
   for(const surface of [palette.bg,palette.panel,palette.raised]){
    expect(contrastRatio(palette.text,surface),theme+' text').toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(palette.muted,surface),theme+' muted').toBeGreaterThanOrEqual(4.5)
   }
   expect(contrastRatio(palette.accent,palette.bg)).toBeGreaterThanOrEqual(3)
   expect(contrastRatio(palette.accent,palette.panel)).toBeGreaterThanOrEqual(3)
   expect(contrastRatio(palette.onAccent,palette.accent)).toBeGreaterThanOrEqual(4.5)
  }
 })
 it('resolves system appearance without changing the saved preference',()=>{
  expect(resolveInterfacePalette({theme:'system'},true).bg).toBe(INTERFACE_THEMES.midnight.bg)
  expect(resolveInterfacePalette({theme:'system'},false).bg).toBe(INTERFACE_THEMES.porcelain.bg)
 })
 it('always gives the operating system reduced-motion request priority',()=>{
  for(const motion of ['full','soft','off'])expect(resolveInterfaceMotion({motion},true)).toBe('off')
  expect(resolveInterfaceMotion({motion:'soft'},false)).toBe('soft')
  expect(resolveInterfaceMotion({motion:'off'},false)).toBe('off')
 })
})
