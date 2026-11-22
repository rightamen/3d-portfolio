import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { downloadAccountDocument, getAccountDocuments, publicAccountDocumentUrl } from '../lib/api'
import { documentSlots, formatDocumentSize } from '../lib/accountDocuments'
import './profile-documents.css'

const ProfileDocuments = ({ authToken, copy, handle, language, publicDocuments }) => {
  const [ownerDocuments, setOwnerDocuments] = useState(null)
  const [failed, setFailed] = useState(false)
  const [downloading, setDownloading] = useState('')
  const [downloadFailed, setDownloadFailed] = useState(false)

  useEffect(() => {
    if (!authToken) return undefined
    const controller = new AbortController()
    getAccountDocuments(authToken, controller.signal)
      .then(({ documents }) => {
        if (!controller.signal.aborted) setOwnerDocuments(documents)
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })
    return () => controller.abort()
  }, [authToken])

  const download = async (item) => {
    setDownloading(item.kind)
    setDownloadFailed(false)
    try {
      await downloadAccountDocument(authToken, item.kind, item.fileName)
    } catch {
      setDownloadFailed(true)
    } finally {
      setDownloading('')
    }
  }

  if (!authToken && !publicDocuments.length) return null
  const items = authToken ? ownerDocuments : publicDocuments
  const byKind = new Map((items ?? []).map((item) => [item.kind, item]))

  return (
    <section className="profile-documents" aria-label={copy.accountNavDocuments}>
      <header className="profile-documents-heading">
        <h2>{copy.accountNavDocuments}</h2>
        {authToken && <Link to="/account/documents" className="secondary-action">{copy.profileManageDocuments}</Link>}
      </header>
      {failed && <p role="alert">{copy.accountDocumentsLoadError}</p>}
      {!failed && !items && <p role="status">{copy.loading}</p>}
      {items && (
        <div className="profile-document-grid">
          {documentSlots.map(([kind, labelKey]) => {
            const item = byKind.get(kind)
            if (!item && !authToken) return null
            const label = copy[labelKey]
            const downloadLabel = `${label} · ${copy.profileDownloadDocument}`
            return (
              <article key={kind} className="profile-document-card" aria-label={label}>
                <div className="profile-document-icon" aria-hidden="true">PDF</div>
                <div className="profile-document-meta">
                  <h3>{label}</h3>
                  {item ? (
                    <>
                      <p>{item.fileName}</p>
                      <small>
                        {formatDocumentSize(item.byteSize, language)}
                        {authToken && (item.profileVisible ? ` · ${copy.accountDocumentsPublic}` : ` · ${copy.accountDocumentsPrivate}`)}
                      </small>
                    </>
                  ) : <p>{copy.accountDocumentsEmpty}</p>}
                </div>
                {item && (authToken ? (
                  <button
                    type="button" className="secondary-action" disabled={Boolean(downloading)}
                    aria-label={downloadLabel} onClick={() => void download(item)}
                  >
                    {downloading === kind ? copy.accountDocumentsWorking : copy.profileDownloadDocument}
                  </button>
                ) : (
                  <a href={publicAccountDocumentUrl(handle, kind)} className="secondary-action" aria-label={downloadLabel}>
                    {copy.profileDownloadDocument}
                  </a>
                ))}
              </article>
            )
          })}
        </div>
      )}
      {downloadFailed && <p role="alert">{copy.accountDocumentsActionError}</p>}
    </section>
  )
}

export default ProfileDocuments
