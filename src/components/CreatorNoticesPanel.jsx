import { useEffect, useState } from 'react'

import { createCreatorNotice, deleteCreatorNotice, getCreatorNotices } from '../lib/api'
import { getApiErrorMessage } from '../lib/i18n'

// A creator posting to whoever visits their profile.
//
// Not an inbox item and not a community post: it has no recipient and nothing
// to mark read. It is public content that sits on one profile, which is why it
// is its own table rather than a row in `notifications` with a nullable
// everything.
//
// Short by design -- 600 characters. A creator with more to say than that has
// the community, which threads and takes comments; this is for "commissions
// open", "new pack up", "away until the 20th".

const MAX = 600

const CreatorNoticesPanel = ({ authToken, copy, language }) => {
  const [notices, setNotices] = useState(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const dateLocale = language === 'zh' ? 'zh-CN' : language === 'ja' ? 'ja-JP' : 'en-US'

  useEffect(() => {
    let isMounted = true
    getCreatorNotices(authToken)
      .then((payload) => isMounted && setNotices(payload.notices || []))
      .catch(() => isMounted && setNotices([]))
    return () => {
      isMounted = false
    }
  }, [authToken])

  const post = async () => {
    const body = draft.trim()
    if (!body || busy) return

    setBusy(true)
    setMessage('')
    try {
      const payload = await createCreatorNotice(authToken, body)
      setNotices((current) => [payload.notice, ...(current || [])])
      setDraft('')
    } catch (error) {
      setMessage(error.code ? getApiErrorMessage(error, copy) : error.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id) => {
    if (busy) return
    setBusy(true)
    try {
      await deleteCreatorNotice(authToken, id)
      setNotices((current) => (current || []).filter((item) => item.id !== id))
    } catch (error) {
      setMessage(error.code ? getApiErrorMessage(error, copy) : error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <div>
          <h2>{copy.creatorNoticesTitle}</h2>
          <p className="account-section-intro">{copy.creatorNoticesIntro}</p>
        </div>
      </div>

      <label className="field-label">
        {copy.creatorNoticesCompose}
        <textarea
          className="field-input field-input-focus"
          maxLength={MAX}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={copy.creatorNoticesPlaceholder}
          rows={3}
          value={draft}
        />
        <small className={draft.length > MAX * 0.9 ? 'text-coral' : ''}>
          {draft.length} / {MAX}
        </small>
      </label>

      <div className="theme-editor-actions">
        <button
          className="primary-action"
          disabled={busy || !draft.trim()}
          onClick={post}
          type="button"
        >
          {copy.creatorNoticesPost}
        </button>
      </div>

      {message && <p className="text-coral">{message}</p>}

      {notices === null && <p className="text-neutral-400">{copy.loading}</p>}
      {notices?.length === 0 && (
        <div className="asset-empty-state">
          <strong>{copy.creatorNoticesEmptyTitle}</strong>
          <span>{copy.creatorNoticesEmptyBody}</span>
        </div>
      )}

      {notices?.map((notice) => (
        <article className="works-row" key={notice.id}>
          <p>{notice.body}</p>
          <div className="works-row-actions">
            <small>{new Date(notice.createdAt).toLocaleString(dateLocale)}</small>
            <button
              className="secondary-action"
              disabled={busy}
              onClick={() => remove(notice.id)}
              type="button"
            >
              {copy.creatorNoticesRemove}
            </button>
          </div>
        </article>
      ))}
    </section>
  )
}

export default CreatorNoticesPanel
