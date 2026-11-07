import { describe,it,expect } from 'vitest'
import { collectionInput,reportInput,SocialError } from '../../server/socialValidation.js'
describe('social input boundaries',()=>{
 it('accepts trimmed multilingual folder names but rejects non-text and oversized metadata',()=>{
  expect(collectionInput({name:'  场景参考  ',description:'  light  '})).toEqual({name:'场景参考',description:'light'})
  for(const name of ['', ' ',null,{},'x'.repeat(51)])expect(()=>collectionInput({name})).toThrow(SocialError)
  expect(()=>collectionInput({name:'Valid',description:'x'.repeat(301)})).toThrow(SocialError)
 })
 it('rejects inherited-looking target types and invalid categories without constructing SQL',()=>{
  for(const targetType of ['constructor','__proto__','work; DELETE',{},null])expect(()=>reportInput({targetType,targetId:'id',reason:'spam'})).toThrow(SocialError)
  expect(()=>reportInput({targetType:'work',targetId:'id',reason:'invalid'})).toThrow(SocialError)
 })
 it('requires useful other-report details while preserving user text without interpreting markup',()=>{
  expect(()=>reportInput({targetType:'work',targetId:'id',reason:'other',details:'short'})).toThrow(SocialError)
  expect(reportInput({targetType:'work',targetId:'id',reason:'other',details:'<script>evidence</script>'}).details).toBe('<script>evidence</script>')
 })
 it('bounds report identifiers and details before storage',()=>{
  expect(()=>reportInput({targetType:'user',targetId:'x'.repeat(161),reason:'spam'})).toThrow(SocialError)
  expect(()=>reportInput({targetType:'work',targetId:'id',reason:'spam',details:'x'.repeat(2001)})).toThrow(SocialError)
 })
})
