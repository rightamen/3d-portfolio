import { useEffect, useRef, useState } from 'react'
import {
  downloadAccountDocument,
  getAccountDocuments,
  removeAccountDocument,
  updateAccountDocumentVisibility,
  uploadAccountDocument,
} from '../lib/api'
import { documentSlots, formatDocumentSize } from '../lib/accountDocuments'
import { getApiErrorMessage } from '../lib/i18n'
import './account-documents.css'

const maxFileSize = 50 * 1024 * 1024
const DocumentSlot = ({ authToken, copy, kind, label, item, onChange, language }) => {
  const input = useRef(null)
  const operation = useRef(null)
  const [chosen, setChosen] = useState(null)
  const [activity, setActivity] = useState('')
  const [progress, setProgress] = useState(0)
  const [notice, setNotice] = useState(null)

  useEffect(() => () => operation.current?.abort(), [])

  const resetPicker = () => {
    setChosen(null)
    if (input.current) input.current.value = ''
  }

  const chooseFile = (event) => {
    const file = event.target.files[0]
    setNotice(null)
    setChosen(null)
    if (!file) return
    const key = !/\.pdf$/i.test(file.name) ? 'accountDocumentsFormat'
      : file.size > maxFileSize ? 'accountDocumentsSize' : ''
    if (key) {
      event.target.value = ''
      setNotice({ key, error: true })
      return
    }
    setChosen(file)
  }

  const run = async (action, perform) => {
    if (operation.current) return
    const controller = new AbortController()
    operation.current = controller
    setActivity(action)
    setNotice(null)
    try {
      await perform(controller.signal)
    } catch (error) {
      if (!controller.signal.aborted) {
        const key = error.status === 413 ? 'accountDocumentsSize'
          : error.code === 'INVALID_FILE_TYPE' ? 'accountDocumentsFormat'
            : error.status === 409 ? 'accountDocumentsVersionChanged' : 'accountDocumentsActionError'
        setNotice({ key, error: true })
      }
    } finally {
      operation.current = null
      if (!controller.signal.aborted) setActivity('')
    }
  }

  const submit = (event) => {
    event.preventDefault()
    if (!chosen) return
    setProgress(0)
    void run('upload', async (signal) => {
      const result = await uploadAccountDocument(authToken, kind, chosen, setProgress, signal)
      if (signal.aborted) return
      onChange(kind, result.document)
      resetPicker()
      setNotice({ key: item?.profileVisible ? 'accountDocumentsReplacementPrivate' : 'accountDocumentsSaved' })
    })
  }

  const remove = () => {
    if (!window.confirm(copy.accountDocumentsConfirm.replace('{kind}', label))) return
    void run('remove', async (signal) => {
      await removeAccountDocument(authToken, kind, signal)
      if (signal.aborted) return
      onChange(kind, null)
      resetPicker()
      setNotice({ key: 'accountDocumentsRemoved' })
    })
  }

  const toggleVisibility = () => {
    const profileVisible = !item.profileVisible
    if (profileVisible && !window.confirm(copy.accountDocumentsPublishConfirm.replace('{kind}', label))) return
    void run('visibility', async (signal) => {
      const { document } = await updateAccountDocumentVisibility(authToken, kind, item.version, profileVisible, signal)
      if (signal.aborted) return
      onChange(kind, document)
      setNotice({ key: profileVisible ? 'accountDocumentsPublished' : 'accountDocumentsUnpublished' })
    })
  }

  const locale = language === 'zh' ? 'zh-CN' : language
  const statusText = activity === 'upload'
    ? copy.accountDocumentsUploading.replace('{progress}', progress)
    : activity ? copy.accountDocumentsWorking : copy[notice?.key]

  return (
    <article className="account-center-card account-document-slot">
      <h2>{label}</h2>
      <div className="account-document-file">
        {item ? (
          <>
            <strong>{item.fileName}</strong>
            <span>
              {formatDocumentSize(item.byteSize, language)} ·{' '}
              <time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleDateString(locale)}</time>
            </span>
            <span>{item.profileVisible ? copy.accountDocumentsPublic : copy.accountDocumentsPrivate}</span>
          </>
        ) : <span>{copy.accountDocumentsEmpty}</span>}
      </div>
      <form className="account-document-form" onSubmit={submit}>
        <div className="account-document-picker">
          <label className="secondary-action">
            {copy.accountDocumentsChoose.replace('{kind}', label)}
            <input
              ref={input} className="sr-only" type="file" accept=".pdf,application/pdf"
              onChange={chooseFile} disabled={Boolean(activity)}
            />
          </label>
          {chosen && <span>{chosen.name}</span>}
        </div>
        <div className="account-document-actions">
          <button className="primary-action" type="submit" disabled={!chosen || Boolean(activity)}>
            {item ? copy.accountDocumentsReplace : copy.accountDocumentsUpload}
          </button>
          {item && (
            <>
              <button
                className="secondary-action"
                type="button"
                disabled={Boolean(activity)}
                onClick={() => void run('download', (signal) =>
                  downloadAccountDocument(authToken, kind, item.fileName, signal))}
              >
                {copy.accountDocumentsDownload}
              </button>
              <button className="secondary-action" type="button" disabled={Boolean(activity)} onClick={toggleVisibility}>
                {item.profileVisible ? copy.accountDocumentsUnpublish : copy.accountDocumentsPublish}
              </button>
              <button className="secondary-action" type="button" disabled={Boolean(activity)} onClick={remove}>
                {copy.accountDocumentsRemove}
              </button>
            </>
          )}
        </div>
      </form>
      {activity === 'upload' && <progress aria-label={statusText} max={100} value={progress} />}
      <p className="account-document-status" role={notice?.error ? 'alert' : 'status'}>{statusText}</p>
    </article>
  )
}

const AccountDocumentsPanel = ({ authToken, copy, language }) => {
  const [items, setItems] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    getAccountDocuments(authToken, controller.signal)
      .then(({ documents }) => {
        if (!controller.signal.aborted) setItems(Object.fromEntries(documents.map((item) => [item.kind, item])))
      })
      .catch((error) => {
        if (!controller.signal.aborted) setLoadError(error)
      })
    return () => controller.abort()
  }, [authToken, attempt])

  const change = (kind, item) => setItems((current) => ({ ...current, [kind]: item }))

  return (
    <section className="admin-section account-documents">
      <p className="account-section-intro">{copy.accountDocumentsIntro}</p>
      {loadError ? (
        <div>
          <p role="alert">{getApiErrorMessage(loadError, copy, copy.accountDocumentsLoadError)}</p>
          <button className="secondary-action" type="button" onClick={() => {
            setLoadError(null)
            setAttempt((value) => value + 1)
          }}>
            {copy.accountDocumentsRetry}
          </button>
        </div>
      ) : items ? (
        <div className="account-document-grid">
          {documentSlots.map(([kind, labelKey]) => (
            <DocumentSlot
              key={kind}
              authToken={authToken}
              copy={copy}
              kind={kind}
              label={copy[labelKey]}
              language={language}
              item={items[kind]}
              onChange={change}
            />
          ))}
        </div>
      ) : <p role="status">{copy.loading}</p>}
    </section>
  )
}

export default AccountDocumentsPanel
