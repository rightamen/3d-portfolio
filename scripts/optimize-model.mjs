// Re-encodes a GLB's embedded textures to WebP.
//
// The fire extinguisher preview was 11.14 MB, of which 11.08 MB was three
// 2048x2048 *lossless PNG* texture maps. Geometry was 12,649 triangles -- tens
// of kilobytes. So the model was never slow because of the model: it was slow
// because PBR bakes were shipped in an archival format. Transport compression
// cannot help either, because PNG is already deflate'd (gzip -9 over the whole
// GLB saved 0.04%). The only lever that moves is the pixel encoding itself.
//
// Quality is chosen per slot rather than globally, because the three maps do
// not degrade the same way, and the settings below were picked by measuring the
// error that each map's *use* is sensitive to rather than by trusting PSNR:
//
//   - baseColor is a picture, and PSNR is the right metric for it. q82 lands at
//     36.9 dB, which is where albedo's own high-frequency detail hides the
//     encoder's. Above that, bytes buy nothing an eye can find.
//   - normal maps are a vector field, not a picture, so the check is angular:
//     q92 bends the reconstructed surface normal by 1.0 degrees on average
//     (isolated UV-seam texels aside), which no lighting model will show.
//   - metallicRoughness is the one that refuses to compress honestly. Its blue
//     channel is a near-binary metal mask, and DCT ringing along those hard
//     edges misclassified 0.63% of texels as the wrong material -- a fringe at
//     every material border. That number did *not* improve from q88 to q95
//     (0.635% -> 0.628%): the artifact is edge ringing, not a bit-budget
//     problem, so paying for quality would have bought nothing. Near-lossless
//     is what actually fixes it, at 0.03%, and it is worth its megabyte on the
//     one map where the error is structural instead of perceptual.
//
// The output filename carries an 8-hex content hash so the deployed file can be
// cached immutably for a year (see setStaticCacheHeaders in server/index.js);
// re-running this script after an art change produces a new name and therefore
// a new URL, which is what makes that cache header safe.

import { createHash } from 'node:crypto'
import { basename, dirname, extname, join } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'

import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { listTextureSlots, textureCompress } from '@gltf-transform/functions'
import draco3d from 'draco3d'
import sharp from 'sharp'

// MAX_DATA_MAP_SIZE caps only the metallicRoughness/occlusion maps. Near-lossless
// is expensive per pixel, so at 4K that one map alone came to 5.15 MB -- 71% of
// the whole file -- while carrying the least resolution-dependent information in
// it: roughness is a smooth field and metalness is a mask of large regions.
// Halving it costs nothing visible and pays for the honesty elsewhere. Set to
// null to keep every map at its authored size.
const MAX_DATA_MAP_SIZE = [2048, 2048]

const ENCODING_BY_SLOT = [
  { slots: /^normalTexture$/, options: { quality: 92 } },
  {
    slots: /^(metallicRoughness|occlusion)Texture$/,
    options: { nearLossless: true, quality: 80, resize: MAX_DATA_MAP_SIZE },
  },
  { slots: /^(baseColor|emissive)Texture$/, options: { quality: 82 } },
]

const megabytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`

// Peak signal-to-noise ratio against the original pixels. Above ~40 dB the
// difference is not visible in a lit 3D view; below ~35 dB it is worth looking
// at the model before shipping. Computed on raw RGB so alpha does not skew it.
const psnr = async (before, after) => {
  const decode = (buffer) =>
    sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true })

  const [a, b] = await Promise.all([decode(before), decode(after)])
  if (a.data.length !== b.data.length) return null

  let squaredError = 0
  for (let i = 0; i < a.data.length; i += 1) {
    const delta = a.data[i] - b.data[i]
    squaredError += delta * delta
  }

  const meanSquaredError = squaredError / a.data.length
  if (meanSquaredError === 0) return Infinity
  return 10 * Math.log10((255 * 255) / meanSquaredError)
}

const inputPath = process.argv[2]
if (!inputPath) {
  console.error('Usage: node scripts/optimize-model.mjs <input.glb> [outputDir]')
  process.exit(1)
}
const outputDir = process.argv[3] || 'public/models'

// The source GLB already declares KHR_draco_mesh_compression as *required*, so
// the codec has to be present just to open the file -- and has to stay present
// on write, or the geometry would be silently re-expanded to raw floats and the
// texture win would be partly spent undoing a compression that was already
// there.
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
})
const document = await io.read(inputPath)

const originalBytes = (await readFile(inputPath)).length
const originalTextures = document
  .getRoot()
  .listTextures()
  .map((texture) => ({
    name: texture.getName(),
    mimeType: texture.getMimeType(),
    image: texture.getImage(),
  }))

// A resize in gltf-transform is exact, not a ceiling, so handing it a cap would
// *upscale* any map already below that cap -- turning a size limit into a size
// mandate. Applied only to the maps that are actually over it.
const oversizedFor = (slots, [maxWidth, maxHeight]) =>
  document
    .getRoot()
    .listTextures()
    .some((texture) => {
      if (!listTextureSlots(texture).some((slot) => slots.test(slot))) return false
      const [width, height] = texture.getSize() || [0, 0]
      return width > maxWidth || height > maxHeight
    })

for (const { slots, options } of ENCODING_BY_SLOT) {
  const { resize, ...rest } = options
  const resizeIfNeeded = resize && oversizedFor(slots, resize) ? { resize } : {}

  await document.transform(
    // effort is gltf-transform's own 0-100 scale, not sharp's 0-6 -- passing
    // sharp's number here reads as "6% effort" and silently inflates every map.
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      effort: 100,
      slots,
      ...rest,
      ...resizeIfNeeded,
    }),
  )
}

const glb = await io.writeBinary(document)
const hash = createHash('sha256').update(glb).digest('hex').slice(0, 8)
const stem = basename(inputPath, extname(inputPath)).replace(/\.[0-9a-f]{8}$/, '')
const outputPath = join(outputDir || dirname(inputPath), `${stem}.${hash}.glb`)
await writeFile(outputPath, glb)

console.log(`${inputPath}  ->  ${outputPath}`)
console.log(`${megabytes(originalBytes)}  ->  ${megabytes(glb.length)}  (${(
  (1 - glb.length / originalBytes) * 100
).toFixed(1)}% smaller)\n`)

const compressedTextures = document.getRoot().listTextures()
for (const [index, texture] of compressedTextures.entries()) {
  const before = originalTextures[index]
  const after = texture.getImage()
  const ratio = before.image.length / after.length
  const quality = await psnr(before.image, after)
  console.log(
    `  ${before.name || `texture ${index}`}\n` +
      `    ${before.mimeType} ${megabytes(before.image.length)}` +
      ` -> ${texture.getMimeType()} ${megabytes(after.length)}` +
      ` (${ratio.toFixed(1)}x)   PSNR ${quality === null ? 'n/a' : `${quality.toFixed(1)} dB`}`,
  )
}
