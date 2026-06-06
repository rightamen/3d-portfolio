import { useEffect, useMemo, useState } from 'react'
import { assetCategoryProfiles, getAssetCategoryProfile } from '../lib/assetCategories'
import { getCommunityUploads, uploadCommunityResource } from '../lib/api'

const emptyForm = {
  assetCategory: 'generic',
  description: '',
  file: null,
  title: '',
}

const formatFileSize = (size) => {
  if (!Number.isFinite(size) || size <= 0) return ''
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`
  return `${(size / 1024 / 1024).toFixed(size > 20 * 1024 * 1024 ? 0 : 1)} MB`
}

const Community = ({ authToken, copy, language, visitorUser }) => {
  const [uploads, setUploads] = useState([])
  const [status, setStatus] = useState('loading')
  const [form, setForm] = useState(emptyForm)
  const [submitState, setSubmitState] = useState({ phase: 'idle', progress: 0, message: '' })

  const categories = useMemo(
    () =>
      assetCategoryProfiles.map((category) =>
        getAssetCategoryProfile({ assetCategory: category.value }, language),
      ),
    [language],
  )

  useEffect(() => {
    let isMounted = true

    getCommunityUploads()
      .then((payload) => {
        if (!isMounted) return
        setUploads(payload.uploads || [])
        setStatus('ready')
      })
      .catch(() => {
        if (isMounted) setStatus('error')
      })

    return () => {
      isMounted = false
    }
  }, [])

  const submitUpload = async (event) => {
    event.preventDefault()
    if (!authToken || !form.file) return

    setSubmitState({ phase: 'uploading', progress: 0, message: copy.communityUploading })

    try {
      await uploadCommunityResource(authToken, form, form.file, (progress) => {
        setSubmitState({
          phase: 'uploading',
          progress,
          message: `${copy.communityUploading} ${progress}%`,
        })
      })
      setForm(emptyForm)
      setSubmitState({
        phase: 'done',
        progress: 100,
        message: copy.communitySubmitted,
      })
    } catch (error) {
      setSubmitState({
        phase: 'error',
        progress: 0,
        message: error.message || copy.communitySubmitError,
      })
    }
  }

  return (
    <section id="community" className="c-space my-24 scroll-mt-24">
      <div className="section-heading">
        <p className="section-kicker">{copy.communityKicker}</p>
        <h2 className="text-heading">{copy.communityTitle}</h2>
        <p>{copy.communityIntro}</p>
      </div>

      <div className="community-panel">
        <div className="community-upload-copy">
          <p className="section-kicker">{copy.communityUploadKicker}</p>
          <h3>{copy.communityUploadTitle}</h3>
          <p>{copy.communityUploadHint}</p>
          {visitorUser && (
            <span className="community-user-pill">
              {visitorUser.displayName} · {copy.accessLevel}: {copy[`access${visitorUser.accessLevel[0].toUpperCase()}${visitorUser.accessLevel.slice(1)}`]}
            </span>
          )}
        </div>

        {visitorUser ? (
          <form className="community-upload-form" onSubmit={submitUpload}>
            <label className="field-label">
              {copy.communityResourceTitle}
              <input
                className="field-input field-input-focus"
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
                required
              />
            </label>
            <label className="field-label">
              {copy.communityCategory}
              <select
                className="field-input field-input-focus"
                value={form.assetCategory}
                onChange={(event) =>
                  setForm((current) => ({ ...current, assetCategory: event.target.value }))
                }
              >
                {categories.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label md:col-span-2">
              {copy.communityDescription}
              <textarea
                className="field-input field-input-focus min-h-24 resize-none"
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
                required
              />
            </label>
            <label className="field-label md:col-span-2">
              {copy.communityFile}
              <span
                className={`asset-upload-control ${
                  form.file ? 'asset-upload-control-done' : ''
                }`}
              >
                {form.file
                  ? `${form.file.name} · ${formatFileSize(form.file.size)}`
                  : copy.communityChooseFile}
                <input
                  type="file"
                  accept=".glb,.gltf,.fbx,.obj,.zip,.jpg,.jpeg,.png,.webp,.gif"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      file: event.target.files?.[0] || null,
                    }))
                  }
                  required
                />
              </span>
              {submitState.phase !== 'idle' && (
                <span className="asset-upload-progress">
                  <span style={{ width: `${submitState.progress}%` }} />
                </span>
              )}
            </label>
            <button
              type="submit"
              className="primary-action md:col-span-2"
              disabled={submitState.phase === 'uploading'}
            >
              {submitState.phase === 'uploading' ? copy.communityUploading : copy.communitySubmit}
            </button>
            {submitState.phase !== 'idle' && (
              <p
                className={`community-submit-message ${
                  submitState.phase === 'error' ? 'text-coral' : 'text-neutral-300'
                }`}
              >
                {submitState.message}
              </p>
            )}
          </form>
        ) : (
          <div className="community-login-required">
            <strong>{copy.communityLoginRequiredTitle}</strong>
            <p>{copy.communityLoginRequired}</p>
          </div>
        )}
      </div>

      <div className="community-list-header">
        <h3>{copy.communityApprovedTitle}</h3>
        <span>
          {status === 'ready' ? uploads.length : copy.loading}
        </span>
      </div>

      {status === 'error' && <p className="text-coral">{copy.communityLoadError}</p>}
      {status === 'ready' && uploads.length === 0 && (
        <div className="asset-empty-state">
          <strong>{copy.communityEmptyTitle}</strong>
          <span>{copy.communityEmptyBody}</span>
        </div>
      )}
      {uploads.length > 0 && (
        <div className="community-grid">
          {uploads.map((upload) => {
            const category = getAssetCategoryProfile(
              { assetCategory: upload.assetCategory },
              language,
            )

            return (
              <article
                key={upload.id}
                className="community-card"
                style={{ '--category-accent': category.accent }}
              >
                {upload.previewUrl ? (
                  <img src={upload.previewUrl} alt="" />
                ) : (
                  <div className="community-file-preview">{upload.fileType}</div>
                )}
                <div>
                  <span className="project-category-badge">{category.label}</span>
                  <h4>{upload.title}</h4>
                  <p>{upload.description}</p>
                  <small>
                    {upload.user?.displayName || copy.accountGuest} ·{' '}
                    {formatFileSize(upload.fileSize)}
                  </small>
                  <a className="secondary-action" href={upload.fileUrl} target="_blank" rel="noreferrer">
                    {copy.communityOpenFile}
                  </a>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default Community
