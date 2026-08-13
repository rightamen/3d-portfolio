// Where the Draco decoder is loaded from.
//
// drei's useGLTF defaults this to https://www.gstatic.com/draco/versioned/...,
// which this site's own Content-Security-Policy forbids: connect-src is 'self'
// (see the helmet config in server/index.js). The result was not a warning but
// a silently unloadable model -- the fire extinguisher preview downloaded its
// full 11 MB, then failed at parse time with "Failed to fetch" and sat at 86%
// forever, because the progress bar tracks bytes and no one was watching the
// console. Any Draco-compressed model, including anything the community
// uploads, would have failed the same way.
//
// So the decoder is vendored into public/draco/ (copied from
// three/examples/jsm/libs/draco/gltf/) and served same-origin. This is the
// second argument to every useGLTF/useGLTF.preload call rather than a global
// useGLTF.setDecoderPath, because the global depends on being executed before
// the first load starts and nothing enforces that ordering.
export const DRACO_DECODER_PATH = '/draco/'
