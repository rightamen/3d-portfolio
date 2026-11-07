export const RESOURCE_TYPES=['model','image','video','audio','material','document','other']
export const WORK_RESOURCE_KINDS=['preview','model','source','texture','image','video','audio']
export const RESOURCE_EXTENSIONS={
 image:['.jpg','.jpeg','.png','.webp','.gif'],
 model:['.glb','.gltf','.fbx','.obj'],
 video:['.mp4','.webm','.mov'],
 audio:['.mp3','.wav','.ogg','.flac'],
 source:['.jpg','.jpeg','.png','.webp','.gif','.tif','.tiff','.svg','.psd','.glb','.gltf','.fbx','.obj','.blend','.zip','.7z','.rar','.mp4','.webm','.mov','.mp3','.wav','.ogg','.flac','.pdf','.txt','.csv']
}
export const allowedWorkExtension=(kind,extension)=> (kind==='source'?RESOURCE_EXTENSIONS.source:kind==='preview'||kind==='texture'?RESOURCE_EXTENSIONS.image:RESOURCE_EXTENSIONS[kind] || []).includes(extension)
export const workUploadExtensions=new Set(RESOURCE_EXTENSIONS.source)
export const defaultDownloadAsset=work=>work.assets?.find(a=>a.kind==='source') || work.assets?.find(a=>a.kind==='model') || work.assets?.find(a=>['image','texture','video','audio'].includes(a.kind)) || null
