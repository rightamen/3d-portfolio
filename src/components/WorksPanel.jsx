import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { assetCategoryProfiles } from '../lib/assetCategories'
import {
  createWork,
  getWork,
  deleteWork,
  deleteWorkAsset,
  getMyWorks,
  setWorkStatus,
  updateWork,
  uploadWorkAsset,
} from '../lib/api'
import { getApiErrorMessage } from '../lib/i18n'

// Publishing a work.
//
// The API for all of this shipped with the publishing flow; nothing ever
// called it, so the site said "anyone can publish" and offered no way to. This
// is that way: create a draft, fill it in, add files, submit.
//
// Draft-first on purpose. A form that only saves when everything is valid
// loses the work someone did before they found the file they wanted, and a
// creator gathering assets is the normal case here, not the exception.

const STATUS_KEYS = {
  draft: 'worksStatusDraft',
  hidden: 'worksStatusHidden',
  published: 'worksStatusPublished',
  rejected: 'worksStatusRejected',
  review: 'worksStatusReview',
}

// preview and model are public; source is what a buyer pays for. The order
// here is the order they are asked for, which is the order they matter in.
const ASSET_KINDS = [
  { key: 'preview', labelKey: 'worksAssetPreview' },
  { key: 'model', labelKey: 'worksAssetModel' },
  { key: 'source', labelKey: 'worksAssetSource' },
]

const WorksPanel = ({ authToken, copy, language, visitorUser }) => {
  const [works, setWorks] = useState(null)
  const [openId, setOpenId] = useState('')
  // The list endpoint returns summaries, which carry no assets. The editor
  // needs the full work, so opening one fetches it -- and every upload or
  // removal replaces it with the copy the API just returned.
  const [detail, setDetail] = useState(null)
  const [draft, setDraft] = useState({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [reloadNonce, setReloadNonce] = useState(0)

  useEffect(() => {
    let isMounted = true

    getMyWorks(authToken)
      .then((payload) => {
        if (isMounted) setWorks(payload.works || [])
      })
      .catch((error) => {
        if (!isMounted) return
        setWorks([])
        setMessage(error.code ? getApiErrorMessage(error, copy) : error.message)
      })

    return () => {
      isMounted = false
    }
  }, [authToken, copy, reloadNonce])

  const run = useCallback(
    async (task, successMessage = '') => {
      if (busy) return null
      setBusy(true)
      setMessage('')
      try {
        const result = await task()
        setMessage(successMessage)
        setReloadNonce((value) => value + 1)
        return result
      } catch (error) {
        setMessage(error.code ? getApiErrorMessage(error, copy) : error.message)
        return null
      } finally {
        setBusy(false)
      }
    },
    [busy, copy],
  )

  if (works === null) return <p className="text-neutral-400">{copy.loading}</p>

  // The handle is half of every work's URL, so there is nowhere to put a work
  // without one. Said here rather than left to the API's 400, because the fix
  // is on a different screen.
  if (!visitorUser?.handle) {
    return (
      <section className="admin-section">
        <div className="admin-section-header">
          <h2>{copy.worksTitle}</h2>
        </div>
        <p className="text-coral">{copy.worksNeedHandle}</p>
      </section>
    )
  }

  const open = async (work) => {
    if (openId === work.id) {
      setOpenId('')
      setDetail(null)
      return
    }
    setOpenId(work.id)
    setDetail(null)
    setDraft({
      assetCategory: work.assetCategory || '',
      priceCents: work.priceCents || 0,
      summary: work.summary || '',
      title: work.title || '',
    })

    try {
      // The owner's own token, which is what lets a draft be read at its real
      // address before it is published.
      const payload = await getWork(visitorUser.handle, work.slug, authToken)
      setDetail(payload.work)
    } catch (error) {
      setMessage(error.code ? getApiErrorMessage(error, copy) : error.message)
    }
  }

  const renderEditor = (work) => {
    const assets = detail?.id === work.id ? detail.assets || [] : []

    return (
      <div className="works-editor">
        <div className="works-fields">
          <label>
            <span>{copy.worksFieldTitle}</span>
            <input
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              type="text"
              value={draft.title}
            />
          </label>
          <label>
            <span>{copy.worksFieldSummary}</span>
            <textarea
              onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
              rows={3}
              value={draft.summary}
            />
          </label>
          <label>
            <span>{copy.worksFieldCategory}</span>
            <select
              onChange={(event) => setDraft({ ...draft, assetCategory: event.target.value })}
              value={draft.assetCategory}
            >
              <option value="">—</option>
              {assetCategoryProfiles.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.shortLabels?.[language] || category.shortLabels?.en || category.value}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{copy.worksFieldPrice}</span>
            {/* Entered in whole currency, stored in integer cents. Floating
                point money is a class of bug this project does not need to
                rediscover, so the conversion happens once, here. */}
            <input
              min="0"
              onChange={(event) =>
                setDraft({
                  ...draft,
                  priceCents: Math.max(0, Math.round(Number(event.target.value || 0) * 100)),
                })
              }
              step="0.01"
              type="number"
              value={(draft.priceCents / 100).toFixed(2)}
            />
            <small>{copy.worksFieldPriceFree}</small>
          </label>
        </div>

        <div className="theme-editor-actions">
          <button
            className="primary-action"
            disabled={busy}
            onClick={() =>
              run(
                () =>
                  updateWork(
                    work.id,
                    {
                      assetCategory: draft.assetCategory,
                      priceCents: draft.priceCents,
                      summary: draft.summary,
                      title: draft.title,
                    },
                    authToken,
                  ),
                copy.worksSaved,
              )
            }
            type="button"
          >
            {copy.worksSave}
          </button>
        </div>

        {draft.priceCents > 0 && <p className="text-neutral-400">{copy.worksSellHint}</p>}

        <h4>{copy.worksAssets}</h4>
        <p className="text-neutral-400">{copy.worksAssetHint}</p>
        {ASSET_KINDS.map((kind) => {
          const existing = assets.filter((asset) => asset.kind === kind.key)

          return (
            <div className="works-asset" key={kind.key}>
              <span>{copy[kind.labelKey]}</span>
              {existing.map((asset) => (
                <div className="works-asset-row" key={asset.id}>
                  <span>{asset.fileName}</span>
                  <button
                    className="secondary-action"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const removed = await deleteWorkAsset(work.id, asset.id, authToken)
                        if (removed?.work) setDetail(removed.work)
                      })
                    }
                    type="button"
                  >
                    {copy.worksRemove}
                  </button>
                </div>
              ))}
              {/* Labelled, which the key was there for and a bare file input
                  needs anyway: "Upload" beside three of these is the only
                  thing telling a screen reader which one it is. */}
              <label className="works-asset-upload">
                <span className="explore-search-label">
                  {copy.worksUpload} · {copy[kind.labelKey]}
                </span>
                <input
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (!file) return
                    run(async () => {
                      const uploaded = await uploadWorkAsset(work.id, kind.key, file, authToken)
                      if (uploaded?.work) setDetail(uploaded.work)
                    })
                    // Cleared so choosing the same file twice still fires.
                    event.target.value = ''
                  }}
                  type="file"
                />
              </label>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <div>
          <h2>{copy.worksTitle}</h2>
          <p className="account-section-intro">{copy.worksIntro}</p>
        </div>
        <button
          className="primary-action"
          disabled={busy}
          onClick={async () => {
            const created = await run(() =>
              createWork({ title: copy.worksNew }, authToken),
            )
            if (created?.work) open(created.work)
          }}
          type="button"
        >
          {copy.worksNew}
        </button>
      </div>

      {message && (
        <p className={message === copy.worksSaved ? 'text-neutral-400' : 'text-coral'}>{message}</p>
      )}
      {works.length === 0 && <p className="text-neutral-400">{copy.worksEmpty}</p>}

      {works.map((work) => (
        <article className="works-row" key={work.id}>
          <div>
            <div className="admin-row-title">
              <strong>{work.title}</strong>
              <span className={`status-pill status-${work.status}`}>
                {copy[STATUS_KEYS[work.status]] || work.status}
              </span>
            </div>
            <small>
              {work.priceCents > 0
                ? `${(work.priceCents / 100).toFixed(2)} ${String(work.currency).toUpperCase()}`
                : copy.exploreFree}
            </small>
          </div>
          <div className="works-row-actions">
            <button className="secondary-action" onClick={() => open(work)} type="button">
              {openId === work.id ? copy.workCommentCancel : copy.worksEdit}
            </button>
            {work.status === 'published' && (
              <Link className="secondary-action" to={work.url}>
                {copy.worksOpen}
              </Link>
            )}
            {(work.status === 'draft' || work.status === 'rejected') && (
              <button
                className="primary-action"
                disabled={busy}
                onClick={() => run(() => setWorkStatus(work.id, 'review', authToken))}
                title={copy.worksSubmitHint}
                type="button"
              >
                {work.status === 'draft' ? copy.worksSubmit : copy.worksUnhide}
              </button>
            )}
            {work.status === 'published' && (
              <button
                className="secondary-action"
                disabled={busy}
                onClick={() => run(() => setWorkStatus(work.id, 'hidden', authToken))}
                type="button"
              >
                {copy.worksHide}
              </button>
            )}
            {(work.status === 'draft' || work.status === 'rejected') && (
              <button
                className="secondary-action"
                disabled={busy}
                // A confirm, because a draft delete is real and irreversible.
                // Published works cannot be deleted at all -- someone may have
                // bought them -- and the API refuses regardless of this button.
                onClick={() => {
                  if (window.confirm(copy.worksDeleteConfirm)) {
                    run(() => deleteWork(work.id, authToken))
                  }
                }}
                type="button"
              >
                {copy.worksDelete}
              </button>
            )}
          </div>
          {openId === work.id && renderEditor(work)}
        </article>
      ))}
    </section>
  )
}

export default WorksPanel
