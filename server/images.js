import { randomBytes } from 'node:crypto'
import path from 'node:path'

import sharp from 'sharp'

// Derivative images.
//
// Until this, an upload was stored at whatever size it arrived and served at
// that size everywhere. Measured on 2026-09-10: the catalogue's four tiles
// pulled 15.31 MB of full-size PNGs -- one of them 8.47 MB -- and the creator
// avatar rendered into a 17px circle was 1.75 MB. That is why the grid looked
// empty for the first few seconds: the tiles were not broken, the pictures had
// not arrived yet.
//
// Two rules shape what follows:
//
// 1. A file a creator uploaded and a buyer can download is NEVER rewritten. A
//    `preview` asset is listed under "Files included" and belongs to them. The
//    thumbnail is a SEPARATE file; the original stays byte-for-byte.
// 2. A profile image is not a file anyone downloads -- it exists to be shown at
//    one size -- so it is processed in memory and only the derivative is ever
//    written. Nothing to delete afterwards, and therefore no orphans.

// WebP everywhere: it is the smallest of the three formats the uploader
// accepts, and every browser this site supports has read it for years.
const OUTPUT_EXTENSION = '.webp'

export const IMAGE_PROFILES = {
  // Square, because every place that renders it is a circle.
  avatar: { fit: 'cover', height: 512, quality: 82, width: 512 },
  // 4:1. A profile banner is a band, and the crop is the creator's choice, so
  // the server's job here is only to bound the result.
  banner: { fit: 'cover', height: 480, quality: 80, width: 1920 },
  // `inside` -- not `cover` -- so a work keeps its own aspect ratio. A
  // catalogue of 3D renders is not all one shape, and cropping every cover to
  // a fixed box cuts models in half.
  workThumb: { fit: 'inside', height: 720, quality: 74, width: 720 },
}

// A file name in the same shape the uploader already produces, so nothing has
// to special-case where a derivative came from.
export const derivativeFileName = (sourceName, suffix) => {
  const base = path
    .basename(String(sourceName || 'image'), path.extname(String(sourceName || '')))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48)

  return `${Date.now()}-${randomBytes(4).toString('hex')}-${base || 'image'}-${suffix}${OUTPUT_EXTENSION}`
}

// The formats the full decoder is allowed to run on.
//
// ⚠️ Not the same list as the uploader's `accept` attribute, and not redundant
// with it. The uploader checks the file NAME and the browser-declared type;
// sharp reads the actual bytes, so a HEIC image called photo.png is decoded as
// HEIC regardless of what the form said. sharp's advisories are overwhelmingly
// in the exotic decoders it links -- libheif has had two high-severity ones --
// and this server has no reason to run any of them: the three formats below are
// the three the uploader offers.
const DECODABLE_FORMATS = new Set(['jpeg', 'jpg', 'png', 'webp'])

// Reading the metadata is the format check. An extension and a magic-number
// sniff both describe the first few bytes; this describes whether the decoder
// can actually read the image, which is the question that matters and the one
// a truncated or malformed file fails.
//
// metadata() parses the header only. Doing this BEFORE renderDerivative is what
// makes the allowlist worth having: the full decode never starts on a format
// this server does not serve.
export const readImageMetadata = async (input) => {
  const { format, height, width } = await sharp(input).metadata()
  if (!format || !width || !height) throw new Error('Unreadable image.')
  if (!DECODABLE_FORMATS.has(format)) throw new Error(`Unsupported image format: ${format}`)
  return { format, height, width }
}

// `withoutEnlargement` matters more than it looks: without it a 200px avatar
// is upscaled to 512 and stored as a blurry file BIGGER than the sharp
// original. Shrinking is the point; growing never is.
export const renderDerivative = async (input, profileName) => {
  const profile = IMAGE_PROFILES[profileName]
  if (!profile) throw new Error(`Unknown image profile: ${profileName}`)

  // Here, not only at the call sites: this is the function that starts a full
  // decode, so this is where the format allowlist has to hold. A caller that
  // forgets to check first must not be able to reach the decoder.
  await readImageMetadata(input)

  return sharp(input, { failOn: 'error' })
    .rotate() // Honours EXIF orientation, then drops it -- see below.
    .resize(profile.width, profile.height, {
      fit: profile.fit,
      withoutEnlargement: true,
    })
    // No metadata is carried over on purpose. EXIF on a phone photo can hold
    // GPS coordinates, and an avatar is a public file: copying that through
    // would publish where the picture was taken to anyone who downloads it.
    .webp({ quality: profile.quality })
    .toBuffer()
}

export default { IMAGE_PROFILES, derivativeFileName, readImageMetadata, renderDerivative }
