import { useEffect, useMemo, useState } from 'react'
import {
  createCommunityComment,
  deleteCommunityComment,
  getCommunityComments,
  toggleCommunityCommentLike,
} from '../lib/api'

const getDateLocale = (language) =>
  language === 'zh' ? 'zh-CN' : language === 'ja' ? 'ja-JP' : 'en-US'

const buildTree = (comments) => {
  const roots = []
  const childrenByParent = new Map()

  comments.forEach((comment) => {
    if (!comment.parentId) {
      roots.push(comment)
      return
    }
    const bucket = childrenByParent.get(comment.parentId) || []
    bucket.push(comment)
    childrenByParent.set(comment.parentId, bucket)
  })

  return { childrenByParent, roots }
}

const CommentSection = ({ authToken, copy, language, postId, visitorUser }) => {
  const [comments, setComments] = useState([])
  const [status, setStatus] = useState('loading')
  const [sort, setSort] = useState('newest')
  const [message, setMessage] = useState('')
  const [submitState, setSubmitState] = useState({ phase: 'idle', message: '' })
  const [replyTo, setReplyTo] = useState('')
  const [replyMessage, setReplyMessage] = useState('')
  const [replyState, setReplyState] = useState({ phase: 'idle', message: '' })
  const [expandedReplies, setExpandedReplies] = useState({})
  const [busyId, setBusyId] = useState('')

  const dateLocale = getDateLocale(language)

  const loadComments = (nextSort = sort) => {
    setStatus('loading')
    getCommunityComments(postId, { sort: nextSort, token: authToken })
      .then((payload) => {
        setComments(payload.comments || [])
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
  }

  useEffect(() => {
    let isMounted = true
    getCommunityComments(postId, { sort, token: authToken })
      .then((payload) => {
        if (!isMounted) return
        setComments(payload.comments || [])
        setStatus('ready')
      })
      .catch(() => {
        if (isMounted) setStatus('error')
      })

    return () => {
      isMounted = false
    }
  }, [postId, sort, authToken])

  const { childrenByParent, roots } = useMemo(() => buildTree(comments), [comments])
  const totalCount = comments.length

  const changeSort = (nextSort) => {
    if (nextSort === sort) return
    setSort(nextSort)
  }

  const submitComment = async (event) => {
    event.preventDefault()
    if (!authToken || !message.trim()) return

    setSubmitState({ phase: 'saving', message: copy.saving })
    try {
      await createCommunityComment(authToken, postId, { message })
      setMessage('')
      setSubmitState({ phase: 'idle', message: '' })
      loadComments()
    } catch (error) {
      setSubmitState({ phase: 'error', message: error.message || copy.communityCommentError })
    }
  }

  const submitReply = async (event, parentId) => {
    event.preventDefault()
    if (!authToken || !replyMessage.trim()) return

    setReplyState({ phase: 'saving', message: copy.saving })
    try {
      await createCommunityComment(authToken, postId, { message: replyMessage, parentId })
      setReplyMessage('')
      setReplyTo('')
      setReplyState({ phase: 'idle', message: '' })
      setExpandedReplies((current) => ({ ...current, [parentId]: true }))
      loadComments()
    } catch (error) {
      setReplyState({ phase: 'error', message: error.message || copy.communityCommentError })
    }
  }

  const toggleLike = async (commentId) => {
    if (!authToken) return
    setBusyId(commentId)
    try {
      const result = await toggleCommunityCommentLike(authToken, commentId)
      setComments((current) =>
        current.map((comment) =>
          comment.id === commentId
            ? { ...comment, liked: result.liked, likeCount: result.likeCount }
            : comment,
        ),
      )
    } catch {
      // Ignore transient like errors; the UI stays on the last known state.
    } finally {
      setBusyId('')
    }
  }

  const removeComment = async (commentId) => {
    if (!authToken) return
    setBusyId(commentId)
    try {
      await deleteCommunityComment(authToken, commentId)
      loadComments()
    } catch {
      setBusyId('')
    }
  }

  const canDelete = (comment) =>
    Boolean(visitorUser && comment.user && comment.user.id === visitorUser.id)

  const renderComment = (comment, isReply = false) => {
    const replies = childrenByParent.get(comment.id) || []
    const isExpanded = expandedReplies[comment.id]

    return (
      <article key={comment.id} className={`yt-comment ${isReply ? 'yt-comment-reply' : ''}`}>
        <div className="yt-comment-avatar" aria-hidden="true">
          {(comment.author || '?').slice(0, 1).toUpperCase()}
        </div>
        <div className="yt-comment-body">
          <div className="yt-comment-head">
            <strong>{comment.author}</strong>
            <span>{new Date(comment.createdAt).toLocaleDateString(dateLocale)}</span>
          </div>
          <p className="yt-comment-text">{comment.message}</p>
          <div className="yt-comment-actions">
            <button
              type="button"
              className={comment.liked ? 'yt-like-active' : 'yt-like'}
              onClick={() => toggleLike(comment.id)}
              disabled={!visitorUser || busyId === comment.id}
              title={visitorUser ? '' : copy.communityCommentLoginRequired}
            >
              ♥ {comment.likeCount > 0 ? comment.likeCount : ''} {comment.liked ? copy.liked : copy.like}
            </button>
            {visitorUser && !isReply && (
              <button
                type="button"
                className="yt-reply"
                onClick={() => {
                  setReplyTo((current) => (current === comment.id ? '' : comment.id))
                  setReplyMessage('')
                  setReplyState({ phase: 'idle', message: '' })
                }}
              >
                {copy.communityCommentReply}
              </button>
            )}
            {canDelete(comment) && (
              <button
                type="button"
                className="yt-delete"
                onClick={() => removeComment(comment.id)}
                disabled={busyId === comment.id}
              >
                {copy.communityCommentDelete}
              </button>
            )}
          </div>

          {replyTo === comment.id && (
            <form className="yt-reply-form" onSubmit={(event) => submitReply(event, comment.id)}>
              <textarea
                className="field-input field-input-focus min-h-16 resize-none"
                value={replyMessage}
                onChange={(event) => setReplyMessage(event.target.value)}
                placeholder={copy.communityCommentReplyPlaceholder}
                required
              />
              <div className="yt-reply-form-actions">
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => {
                    setReplyTo('')
                    setReplyMessage('')
                  }}
                >
                  {copy.communityCommentCancel}
                </button>
                <button
                  type="submit"
                  className="primary-action"
                  disabled={replyState.phase === 'saving'}
                >
                  {replyState.phase === 'saving' ? copy.saving : copy.communityCommentReplySubmit}
                </button>
              </div>
              {replyState.phase === 'error' && (
                <p className="text-sm text-coral">{replyState.message}</p>
              )}
            </form>
          )}

          {replies.length > 0 && (
            <div className="yt-replies">
              <button
                type="button"
                className="yt-replies-toggle"
                onClick={() =>
                  setExpandedReplies((current) => ({
                    ...current,
                    [comment.id]: !current[comment.id],
                  }))
                }
              >
                {isExpanded
                  ? copy.communityCommentHideReplies
                  : `${copy.communityCommentShowReplies} (${replies.length})`}
              </button>
              {isExpanded && replies.map((reply) => renderComment(reply, true))}
            </div>
          )}
        </div>
      </article>
    )
  }

  return (
    <section className="yt-comments">
      <div className="yt-comments-header">
        <h3>
          {totalCount} {copy.communityComments}
        </h3>
        <div className="yt-sort">
          <button
            type="button"
            className={sort === 'newest' ? 'yt-sort-active' : 'yt-sort-button'}
            onClick={() => changeSort('newest')}
          >
            {copy.communityCommentSortNewest}
          </button>
          <button
            type="button"
            className={sort === 'top' ? 'yt-sort-active' : 'yt-sort-button'}
            onClick={() => changeSort('top')}
          >
            {copy.communityCommentSortTop}
          </button>
        </div>
      </div>

      {visitorUser ? (
        <form className="yt-comment-form" onSubmit={submitComment}>
          <div className="yt-comment-avatar" aria-hidden="true">
            {(visitorUser.displayName || '?').slice(0, 1).toUpperCase()}
          </div>
          <div className="yt-comment-form-body">
            <textarea
              className="field-input field-input-focus min-h-16 resize-none"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={copy.communityCommentPlaceholder}
              required
            />
            <div className="yt-comment-form-actions">
              <button
                type="submit"
                className="primary-action"
                disabled={submitState.phase === 'saving'}
              >
                {submitState.phase === 'saving' ? copy.saving : copy.communityCommentSubmit}
              </button>
            </div>
            {submitState.phase === 'error' && (
              <p className="text-sm text-coral">{submitState.message}</p>
            )}
          </div>
        </form>
      ) : (
        <div className="community-login-required">
          <strong>{copy.communityCommentLoginTitle}</strong>
          <p>{copy.communityCommentLoginRequired}</p>
          <a className="secondary-action w-fit" href="/login">
            {copy.authLogin}
          </a>
        </div>
      )}

      {status === 'loading' && <p className="text-sm text-neutral-500">{copy.loading}</p>}
      {status === 'error' && <p className="text-sm text-coral">{copy.communityCommentLoadError}</p>}
      {status === 'ready' && totalCount === 0 && (
        <p className="text-sm text-neutral-500">{copy.communityCommentEmpty}</p>
      )}

      {status === 'ready' && totalCount > 0 && (
        <div className="yt-comment-list">{roots.map((comment) => renderComment(comment))}</div>
      )}
    </section>
  )
}

export default CommentSection
