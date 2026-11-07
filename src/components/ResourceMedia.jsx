import {useState} from 'react'
const ResourceMedia=({work,copy})=>{
 const [index,setIndex]=useState(0),kind=work.resourceType || 'model'
 const images=[...new Set([work.image,...(work.assets||[]).filter(a=>['image','preview','texture'].includes(a.kind)).map(a=>a.fileUrl)].filter(Boolean))]
 const playable=(work.assets||[]).find(a=>a.kind===kind && a.fileUrl && !a.protected)
 return <div className="resource-media">
 {kind==='video' && playable?<video controls playsInline preload="metadata" poster={work.image || undefined} src={playable.fileUrl} aria-label={work.title}/>:
 kind==='audio' && playable?<div className="resource-audio">{work.image && <img src={work.image} alt=""/>}<audio controls preload="metadata" src={playable.fileUrl} aria-label={work.title}/></div>:
 images.length?<div className="resource-gallery"><img src={images[Math.min(index,images.length-1)]} alt={work.title}/>{images.length>1 && <nav aria-label={copy.resourceGallery}><button type="button" aria-label={copy.resourcePrevious} onClick={()=>setIndex(i=>(i-1+images.length)%images.length)}>←</button><span>{index+1} / {images.length}</span><button type="button" aria-label={copy.resourceNext} onClick={()=>setIndex(i=>(i+1)%images.length)}>→</button></nav>}</div>:<p>{copy.resourceNoPreview}</p>}
 </div>
}
export default ResourceMedia
