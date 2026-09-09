import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import {
  IMAGE_PROFILES,
  derivativeFileName,
  readImageMetadata,
  renderDerivative,
} from '../../server/images.js'

// A real encoded image, not a stub: the point of this module is what a decoder
// does with bytes, and a fake would test nothing.
const makeImage = async ({ format = 'png', height, width }) => {
  const image = sharp({
    create: {
      background: { b: 90, g: 60, r: 30 },
      channels: 3,
      height,
      width,
    },
  })

  return (format === 'jpeg' ? image.jpeg() : image.png()).toBuffer()
}

describe('renderDerivative', () => {
  it('shrinks a large cover to fit inside the thumbnail box, keeping its shape', async () => {
    const source = await makeImage({ height: 1500, width: 2000 })
    const meta = await readImageMetadata(await renderDerivative(source, 'workThumb'))

    expect(meta.width).toBe(720)
    // 2000x1500 is 4:3, so fitting 720 wide gives 540 -- `inside`, not `cover`.
    // A catalogue of renders is not all one shape and cropping cuts models in
    // half.
    expect(meta.height).toBe(540)
  })

  it('crops an avatar to a square, because every place it renders is a circle', async () => {
    const meta = await readImageMetadata(
      await renderDerivative(await makeImage({ height: 900, width: 1600 }), 'avatar'),
    )

    expect(meta.width).toBe(512)
    expect(meta.height).toBe(512)
  })

  it('does NOT enlarge a small source', async () => {
    // Without withoutEnlargement a 200px avatar is upscaled to 512 and stored
    // blurry and BIGGER than the sharp original -- the opposite of the point.
    const meta = await readImageMetadata(
      await renderDerivative(await makeImage({ height: 200, width: 200 }), 'avatar'),
    )

    expect(meta.width).toBe(200)
    expect(meta.height).toBe(200)
  })

  it('writes webp whatever it was handed', async () => {
    for (const format of ['png', 'jpeg']) {
      const meta = await readImageMetadata(
        await renderDerivative(await makeImage({ format, height: 800, width: 800 }), 'workThumb'),
      )
      expect(meta.format).toBe('webp')
    }
  })

  it('actually makes the file smaller, which is the only reason any of this exists', async () => {
    const source = await makeImage({ height: 1500, width: 2000 })
    const derivative = await renderDerivative(source, 'workThumb')

    expect(derivative.length).toBeLessThan(source.length)
  })

  it('drops EXIF rather than republishing it -- a phone photo carries GPS', async () => {
    const withExif = await sharp(await makeImage({ height: 600, width: 600 }))
      .withExif({ IFD0: { Copyright: 'somebody', Software: 'probe' } })
      .jpeg()
      .toBuffer()

    // Present in the source, so the assertion below is about the resize and
    // not about sharp having ignored the request.
    expect((await sharp(withExif).metadata()).exif).toBeTruthy()
    expect((await sharp(await renderDerivative(withExif, 'avatar')).metadata()).exif).toBeFalsy()
  })

  it('refuses a format this server does not serve, before the full decode', async () => {
    // sharp links decoders for formats the uploader never offers, and their
    // advisories are where its high-severity CVEs live -- libheif has had two.
    // A HEIC file called photo.png reaches this function regardless of what the
    // upload form checked, so the gate has to be on the bytes.
    const tiff = await sharp({
      create: { background: { b: 1, g: 2, r: 3 }, channels: 3, height: 40, width: 40 },
    })
      .tiff()
      .toBuffer()

    await expect(renderDerivative(tiff, 'avatar')).rejects.toThrow(/Unsupported image format/)
    await expect(readImageMetadata(tiff)).rejects.toThrow(/Unsupported image format/)
  })

  it('refuses an unknown profile instead of silently writing a full-size copy', async () => {
    await expect(renderDerivative(await makeImage({ height: 50, width: 50 }), 'nope')).rejects.toThrow(
      /Unknown image profile/,
    )
  })
})

describe('readImageMetadata', () => {
  it('rejects bytes that are not an image at all', async () => {
    await expect(readImageMetadata(Buffer.from('this is not a picture'))).rejects.toThrow()
  })

  it('rejects an image whose header is intact but whose body is truncated', async () => {
    // The check that an extension test and a magic-number sniff both miss:
    // both describe the first few bytes, this describes whether it opens.
    const source = await makeImage({ height: 400, width: 400 })
    await expect(readImageMetadata(source.subarray(0, 30))).rejects.toThrow()
  })

  it('reads a real image', async () => {
    const meta = await readImageMetadata(await makeImage({ height: 300, width: 400 }))
    expect(meta).toEqual({ format: 'png', height: 300, width: 400 })
  })
})

describe('derivativeFileName', () => {
  it('always ends in .webp, because that is what renderDerivative writes', () => {
    expect(derivativeFileName('Cover Photo.PNG', 'thumb')).toMatch(/\.webp$/)
  })

  it('keeps a readable trace of the original name', () => {
    expect(derivativeFileName('Fire Extinguisher.png', 'thumb')).toContain('fire-extinguisher')
  })

  it('strips everything that has no business in a path', () => {
    const name = derivativeFileName('../../etc/passwd', 'thumb')
    expect(name).not.toContain('/')
    expect(name).not.toContain('..')
  })

  it('does not collide when the same file is uploaded twice in one millisecond', () => {
    const names = new Set(
      Array.from({ length: 200 }, () => derivativeFileName('same.png', 'thumb')),
    )
    expect(names.size).toBe(200)
  })

  it('still produces a name when there is nothing usable to keep', () => {
    expect(derivativeFileName('!!!.png', 'thumb')).toMatch(/-image-thumb\.webp$/)
    expect(derivativeFileName('', 'thumb')).toMatch(/\.webp$/)
  })
})

describe('IMAGE_PROFILES', () => {
  it('gives every profile the four fields renderDerivative reads', () => {
    for (const [name, profile] of Object.entries(IMAGE_PROFILES)) {
      expect(profile, name).toMatchObject({
        fit: expect.any(String),
        height: expect.any(Number),
        quality: expect.any(Number),
        width: expect.any(Number),
      })
    }
  })
})
