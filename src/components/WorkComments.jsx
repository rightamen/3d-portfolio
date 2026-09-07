import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  createWorkComment,
  deleteWorkComment,
  getWorkComments,
  setWorkCommentPinned,
  setWorkCommentStatus,
  toggleWorkCommentLike,
} from '../lib/api'
import { getApiErrorMessage } from '../lib/i18n'

// The discussion on a work. Threaded one level, sortable, likeable, and
// pinnable by the work's owner -- the shape people expect, which is the shape
// the server already enforces. This renders it and nothing more: every rule
// about who may do what lives in the API, so a hidden button is a convenience,
// never the protection.

// A stable identity for "nothing loaded yet".
const EMPTY_COMMENTS = []

const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : '')

const initials = (name) => {
  const source = String(name || '?').trim()
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

const WorkComments = ({ authToken, copy, handle, isOwner, slug, visitorUser }) => {
  const [sort, setSort] = useState('top')
  // Comments are stored with the request that produced them, like the pages
  // above: "loading" is derived, so the effect never assigns state
  // synchronously and a stale list cannot appear under a new sort.
  const requestKey = `${handle}/${slug}/${sort}/${authToken ? 'auth' : 'anon'}`
  const [loaded, setLoaded] = useState({ comments: [], error: '', key: '' })
  const [reloadNonce, setReloadNonce] = useState(0)
  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true

    getWorkComments(handle, slug, { sort, token: authToken })
      .then((payload) => {
        if (isMounted) setLoaded({ comments: payload.comments || [], error: '', key: requestKey })
      })
      .catch((apiError) => {
        if (!isMounted) return
        setLoaded({
          comments: [],
          error: apiError.code ? getApiErrorMessage(apiError, copy) : copy.workCommentsLoadError,
          key: requestKey,
        })
      })

    return () => {
      isMounted = false
    }
    // reloadNonce is a deliberate dependency: it is how a write asks for a
    // fresh read without the write having to rebuild the tree itself.
  }, [authToken, copy, handle, reloadNonce, requestKey, slug, sort])

  const status = loaded.key === requestKey ? 'ready' : 'loading'
  // Memoised so the thread grouping below does not see a new array identity on
  // every render; EMPTY_COMMENTS is module-level for the same reason.
  const comments = useMemo(
    () => (loaded.key === requestKey ? loaded.comments : EMPTY_COMMENTS),
    [loaded.comments, loaded.key, requestKey],
  )
  const reload = useCallback(() => setReloadNonce((value) => value + 1), [])

  // One level: everything with a parent hangs under it, everything else is a
  // thread. The server guarantees a reply's parent is itself top-level, so no
  // recursion is needed here.
  const threads = useMemo(() => {
    const replies = new Map()
    for (const comment of comments) {
      if (!comment.parentId) continue
      if (!replies.has(comment.parentId)) replies.set(comment.parentId, [])
      replies.get(comment.parentId).push(comment)
    }
    // Replies read oldest-first regardless of the top-level sort: a
    // conversation is chronological even when the list around it is not.
    for (const list of replies.values()) {
      list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    }

    return comments
      .filter((comment) => !comment.parentId)
      .map((comment) => ({ ...comment, replies: replies.get(comment.id) || [] }))
  }, [comments])

  const act = useCallback(
    async (run) => {
      if (busy) return
      setBusy(true)
      setError('')
      try {
        await run()
        reload()
      } catch (apiError) {
        setError(apiError.code ? getApiErrorMessage(apiError, copy) : apiError.message)
      } finally {
        setBusy(false)
      }
    },
    [busy, copy, reload],
  )

  const submit = (event, parentId, message, clear) => {
    event.preventDefault()
    const body = message.trim()
    if (!body) return

    act(async () => {
      await createWorkComment(handle, slug, { message: body, parentId }, authToken)
      clear()
    })
  }

  const renderComment = (comment, { isReply = false } = {}) => {
    const mine = Boolean(visitorUser?.id) && comment.user?.id === visitorUser.id

    return (
      <article
        className={`work-comment${isReply ? ' work-comment-reply' : ''}`}
        key={comment.id}
      >
        <span className="work-comment-avatar" aria-hidden="true">
          {initials(comment.user?.displayName || comment.author)}
        </span>
        <div className="work-comment-body">
          <div className="work-comment-head">
            <strong>{comment.user?.displayName || comment.author}</strong>
            <small>{formatDate(comment.createdAt)}</small>
            {comment.pinned && <span className="work-comment-badge">{copy.workCommentPinned}</span>}
            {comment.status === 'hidden' && (
              <span className="work-comment-badge">{copy.workCommentHidden}</span>
            )}
          </div>
          <p>{comment.message}</p>
          <div className="work-comment-actions">
            <button
              className={comment.liked ? 'work-comment-liked' : undefined}
              disabled={!authToken || busy}
              onClick={() => act(() => toggleWorkCommentLike(comment.id, authToken))}
              type="button"
            >
              ♥ {comment.likeCount}
            </button>
            {authToken && !isReply && (
              <button
                onClick={() => {
                  setReplyTo(replyTo === comment.id ? null : comment.id)
                  setReplyDraft('')
                }}
                type="button"
              >
                {copy.workCommentReply}
              </button>
            )}
            {/* The owner's controls. Hidden for everyone else as a courtesy;
                the API refuses them regardless of what is on screen. */}
            {isOwner && !isReply && (
              <button
                disabled={busy}
                onClick={() =>
                  act(() => setWorkCommentPinned(comment.id, !comment.pinned, authToken))
                }
                type="button"
              >
                {comment.pinned ? copy.workCommentUnpin : copy.workCommentPin}
              </button>
            )}
            {isOwner && !mine && (
              <button
                disabled={busy}
                onClick={() =>
                  act(() =>
                    comment.status === 'hidden'
                      ? setWorkCommentStatus(comment.id, 'published', authToken)
                      : deleteWorkComment(comment.id, authToken),
                  )
                }
                type="button"
              >
                {comment.status === 'hidden' ? copy.workCommentUnhide : copy.workCommentHide}
              </button>
            )}
            {mine && (
              <button
                disabled={busy}
                onClick={() => act(() => deleteWorkComment(comment.id, authToken))}
                type="button"
              >
                {copy.workCommentDelete}
              </button>
            )}
          </div>

          {replyTo === comment.id && (
            <form
              className="work-comment-form"
              onSubmit={(event) =>
                submit(event, comment.id, replyDraft, () => {
                  setReplyDraft('')
                  setReplyTo(null)
                })
              }
            >
              <label className="explore-search-label" htmlFor={`reply-${comment.id}`}>
                {copy.workCommentReplyTo} {comment.user?.displayName || comment.author}
              </label>
              <textarea
                id={`reply-${comment.id}`}
                onChange={(event) => setReplyDraft(event.target.value)}
                placeholder={copy.workCommentPlaceholder}
                rows={2}
                value={replyDraft}
              />
              <div className="work-comment-form-actions">
                <button className="secondary-action" onClick={() => setReplyTo(null)} type="button">
                  {copy.workCommentCancel}
                </button>
                <button className="primary-action" disabled={busy} type="submit">
                  {copy.workCommentSubmit}
                </button>
              </div>
            </form>
          )}

          {comment.replies?.map((reply) => renderComment(reply, { isReply: true }))}
        </div>
      </article>
    )
  }

  return (
    <section className="work-comments">
      <div className="work-comments-head">
        <h2>
          {copy.workComments}
          <span className="work-comments-count">
            {comments.length} {copy.workCommentsCount}
          </span>
        </h2>
        <div className="work-comments-sort">
          {['top', 'newest'].map((option) => (
            <button
              className={sort === option ? 'work-comments-sort-active' : undefined}
              key={option}
              onClick={() => setSort(option)}
              type="button"
            >
              {option === 'top' ? copy.workCommentsSortTop : copy.workCommentsSortNewest}
            </button>
          ))}
        </div>
      </div>

      {authToken ? (
        <form
          className="work-comment-form"
          onSubmit={(event) => submit(event, null, draft, () => setDraft(''))}
        >
          <label className="explore-search-label" htmlFor="work-comment-new">
            {copy.workCommentPlaceholder}
          </label>
          <textarea
            id="work-comment-new"
            onChange={(event) => setDraft(event.target.value)}
            placeholder={copy.workCommentPlaceholder}
            rows={3}
            value={draft}
          />
          <div className="work-comment-form-actions">
            <button className="primary-action" disabled={busy || !draft.trim()} type="submit">
              {copy.workCommentSubmit}
            </button>
          </div>
        </form>
      ) : (
        <Link className="secondary-action w-fit" to="/login?mode=login">
          {copy.workCommentsSignIn}
        </Link>
      )}

      {error && <p className="text-coral">{error}</p>}
      {loaded.error && <p className="text-coral">{loaded.error}</p>}

      {status === 'loading' && <p className="text-neutral-400">{copy.workLoading}</p>}
      {status === 'ready' && threads.length === 0 && !loaded.error && (
        <p className="text-neutral-400">{copy.workCommentsEmpty}</p>
      )}

      {threads.map((thread) => renderComment(thread))}
    </section>
  )
}

export default WorkComments
