import { useEffect, useRef, useState } from 'react'
import { getChatMedia } from '../lib/api'

const ChatAttachment = ({ attachment, copy, messageId, path, token }) => {
  const isVideo = attachment.kind === 'video'
  const panel = useRef(null)
  const [requested, setRequested] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState(null)
  const [previewError, setPreviewError] = useState(null)

  useEffect(() => {
    if (requested || isVideo || !panel.current) return undefined
    if (!('IntersectionObserver' in window)) {
      const timer = setTimeout(() => setRequested(true), 0)
      return () => clearTimeout(timer)
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setRequested(true)
        observer.disconnect()
      }
    })
    observer.observe(panel.current)
    return () => observer.disconnect()
  }, [isVideo, requested])

  useEffect(() => {
    if (!requested) return undefined
    const controller = new AbortController()
    let url
    getChatMedia(token, path, messageId, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return
        url = URL.createObjectURL(blob)
        setResult({ attempt, url })
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ attempt, error: true })
      })
    return () => {
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [attempt, messageId, path, requested, token])

  const current = result?.attempt === attempt ? result : null
  const retry = () => {
    setRequested(true)
    setAttempt((value) => value + 1)
  }

  return (
    <div className="dm-attachment" ref={panel}>
      {current?.url ? (
        <>
          {previewError === current.url ? <p role="alert">{copy.dmMediaUnavailable}</p> : isVideo ? (
            <video controls playsInline aria-label={attachment.name} src={current.url}
              onError={() => setPreviewError(current.url)} />
          ) : (
            <a href={current.url} target="_blank" rel="noreferrer">
              <img src={current.url} alt={attachment.name} onError={() => setPreviewError(current.url)} />
            </a>
          )}
          <a className="dm-attachment-download" href={current.url} download={attachment.name}>
            {copy.dmDownloadMedia}
          </a>
        </>
      ) : (
        <div className={'dm-attachment-placeholder' + (isVideo ? ' is-video' : '')}>
          <strong>{attachment.name}</strong>
          {current?.error ? (
            <>
              <p role="alert">{copy.dmMediaUnavailable}</p>
              <button type="button" className="secondary-action" onClick={retry}>{copy.socialRetry}</button>
            </>
          ) : !requested ? (
            <button type="button" className="secondary-action" onClick={() => setRequested(true)}>
              {isVideo ? copy.dmLoadVideo : copy.dmLoadImage}
            </button>
          ) : <p role="status">{copy.loading}</p>}
        </div>
      )}
    </div>
  )
}

export default ChatAttachment
