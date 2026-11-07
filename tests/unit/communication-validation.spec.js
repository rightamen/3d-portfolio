import {describe,it,expect} from 'vitest'
import {messageInput,messageSequence,feedReadInput} from '../../server/communicationValidation.js'
describe('private communication validation',()=>{
 it('requires real content and a stable retry key without accepting oversized text',()=>{
  expect(messageInput({body:' Hello\nWorld ',clientId:'stable-client-key-123'})).toEqual({body:'Hello\nWorld',clientId:'stable-client-key-123'})
  for(const value of [{body:' ',clientId:'stable-client-key-123'},{body:'x'.repeat(4001),clientId:'stable-client-key-123'},{body:'Hello',clientId:'short'},{body:String.fromCharCode(0),clientId:'stable-client-key-123'}])expect(()=>messageInput(value)).toThrow()
 })
 it('rejects unsafe read positions while allowing zero and exclusive history cursors',()=>{
  expect(messageSequence(undefined,{optional:true})).toBe(null);expect(messageSequence('12')).toBe(12);expect(messageSequence(0)).toBe(0)
  for(const value of [undefined,null,true,{},'',-1,1.5,2147483648])expect(()=>messageSequence(value)).toThrow()
 })
 it('bounds read batches and allows only the public feed source kinds',()=>{
  expect(feedReadInput({items:[{kind:'work',id:'one'}]})).toEqual([{kind:'work',id:'one'}])
  for(const value of [{items:[]},{items:Array.from({length:51},()=>({kind:'work',id:'one'}))},{items:[{kind:'message',id:'one'}]},{items:[{kind:'notice',id:''}]}])expect(()=>feedReadInput(value)).toThrow()
 })
})
