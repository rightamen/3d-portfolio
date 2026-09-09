import { describe, expect, it } from 'vitest'

import { clamp, coverScale, cropRegion, layoutOf } from '../../src/lib/crop.js'

// The crop dialog's arithmetic. This decides what the uploaded file contains,
// and every way it can be wrong produces a picture rather than an error: a
// silently off-centre avatar, a band of empty frame, a file that does not match
// the preview. None of that throws, so none of it shows up anywhere but here.

const image = (width, height) => ({ height, width })

// 420x420 avatar frame and 420x105 banner frame -- the real shapes.
const AVATAR = { height: 420, width: 420 }
const BANNER = { height: 105, width: 420 }

describe('coverScale', () => {
  it('fills the frame from the shorter side of a landscape picture', () => {
    // 2000x1000 into 420x420: 420/1000 = 0.42 is the one that covers.
    expect(coverScale(image(2000, 1000), AVATAR.width, AVATAR.height)).toBeCloseTo(0.42)
  })

  it('fills the frame from the shorter side of a portrait picture', () => {
    expect(coverScale(image(1000, 2000), AVATAR.width, AVATAR.height)).toBeCloseTo(0.42)
  })

  it('scales UP a picture smaller than the frame, so the frame is never part-empty', () => {
    expect(coverScale(image(210, 210), AVATAR.width, AVATAR.height)).toBeCloseTo(2)
  })
})

describe('layoutOf', () => {
  it('covers the frame at zoom 1 -- no gap on either axis', () => {
    const layout = layoutOf(image(2000, 1000), { x: 0, y: 0 }, 1, AVATAR.width, AVATAR.height)

    expect(layout.width).toBeGreaterThanOrEqual(AVATAR.width)
    expect(layout.height).toBeGreaterThanOrEqual(AVATAR.height)
  })

  it('refuses to let the picture be dragged right, off its left edge', () => {
    const layout = layoutOf(image(2000, 1000), { x: 500, y: 0 }, 1, AVATAR.width, AVATAR.height)
    expect(layout.x).toBe(0)
  })

  it('refuses to let the picture be dragged left past its right edge', () => {
    const layout = layoutOf(image(2000, 1000), { x: -99999, y: 0 }, 1, AVATAR.width, AVATAR.height)
    // 2000 * 0.42 = 840 wide in a 420 frame, so the furthest left is -420.
    expect(layout.x).toBe(AVATAR.width - 840)
  })

  it('pulls a corner-pinned picture back when the zoom comes down', () => {
    // The case a per-event clamp misses: pinned at the right edge zoomed in,
    // then zoomed out. Without re-clamping on zoom this opens a gap that
    // dragging can no longer close, because the drag clamp agrees with it.
    const source = image(2000, 1000)
    const zoomedIn = layoutOf(source, { x: -99999, y: 0 }, 3, AVATAR.width, AVATAR.height)
    const zoomedOut = layoutOf(source, { x: zoomedIn.x, y: zoomedIn.y }, 1, AVATAR.width, AVATAR.height)

    expect(zoomedIn.x).toBeLessThan(zoomedOut.x)
    expect(zoomedOut.x).toBe(AVATAR.width - 840)
    expect(zoomedOut.x + zoomedOut.width).toBeGreaterThanOrEqual(AVATAR.width)
  })

  it('leaves an axis alone when the picture exactly fits it', () => {
    const layout = layoutOf(image(1000, 1000), { x: 0, y: 0 }, 1, AVATAR.width, AVATAR.height)
    expect(layout.x).toBe(0)
    expect(layout.y).toBe(0)
  })
})

describe('cropRegion', () => {
  it('reads back exactly the frame, in the source picture own pixels', () => {
    const source = image(2000, 1000)
    const layout = layoutOf(source, { x: 0, y: 0 }, 1, AVATAR.width, AVATAR.height)
    const region = cropRegion({
      aspect: 1,
      frameHeight: AVATAR.height,
      frameWidth: AVATAR.width,
      layout,
      outputWidth: 512,
    })

    // The frame is 420 CSS px at scale 0.42, which is 1000 source px -- the
    // full height of the picture, which is what "cover" means here.
    expect(region.sourceWidth).toBeCloseTo(1000)
    expect(region.sourceHeight).toBeCloseTo(1000)
  })

  it('never upscales past the source, however big the output is asked to be', () => {
    const source = image(300, 300)
    const layout = layoutOf(source, { x: 0, y: 0 }, 1, AVATAR.width, AVATAR.height)
    const region = cropRegion({
      aspect: 1,
      frameHeight: AVATAR.height,
      frameWidth: AVATAR.width,
      layout,
      outputWidth: 512,
    })

    // 300px of picture asked to become a 512px avatar would be stored blurry
    // and larger than the sharp original.
    expect(region.width).toBe(300)
    expect(region.height).toBe(300)
  })

  it('writes the full output size when the source has the pixels for it', () => {
    const source = image(3000, 3000)
    const layout = layoutOf(source, { x: 0, y: 0 }, 1, AVATAR.width, AVATAR.height)
    const region = cropRegion({
      aspect: 1,
      frameHeight: AVATAR.height,
      frameWidth: AVATAR.width,
      layout,
      outputWidth: 512,
    })

    expect(region.width).toBe(512)
  })

  it('keeps the banner at its aspect, not the source picture aspect', () => {
    const source = image(4000, 4000)
    const layout = layoutOf(source, { x: 0, y: 0 }, 1, BANNER.width, BANNER.height)
    const region = cropRegion({
      aspect: 4,
      frameHeight: BANNER.height,
      frameWidth: BANNER.width,
      layout,
      outputWidth: 1920,
    })

    expect(region.width / region.height).toBeCloseTo(4)
  })

  it('moves the read window when the picture is dragged', () => {
    const source = image(2000, 2000)
    const centred = cropRegion({
      aspect: 1,
      frameHeight: AVATAR.height,
      frameWidth: AVATAR.width,
      layout: layoutOf(source, { x: -100, y: -100 }, 2, AVATAR.width, AVATAR.height),
      outputWidth: 512,
    })
    const dragged = cropRegion({
      aspect: 1,
      frameHeight: AVATAR.height,
      frameWidth: AVATAR.width,
      layout: layoutOf(source, { x: -200, y: -100 }, 2, AVATAR.width, AVATAR.height),
      outputWidth: 512,
    })

    // Dragging the picture left reads further right in the source.
    expect(dragged.sourceX).toBeGreaterThan(centred.sourceX)
    expect(dragged.sourceY).toBeCloseTo(centred.sourceY)
  })

  it('reads a smaller window as the zoom goes up, which is what zoom means', () => {
    const source = image(2000, 2000)
    const at = (zoom) =>
      cropRegion({
        aspect: 1,
        frameHeight: AVATAR.height,
        frameWidth: AVATAR.width,
        layout: layoutOf(source, { x: 0, y: 0 }, zoom, AVATAR.width, AVATAR.height),
        outputWidth: 512,
      }).sourceWidth

    expect(at(3)).toBeLessThan(at(1))
  })

  it('never reads outside the picture', () => {
    const source = image(1200, 900)
    for (const [zoom, x, y] of [
      [1, 0, 0],
      [1, -99999, -99999],
      [1, 99999, 99999],
      [4.5, -99999, 99999],
    ]) {
      const layout = layoutOf(source, { x, y }, zoom, AVATAR.width, AVATAR.height)
      const region = cropRegion({
        aspect: 1,
        frameHeight: AVATAR.height,
        frameWidth: AVATAR.width,
        layout,
        outputWidth: 512,
      })

      // A canvas asked to read past the edge does not throw -- it draws
      // transparent pixels, and the avatar comes out with a clear band down
      // one side that nothing in the flow reports.
      expect(region.sourceX).toBeGreaterThanOrEqual(-0.001)
      expect(region.sourceY).toBeGreaterThanOrEqual(-0.001)
      expect(region.sourceX + region.sourceWidth).toBeLessThanOrEqual(source.width + 0.001)
      expect(region.sourceY + region.sourceHeight).toBeLessThanOrEqual(source.height + 0.001)
    }
  })
})

describe('clamp', () => {
  it('holds a value inside its bounds and leaves one that already is', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-5, 0, 10)).toBe(0)
    expect(clamp(50, 0, 10)).toBe(10)
  })
})
