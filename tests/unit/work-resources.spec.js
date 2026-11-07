import {describe,it,expect} from 'vitest'
import {RESOURCE_TYPES,allowedWorkExtension,defaultDownloadAsset} from '../../server/workResources.js'
import {hasValidFileSignature} from '../../server/fileSignatures.js'
describe('work resource formats',()=>{
 it('matches slots to safe resource formats rather than accepting renamed files',()=>{
  expect(RESOURCE_TYPES).toContain('video');expect(allowedWorkExtension('video','.webm')).toBe(true);expect(allowedWorkExtension('audio','.wav')).toBe(true)
  expect(allowedWorkExtension('source','.psd')).toBe(true);expect(allowedWorkExtension('source','.zip')).toBe(true)
  for(const [kind,ext] of [['video','.png'],['image','.svg'],['source','.exe'],['model','.mp4']])expect(allowedWorkExtension(kind,ext)).toBe(false)
 })
 it('recognises actual media fixture headers and refuses mismatched declarations',async()=>{
  expect(await hasValidFileSignature('tests/fixtures/resources/sample.webm','.webm')).toBe(true)
  expect(await hasValidFileSignature('tests/fixtures/resources/sample.wav','.wav')).toBe(true)
  expect(await hasValidFileSignature('tests/fixtures/resources/sample.png','.png')).toBe(true)
  expect(await hasValidFileSignature('tests/fixtures/resources/sample.png','.mp4')).toBe(false)
  expect(await hasValidFileSignature('tests/fixtures/resources/sample.wav','.webm')).toBe(false)
 })
 it('keeps source priority and permits image, audio and video downloads without choosing a cover',()=>{
  const image={kind:'image'},cover={kind:'preview'},source={kind:'source'},video={kind:'video'}
  expect(defaultDownloadAsset({assets:[cover,image,source]})).toBe(source)
  expect(defaultDownloadAsset({assets:[cover,video]})).toBe(video)
  expect(defaultDownloadAsset({assets:[cover]})).toBe(null)
 })
})
