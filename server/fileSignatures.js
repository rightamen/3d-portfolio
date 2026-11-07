// Content-based validation. multer's fileFilter only ever saw the file name, so
// any payload at all could be stored as "portrait.png" — the extension was a
// claim by the uploader, never a fact about the bytes. Formats whose container
// has no reliable magic number (.obj, ASCII .fbx, .gltf) are text and are
// checked for a plausible opening token instead.
//
// This lives in its own module because two callers need the same answer and
// they must not drift apart: the upload route rejects a mismatch at the door,
// and the content health checker re-asks the question about rows that were
// stored before the door existed. A second, "equivalent" implementation is how
// a checker ends up blessing files the uploader would have rejected.

import { open } from 'node:fs/promises'

const fileSignatures = new Map([
  ['.jpg', [[0xff, 0xd8, 0xff]]],
  ['.jpeg', [[0xff, 0xd8, 0xff]]],
  ['.png', [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]]],
  ['.gif', [[0x47, 0x49, 0x46, 0x38]]],
  ['.glb', [[0x67, 0x6c, 0x54, 0x46]]],
  ['.zip', [[0x50, 0x4b, 0x03, 0x04], [0x50, 0x4b, 0x05, 0x06], [0x50, 0x4b, 0x07, 0x08]]],
])

const startsWithSignature = (buffer, signature) =>
  signature.every((byte, index) => buffer[index] === byte)

// True when the first bytes are consistent with the extension. Unknown
// extensions return false: the caller has already restricted which extensions
// may be stored, so anything reaching here without a rule is not a file this
// site accepts.
export const hasValidFileSignature = async (filePath, extension) => {
  let handle
  try {
    handle = await open(filePath, 'r')
    const buffer = Buffer.alloc(64)
    const { bytesRead } = await handle.read(buffer, 0, 64, 0)
    const head = buffer.subarray(0, bytesRead)

    if(['.mp4','.mov'].includes(extension))return head.length>=12 && (head.subarray(4,8).toString()==='ftyp' || extension==='.mov' && ['moov','mdat','wide'].includes(head.subarray(4,8).toString()))
    if(extension==='.webm')return startsWithSignature(head,[0x1a,0x45,0xdf,0xa3])
    if(extension==='.wav')return head.subarray(0,4).toString()==='RIFF' && head.subarray(8,12).toString()==='WAVE'
    if(extension==='.mp3')return head.subarray(0,3).toString()==='ID3' || head.length>=2 && head[0]===255 && (head[1]&0xe0)===0xe0
    if(extension==='.ogg')return head.subarray(0,4).toString()==='OggS'
    if(extension==='.flac')return head.subarray(0,4).toString()==='fLaC'
    if(extension==='.7z')return startsWithSignature(head,[0x37,0x7a,0xbc,0xaf,0x27,0x1c])
    if(extension==='.rar')return startsWithSignature(head,[0x52,0x61,0x72,0x21,0x1a,0x07])
    if(extension==='.psd')return head.subarray(0,4).toString()==='8BPS'
    if(extension==='.blend')return head.subarray(0,7).toString()==='BLENDER'
    if(extension==='.pdf')return head.subarray(0,5).toString()==='%PDF-'
    if(extension==='.tif'||extension==='.tiff')return startsWithSignature(head,[0x49,0x49,0x2a,0]) || startsWithSignature(head,[0x4d,0x4d,0,0x2a])
    if(['.txt','.csv','.svg'].includes(extension)){
      if(!head.length || head.includes(0))return false
      const text=head.toString('utf8').trimStart()
      return extension!=='.svg' || /^<svg[\s>]|^<\?xml/.test(text)
    }

    const signatures = fileSignatures.get(extension)
    if (signatures) return signatures.some((signature) => startsWithSignature(head, signature))

    // RIFF....WEBP — the format tag sits at offset 8, after the chunk size.
    if (extension === '.webp') {
      return head.subarray(0, 4).toString('latin1') === 'RIFF' &&
        head.subarray(8, 12).toString('latin1') === 'WEBP'
    }

    // Binary FBX carries a fixed preamble; ASCII FBX is a text file that
    // conventionally opens with a comment or a node declaration.
    if (extension === '.fbx') {
      const text = head.toString('latin1')
      return text.startsWith('Kaydara FBX Binary') || /^[;\s]|^FBXHeaderExtension/.test(text)
    }

    // Text formats: reject anything with NUL bytes in the head, which is the
    // cheap way to tell "this is not the text file you said it was".
    if (extension === '.gltf' || extension === '.obj') {
      if (head.includes(0x00)) return false
      const text = head.toString('utf8').trimStart()
      return extension === '.gltf' ? text.startsWith('{') : /^[#a-zA-Z]/.test(text)
    }

    return false
  } catch {
    return false
  } finally {
    await handle?.close()
  }
}
