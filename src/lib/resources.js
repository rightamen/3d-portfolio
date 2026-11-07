export const resourceTypes=['model','image','video','audio','material','document','other']
export const resourceLabels=copy=>({model:copy.resourceModel,image:copy.resourceImage,video:copy.resourceVideo,audio:copy.resourceAudio,material:copy.resourceMaterial,document:copy.resourceDocument,other:copy.resourceOther})
export const resourceAccept={
 preview:'.jpg,.jpeg,.png,.webp,.gif',image:'.jpg,.jpeg,.png,.webp,.gif',texture:'.jpg,.jpeg,.png,.webp,.gif',
 model:'.glb,.gltf,.fbx,.obj',video:'.mp4,.webm,.mov',audio:'.mp3,.wav,.ogg,.flac',
 source:'.jpg,.jpeg,.png,.webp,.gif,.tif,.tiff,.svg,.psd,.glb,.gltf,.fbx,.obj,.blend,.zip,.7z,.rar,.mp4,.webm,.mov,.mp3,.wav,.ogg,.flac,.pdf,.txt,.csv'
}
export const resourceSlots=(type,copy)=>[
 {key:'preview',label:copy.worksAssetPreview},
 ...(type==='model' || !type?[{key:'model',label:copy.worksAssetModel}]:[]),
 ...(type==='image'||type==='material'?[{key:'image',label:copy.resourceGallery}]:[]),
 ...(type==='video'?[{key:'video',label:copy.resourceVideoPreview}]:[]),
 ...(type==='audio'?[{key:'audio',label:copy.resourceAudioPreview}]:[]),
 {key:'source',label:type==='model'||!type?copy.worksAssetSource:copy.resourceOriginal}
]
