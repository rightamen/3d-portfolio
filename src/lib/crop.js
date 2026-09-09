// The arithmetic behind the crop dialog.
//
// In its own module because this is what decides what the uploaded file
// actually contains -- and because a function that can be called without
// mounting a component, loading an image and driving a pointer is a function
// that can be tested. The dialog is the surface; this is the part that can be
// silently wrong.

// Cover, never contain: the frame is always full. Letting the image sit inside
// the frame would mean shipping an avatar with empty corners, and no part of
// the site has a background to fill them with.
export const coverScale = (image, frameWidth, frameHeight) =>
  Math.max(frameWidth / image.width, frameHeight / image.height)

export const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

// Where the picture actually sits, worked out during render rather than stored.
//
// The image may never be dragged off the frame, and the clamp has to survive a
// zoom change as well as a drag -- zooming out around a corner-pinned image
// would otherwise open a gap that dragging can no longer close. Deriving it
// here means there is one clamp instead of one per event, and no state that can
// disagree with the picture on screen.
export const layoutOf = (image, offset, zoom, frameWidth, frameHeight) => {
  const scale = coverScale(image, frameWidth, frameHeight) * zoom
  const width = image.width * scale
  const height = image.height * scale

  return {
    height,
    scale,
    width,
    x: clamp(offset.x, frameWidth - width, 0),
    y: clamp(offset.y, frameHeight - height, 0),
  }
}

// The frame, expressed in the source image's own pixels, plus the size to write
// it at. Split out from the dialog because this is the arithmetic that decides
// what the file actually contains: it is the same clamped layout the <img> is
// positioned with, which is what makes the result the picture you were looking
// at, and it is worth being able to test rather than eyeball.
export const cropRegion = ({ aspect, frameHeight, frameWidth, layout, outputWidth }) => {
  const sourceWidth = frameWidth / layout.scale

  // Never upscale. A 200px picture cropped to a 512px avatar would be stored
  // blurry and LARGER than the sharp original -- the server refuses to enlarge
  // for the same reason, and agreeing with it here means the preview and the
  // stored file are the same picture.
  const width = Math.round(Math.min(outputWidth, sourceWidth))

  return {
    height: Math.round(width / aspect),
    sourceHeight: frameHeight / layout.scale,
    sourceWidth,
    sourceX: -layout.x / layout.scale,
    sourceY: -layout.y / layout.scale,
    width,
  }
}
