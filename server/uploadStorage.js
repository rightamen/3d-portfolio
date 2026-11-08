import {createWriteStream} from 'node:fs'
import {unlink} from 'node:fs/promises'
import path from 'node:path'
import {pipeline} from 'node:stream'

const aborted = () => Object.assign(new Error('Upload interrupted.'), {code:'UPLOAD_ABORTED'})
const remove = async file => { if (!file) return; try { await unlink(file) } catch(e) { if(e.code!=='ENOENT') throw e } }

// Each stream owns only the path it opened exclusively. Pipeline errors must
// clean up here: Multer may already have removed that file from pendingFiles.
export const createUploadStorage = ({destination,filename}) => {
 const active=new WeakMap()
 return {
  _handleFile(req,file,done){
   destination(req,file,(error,folder)=>{
    if(error)return done(error)
    filename(req,file,(error,name)=>{
     if(error)return done(error)
     if(req.aborted||file.stream.destroyed)return done(aborted())
     if(!name||path.basename(name)!==name||name==='.'||name==='..')return done(new Error('Invalid upload filename.'))
     const target=path.join(folder,name),out=createWriteStream(target,{flags:'wx'})
     const state={out,target,owned:false,closed:new Promise(resolve=>out.once('close',resolve))}
     active.set(file,state)
     out.once('open',()=>{state.owned=true;file.path=target})
     const abort=()=>file.stream.destroy(aborted())
     const close=()=>{if(!req.complete)abort()}
     req.once('aborted',abort);req.once('close',close)
     pipeline(file.stream,out,async error=>{
      req.removeListener('aborted',abort);req.removeListener('close',close)
      try{if(error&&state.owned)await remove(target)}catch(cleanupError){error=error||cleanupError}
      active.delete(file)
      if(error)return done(error)
      done(null,{destination:folder,filename:name,path:target,size:out.bytesWritten})
     })
    })
   })
  },
  _removeFile(req,file,done){
   const state=active.get(file)
   const cleanup=async()=>{
    if(state){state.out.destroy();await state.closed;if(state.owned)await remove(state.target)}
    else await remove(file.path)
    delete file.destination;delete file.filename;delete file.path
   }
   cleanup().then(()=>done(null),done)
  }
 }
}
