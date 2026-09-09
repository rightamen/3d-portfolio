import { useEffect, useRef, useState } from 'react'

import { clamp, coverScale, cropRegion, layoutOf } from '../lib/crop'

// Choosing what part of a picture becomes the avatar or the banner.
//
// Until this, whatever you picked was uploaded whole and the browser cropped it
// with object-fit at display time -- so the crop was decided by the aspect
// ratio of the file, and a portrait photograph became an avatar of somebody's
// chin. You could not move it, and you could not see what you were going to
// get.
//
// Drag to move, the slider or the wheel to zoom, and the frame is exactly the
// shape the picture will be used in. What is confirmed is a canvas render of
// the visible frame, so what you saw is literally the file that is uploaded.

// The frame is MEASURED, not assumed. It was a fixed 420px, which is wider
// than the dialog gets on a 440px screen -- CSS would have shrunk the element
// to fit while the crop maths went on believing it was 420 wide, and the file
// you got would not have been the picture you framed.
const FRAME_MAX_WIDTH = 420

const ImageCropDialog = ({ aspect, copy, file, onCancel, onConfirm, outputWidth }) => {
  const [image, setImage] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [busy, setBusy] = useState(false)
  const dragRef = useRef(null)
  const wrapRef = useRef(null)
  const [frameWidth, setFrameWidth] = useState(FRAME_MAX_WIDTH)

  const frameHeight = Math.round(frameWidth / aspect)

  useEffect(() => {
    const element = wrapRef.current
    if (!element || typeof ResizeObserver === 'undefined') return undefined

    const observer = new ResizeObserver(([entry]) => {
      const available = Math.floor(entry.contentRect.width)
      if (available > 0) setFrameWidth(Math.min(FRAME_MAX_WIDTH, available))
    })
    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  // An object URL rather than a data URL: a 5MB banner does not need to be
  // base64'd into a string first, and the revoke below is why it is not a leak.
  //
  // The starting position is set here, in the load callback, rather than in an
  // effect that watches `image`: it is the picture arriving that decides where
  // it starts, and centring it from a second effect would be derived state
  // written back into state.
  useEffect(() => {
    if (!file) return undefined

    const url = URL.createObjectURL(file)
    const element = new Image()
    element.onload = () => {
      const base = coverScale(element, frameWidth, frameHeight)
      setImage(element)
      setZoom(1)
      setOffset({
        x: (frameWidth - element.width * base) / 2,
        y: (frameHeight - element.height * base) / 2,
      })
    }
    element.src = url

    return () => URL.revokeObjectURL(url)
    // Re-centres if the frame is remeasured -- a phone rotated mid-crop starts
    // over rather than keeping an adjustment made against the old frame.
  }, [file, frameHeight, frameWidth])

  const layout = image ? layoutOf(image, offset, zoom, frameWidth, frameHeight) : null

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  const startDrag = (event) => {
    if (!layout) return
    event.currentTarget.setPointerCapture(event.pointerId)
    // The CLAMPED position is the origin, not the raw one. Starting from a raw
    // offset that the clamp has already pulled back would make the picture jump
    // by that difference the moment the pointer moves.
    dragRef.current = { originX: layout.x, originY: layout.y, x: event.clientX, y: event.clientY }
  }

  const moveDrag = (event) => {
    if (!dragRef.current) return
    const drag = dragRef.current
    setOffset({
      x: drag.originX + (event.clientX - drag.x),
      y: drag.originY + (event.clientY - drag.y),
    })
  }

  const endDrag = (event) => {
    if (!dragRef.current) return
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    dragRef.current = null
  }

  const confirm = async () => {
    if (!layout || busy) return
    setBusy(true)

    const { height, sourceHeight, sourceWidth, sourceX, sourceY, width } = cropRegion({
      aspect,
      frameHeight,
      frameWidth,
      layout,
      outputWidth,
    })

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height)

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9))
    setBusy(false)
    if (blob) onConfirm(new File([blob], 'crop.webp', { type: 'image/webp' }))
  }

  return (
    <div
      aria-label={copy.cropTitle}
      aria-modal="true"
      className="crop-backdrop"
      onPointerDown={(event) => {
        // Only the backdrop itself, so a drag that ends outside the frame does
        // not close the dialog and throw the crop away.
        if (event.target === event.currentTarget) onCancel()
      }}
      role="dialog"
    >
      <div className="crop-dialog">
        <h2>{copy.cropTitle}</h2>
        <p className="account-section-intro">{copy.cropHint}</p>

        <div className="crop-frame-wrap" ref={wrapRef}>
        <div
          className="crop-frame"
          onPointerCancel={endDrag}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onWheel={(event) => {
            setZoom((current) => clamp(current * (event.deltaY < 0 ? 1.08 : 0.926), 1, 5))
          }}
          style={{ height: `${frameHeight}px`, width: `${frameWidth}px` }}
        >
          {layout && (
            <img
              alt=""
              draggable="false"
              src={image.src}
              style={{
                height: `${layout.height}px`,
                left: `${layout.x}px`,
                top: `${layout.y}px`,
                width: `${layout.width}px`,
              }}
            />
          )}
          {/* A circle for avatars, because that is the shape every place that
              renders one uses. Purely a guide -- the stored file is the square
              the frame describes, so a different rounding somewhere later does
              not cut anything off. */}
          {aspect === 1 && <span className="crop-frame-circle" aria-hidden="true" />}
        </div>
        </div>

        {/* A slider, not only the wheel: a wheel is not a keyboard and not a
            trackpad everybody has. */}
        <label className="crop-zoom">
          <span>{copy.cropZoom}</span>
          <input
            max="5"
            min="1"
            onChange={(event) => setZoom(Number(event.target.value))}
            step="0.01"
            type="range"
            value={zoom}
          />
        </label>

        <div className="crop-actions">
          <button className="secondary-action" onClick={onCancel} type="button">
            {copy.cropCancel}
          </button>
          <button className="primary-action" disabled={!image || busy} onClick={confirm} type="button">
            {copy.cropConfirm}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ImageCropDialog
