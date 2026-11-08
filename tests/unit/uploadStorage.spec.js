// @vitest-environment node
import {afterEach,describe,it,expect} from 'vitest'
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {EventEmitter} from 'node:events'
import {PassThrough,Readable} from 'node:stream'
import {createUploadStorage} from '../../server/uploadStorage.js'
const folders=[]
afterEach(async()=>{for(const folder of folders.splice(0))await rm(folder,{recursive:true,force:true})})
const setup=async(filename='asset.bin')=>{
 const folder=await mkdtemp(path.join(tmpdir(),'mrright-upload-test-'));folders.push(folder)
 const request=new EventEmitter();request.complete=false;request.aborted=false
 const storage=createUploadStorage({destination:(_r,_f,cb)=>cb(null,folder),filename:(_r,_f,cb)=>cb(null,filename)})
 return{folder,request,storage}
}
const handle=(s,r,file)=>new Promise(resolve=>s._handleFile(r,file,(error,info)=>resolve({error,info})))
describe('upload storage ownership and disconnect cleanup',()=>{
 it('writes the complete bytes and removes a completed owned file',async()=>{
  const {folder,request,storage}=await setup();const f={stream:Readable.from(['abc','def'])}
  const {error,info}=await handle(storage,request,f);expect(error).toBeFalsy();expect(info.size).toBe(6)
  expect(await readFile(info.path,'utf8')).toBe('abcdef');expect(request.listenerCount('aborted')).toBe(0)
  await new Promise((resolve,reject)=>storage._removeFile(request,{...f,...info},e=>e?reject(e):resolve()))
  expect(await readdir(folder)).toEqual([])
 })
 it('removes a partial file on source failure',async()=>{
  const {folder,request,storage}=await setup();const stream=new PassThrough();const done=handle(storage,request,{stream})
  stream.write('partial');stream.destroy(new Error('source failed'))
  expect((await done).error).toBeTruthy();expect(await readdir(folder)).toEqual([])
 })
 it('cleans up when the client aborts during a write',async()=>{
  const {folder,request,storage}=await setup();const stream=new PassThrough();const done=handle(storage,request,{stream})
  stream.write('partial');request.aborted=true;request.emit('aborted')
  expect((await done).error.code).toBe('UPLOAD_ABORTED');expect(await readdir(folder)).toEqual([])
 })
 it('cleans up an incomplete request close',async()=>{
  const {folder,request,storage}=await setup();const stream=new PassThrough();const done=handle(storage,request,{stream})
  stream.write('partial');request.emit('close')
  expect((await done).error).toBeTruthy();expect(await readdir(folder)).toEqual([])
 })
 it('does not create a file after the request has already aborted',async()=>{
  const {folder,request,storage}=await setup();request.aborted=true
  expect((await handle(storage,request,{stream:Readable.from(['x'])})).error.code).toBe('UPLOAD_ABORTED')
  expect(await readdir(folder)).toEqual([])
 })
 it('does not overwrite or delete an existing path on a filename collision',async()=>{
  const {folder,request,storage}=await setup();await writeFile(path.join(folder,'asset.bin'),'existing')
  expect((await handle(storage,request,{stream:Readable.from(['new'])})).error.code).toBe('EEXIST')
  expect(await readFile(path.join(folder,'asset.bin'),'utf8')).toBe('existing')
 })
 it('rejects a filename outside the destination',async()=>{
  const {folder,request,storage}=await setup('../escape.bin')
  expect((await handle(storage,request,{stream:Readable.from(['x'])})).error).toBeTruthy()
  expect(await readdir(folder)).toEqual([])
 })
 it('does not abort a completed request when its connection closes',async()=>{
  const {folder,request,storage}=await setup();request.complete=true
  const stream=new PassThrough();const done=handle(storage,request,{stream});stream.write('ok');request.emit('close');stream.end()
  expect((await done).error).toBeFalsy();expect(await readFile(path.join(folder,'asset.bin'),'utf8')).toBe('ok')
 })
})
