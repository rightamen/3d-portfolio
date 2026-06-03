import { useState } from 'react'
import {
  createAdminProject,
  deleteAdminComment,
  deleteAdminContactMessage,
  deleteAdminDownloadRequest,
  deleteAdminProject,
  getAdminComments,
  getAdminContactMessages,
  getAdminDownloadRequests,
  getAdminLikes,
  getAdminProjects,
  getAdminSummary,
  updateAdminDownloadRequest,
  updateAdminProject,
  uploadAdminAsset,
} from './lib/api'

const tokenKey = 'mrright-admin-token'
const sections = [
  { key: 'projects', label: 'Projects' },
  { key: 'comments', label: 'Comments' },
  { key: 'likes', label: 'Likes' },
  { key: 'downloads', label: 'Downloads' },
  { key: 'messages', label: 'Messages' },
]

const formatDate = (value) =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))

const listToText = (value) => (Array.isArray(value) ? value.join(', ') : '')

const textToList = (value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

const searchInItem = (item, query) =>
  !query ||
  JSON.stringify(item)
    .toLowerCase()
    .includes(query.toLowerCase())

const emptyProjectForm = () => ({
  downloadPolicy: 'Unavailable',
  format: 'Image case study',
  image: '/assets/projects/accessories.jpg',
  isNew: true,
  isPublic: true,
  modelSize: 'Static showcase',
  modelUrl: '',
  slug: '',
  stackText: '3D, Web',
  summary: '',
  title: '',
  viewerFeaturesText: 'Case study',
  workflow: '',
  year: String(new Date().getFullYear()),
})

const Admin = () => {
  const [token, setToken] = useState('')
  const [tokenInput, setTokenInput] = useState(() => window.localStorage.getItem(tokenKey) || '')
  const [status, setStatus] = useState('locked')
  const [data, setData] = useState({
    comments: [],
    likes: [],
    messages: [],
    projects: [],
    requests: [],
    summary: null,
  })
  const [editingProject, setEditingProject] = useState(null)
  const [activeSection, setActiveSection] = useState('projects')
  const [projectStatus, setProjectStatus] = useState('idle')
  const [searchQuery, setSearchQuery] = useState('')
  const [uploadStatus, setUploadStatus] = useState('idle')

  const loadAdminData = async (activeToken = token) => {
    if (!activeToken) {
      setStatus('locked')
      return
    }

    setStatus('loading')
    try {
      const [
        summaryPayload,
        commentsPayload,
        likesPayload,
        messagesPayload,
        requestsPayload,
        projectsPayload,
      ] =
        await Promise.all([
          getAdminSummary(activeToken),
          getAdminComments(activeToken),
          getAdminLikes(activeToken),
          getAdminContactMessages(activeToken),
          getAdminDownloadRequests(activeToken),
          getAdminProjects(activeToken),
        ])

      setData({
        comments: commentsPayload.comments,
        likes: likesPayload.likes,
        messages: messagesPayload.messages,
        projects: projectsPayload.projects,
        requests: requestsPayload.requests,
        summary: summaryPayload.summary,
      })
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }

  const unlock = async (event) => {
    event.preventDefault()
    const nextToken = tokenInput.trim()
    window.localStorage.setItem(tokenKey, nextToken)
    setToken(nextToken)
    await loadAdminData(nextToken)
  }

  const logout = () => {
    window.localStorage.removeItem(tokenKey)
    setToken('')
    setTokenInput('')
    setStatus('locked')
  }

  const updateRequestStatus = async (id, nextStatus) => {
    await updateAdminDownloadRequest(token, id, nextStatus)
    await loadAdminData(token)
  }

  const saveProject = async (event) => {
    event.preventDefault()
    setProjectStatus('saving')

    try {
      const payload = {
        ...editingProject,
        stack: textToList(editingProject.stackText),
        viewerFeatures: textToList(editingProject.viewerFeaturesText),
      }

      if (editingProject.isNew) {
        await createAdminProject(token, payload)
      } else {
        await updateAdminProject(token, editingProject.slug, payload)
      }

      setEditingProject(null)
      setProjectStatus('saved')
      await loadAdminData(token)
    } catch {
      setProjectStatus('error')
    }
  }

  const uploadAsset = async (file, targetField) => {
    if (!file) return

    setUploadStatus('uploading')
    try {
      const payload = await uploadAdminAsset(token, file)
      setEditingProject((current) => ({
        ...current,
        [targetField]: payload.file.url,
      }))
      setUploadStatus('done')
    } catch {
      setUploadStatus('error')
    }
  }

  const startEditingProject = (project) => {
    setActiveSection('projects')
    setProjectStatus('idle')
    setUploadStatus('idle')
    setEditingProject({
      ...project,
      isNew: false,
      stackText: listToText(project.stack),
      viewerFeaturesText: listToText(project.viewerFeatures),
    })
  }

  const startCreatingProject = () => {
    setActiveSection('projects')
    setProjectStatus('idle')
    setUploadStatus('idle')
    setEditingProject(emptyProjectForm())
  }

  const deleteItem = async (label, action) => {
    if (!window.confirm(`Delete this ${label}? This cannot be undone.`)) return

    await action()
    await loadAdminData(token)
  }

  const visibleProjects = data.projects.filter((project) =>
    searchInItem(project, searchQuery),
  )
  const visibleComments = data.comments.filter((comment) =>
    searchInItem(comment, searchQuery),
  )
  const visibleLikes = data.likes.filter((like) => searchInItem(like, searchQuery))
  const visibleRequests = data.requests.filter((request) =>
    searchInItem(request, searchQuery),
  )
  const visibleMessages = data.messages.filter((message) =>
    searchInItem(message, searchQuery),
  )

  if (!token || status === 'locked') {
    return (
      <main className="admin-shell">
        <form className="admin-login" onSubmit={unlock}>
          <div>
            <p className="section-kicker">Admin</p>
            <h1 className="text-3xl font-semibold text-white">mrright.blog control</h1>
          </div>
          <input
            className="field-input field-input-focus"
            placeholder="Admin token"
            type="password"
            value={tokenInput}
            onChange={(event) => setTokenInput(event.target.value)}
            required
          />
          <button type="submit" className="primary-action">
            Open Dashboard
          </button>
        </form>
      </main>
    )
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="section-kicker mb-1">Admin</p>
          <h1 className="text-3xl font-semibold text-white">Portfolio Operations</h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="secondary-action" onClick={() => loadAdminData(token)}>
            Refresh
          </button>
          <button type="button" className="secondary-action" onClick={logout}>
            Sign Out
          </button>
        </div>
      </header>

      {status === 'loading' && <p className="text-neutral-400">Loading admin data...</p>}
      {status === 'error' && (
        <p className="text-coral">Could not load admin data. Check the token.</p>
      )}

      {status === 'ready' && (
        <>
          <section className="admin-metrics">
            {[
              ['projects', 'Projects', data.projects.length],
              ['comments', 'Comments', data.summary.comments],
              ['likes', 'Likes', data.summary.likes],
              ['downloads', 'Downloads', data.summary.download_requests],
              ['messages', 'Messages', data.summary.contact_messages],
            ].map(([key, label, value]) => (
              <button
                key={key}
                type="button"
                className={`admin-metric ${activeSection === key ? 'admin-metric-active' : ''}`}
                onClick={() => {
                  setActiveSection(key)
                  setEditingProject(null)
                }}
              >
                <span>{label}</span>
                <strong>{value}</strong>
              </button>
            ))}
          </section>

          <nav className="admin-tabs">
            {sections.map((section) => (
              <button
                key={section.key}
                type="button"
                className={activeSection === section.key ? 'admin-tab-active' : 'admin-tab'}
                onClick={() => {
                  setActiveSection(section.key)
                  setEditingProject(null)
                }}
              >
                {section.label}
              </button>
            ))}
          </nav>

          <div className="admin-search">
            <input
              className="field-input field-input-focus"
              placeholder="Search by project, visitor, author, email, status..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="secondary-action"
                onClick={() => setSearchQuery('')}
              >
                Clear
              </button>
            )}
          </div>

          {activeSection === 'projects' && (
          <section className="admin-section">
            <div className="admin-section-header">
              <h2>Projects</h2>
              <div className="flex items-center gap-3">
              <span>{visibleProjects.length}</span>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={startCreatingProject}
                >
                  New Project
                </button>
              </div>
            </div>
            <div className="admin-table">
              {visibleProjects.map((project) => (
                <article key={project.slug} className="admin-row">
                  <div>
                    <strong>{project.title}</strong>
                    <span>
                      {project.slug} · {project.year} ·{' '}
                      {project.isPublic === false ? 'hidden' : 'public'}
                    </span>
                    <p>{project.summary}</p>
                    <small>{project.stack?.join(', ')}</small>
                  </div>
                  <div className="admin-actions">
                    <span
                      className={`status-pill ${
                        project.isPublic === false ? 'status-rejected' : 'status-approved'
                      }`}
                    >
                      {project.isPublic === false ? 'hidden' : 'public'}
                    </span>
                    <button
                      type="button"
                      className="secondary-action"
                      onClick={() => startEditingProject(project)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="danger-action"
                      onClick={() =>
                        deleteItem('project', () => deleteAdminProject(token, project.slug))
                      }
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
              {visibleProjects.length === 0 && (
                <p className="text-sm text-neutral-500">No projects match this search.</p>
              )}
            </div>
          </section>
          )}

          {activeSection === 'projects' && editingProject && (
            <section className="admin-section">
              <div className="admin-section-header">
                <h2>{editingProject.isNew ? 'New Project' : 'Edit Project'}</h2>
                <span>{editingProject.slug}</span>
              </div>
              <form className="admin-editor" onSubmit={saveProject}>
                <label className="field-label">
                  Slug
                  <input
                    className="field-input field-input-focus"
                    value={editingProject.slug}
                    disabled={!editingProject.isNew}
                    placeholder="new-project-slug"
                    onChange={(event) =>
                      setEditingProject((current) => ({
                        ...current,
                        slug: event.target.value.toLowerCase(),
                      }))
                    }
                    required
                  />
                </label>
                <label className="field-label">
                  Title
                  <input
                    className="field-input field-input-focus"
                    value={editingProject.title}
                    onChange={(event) =>
                      setEditingProject((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
                <label className="field-label">
                  Summary
                  <textarea
                    className="field-input field-input-focus min-h-24 resize-none"
                    value={editingProject.summary}
                    onChange={(event) =>
                      setEditingProject((current) => ({
                        ...current,
                        summary: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
                <label className="field-label">
                  Workflow
                  <textarea
                    className="field-input field-input-focus min-h-28 resize-none"
                    value={editingProject.workflow || ''}
                    onChange={(event) =>
                      setEditingProject((current) => ({
                        ...current,
                        workflow: event.target.value,
                      }))
                    }
                  />
                </label>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="field-label">
                    Year
                    <input
                      className="field-input field-input-focus"
                      value={editingProject.year}
                      onChange={(event) =>
                        setEditingProject((current) => ({
                          ...current,
                          year: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label className="field-label">
                    Format
                    <input
                      className="field-input field-input-focus"
                      value={editingProject.format || ''}
                      onChange={(event) =>
                        setEditingProject((current) => ({
                          ...current,
                          format: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="field-label">
                    Image URL
                    <input
                      className="field-input field-input-focus"
                      value={editingProject.image}
                      onChange={(event) =>
                        setEditingProject((current) => ({
                          ...current,
                          image: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label className="field-label">
                    Upload Image
                    <input
                      className="field-input field-input-focus"
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,.gif"
                      onChange={(event) => uploadAsset(event.target.files?.[0], 'image')}
                    />
                  </label>
                  <label className="field-label">
                    Model URL
                    <input
                      className="field-input field-input-focus"
                      value={editingProject.modelUrl || ''}
                      onChange={(event) =>
                        setEditingProject((current) => ({
                          ...current,
                          modelUrl: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="field-label">
                    Upload Model
                    <input
                      className="field-input field-input-focus"
                      type="file"
                      accept=".glb,.gltf,.fbx,.obj,.zip"
                      onChange={(event) => uploadAsset(event.target.files?.[0], 'modelUrl')}
                    />
                  </label>
                  <label className="field-label">
                    Model Size
                    <input
                      className="field-input field-input-focus"
                      value={editingProject.modelSize || ''}
                      onChange={(event) =>
                        setEditingProject((current) => ({
                          ...current,
                          modelSize: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="field-label">
                    Download Policy
                    <input
                      className="field-input field-input-focus"
                      value={editingProject.downloadPolicy || ''}
                      onChange={(event) =>
                        setEditingProject((current) => ({
                          ...current,
                          downloadPolicy: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
                <label className="field-label">
                  Stack
                  <input
                    className="field-input field-input-focus"
                    value={editingProject.stackText}
                    onChange={(event) =>
                      setEditingProject((current) => ({
                        ...current,
                        stackText: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field-label">
                  Viewer Features
                  <input
                    className="field-input field-input-focus"
                    value={editingProject.viewerFeaturesText}
                    onChange={(event) =>
                      setEditingProject((current) => ({
                        ...current,
                        viewerFeaturesText: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="admin-toggle">
                  <input
                    type="checkbox"
                    checked={editingProject.isPublic !== false}
                    onChange={(event) =>
                      setEditingProject((current) => ({
                        ...current,
                        isPublic: event.target.checked,
                      }))
                    }
                  />
                  Public project
                </label>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    className="primary-action"
                    disabled={projectStatus === 'saving'}
                  >
                    {projectStatus === 'saving' ? 'Saving...' : 'Save Project'}
                  </button>
                  <button
                    type="button"
                    className="secondary-action"
                    onClick={() => setEditingProject(null)}
                  >
                    Cancel
                  </button>
                </div>
                {projectStatus === 'error' && (
                  <p className="text-sm text-coral">Could not save this project.</p>
                )}
                {uploadStatus === 'uploading' && (
                  <p className="text-sm text-neutral-400">Uploading asset...</p>
                )}
                {uploadStatus === 'done' && (
                  <p className="text-sm text-mint">Asset uploaded and URL filled in.</p>
                )}
                {uploadStatus === 'error' && (
                  <p className="text-sm text-coral">
                    Upload failed. Check the file type and size.
                  </p>
                )}
              </form>
            </section>
          )}

          {activeSection === 'downloads' && (
          <section className="admin-section">
            <div className="admin-section-header">
              <h2>Download Requests</h2>
              <span>{visibleRequests.length}</span>
            </div>
            <div className="admin-table">
              {visibleRequests.map((request) => (
                <article key={request.id} className="admin-row">
                  <div>
                    <strong>{request.name}</strong>
                    <span>{request.email}</span>
                    <p>{request.purpose}</p>
                    <small>
                      {request.projectTitle} · {formatDate(request.createdAt)}
                    </small>
                  </div>
                  <div className="admin-actions">
                    <span className={`status-pill status-${request.status}`}>
                      {request.status}
                    </span>
                    <button
                      type="button"
                      className="secondary-action"
                      onClick={() => updateRequestStatus(request.id, 'approved')}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="secondary-action"
                      onClick={() => updateRequestStatus(request.id, 'rejected')}
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      className="danger-action"
                      onClick={() =>
                        deleteItem('download request', () =>
                          deleteAdminDownloadRequest(token, request.id),
                        )
                      }
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
              {visibleRequests.length === 0 && (
                <p className="text-sm text-neutral-500">
                  No download requests match this search.
                </p>
              )}
            </div>
          </section>
          )}

          {activeSection === 'comments' && (
          <section className="admin-section">
            <div className="admin-section-header">
              <h2>Comments</h2>
              <span>{visibleComments.length}</span>
            </div>
            <div className="admin-table">
              {visibleComments.map((comment) => (
                <article key={comment.id} className="admin-row">
                  <div>
                    <strong>{comment.author}</strong>
                    <span>{comment.projectSlug}</span>
                    <p>{comment.message}</p>
                    <small>{formatDate(comment.createdAt)}</small>
                  </div>
                  <div className="admin-actions">
                    <button
                      type="button"
                      className="danger-action"
                      onClick={() =>
                        deleteItem('comment', () => deleteAdminComment(token, comment.id))
                      }
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
              {visibleComments.length === 0 && (
                <p className="text-sm text-neutral-500">No comments match this search.</p>
              )}
            </div>
          </section>
          )}

          {activeSection === 'likes' && (
          <section className="admin-section">
            <div className="admin-section-header">
              <h2>Likes</h2>
              <span>{visibleLikes.length}</span>
            </div>
            <div className="admin-table">
              {visibleLikes.map((like) => (
                <article
                  key={`${like.projectSlug}-${like.visitorId}`}
                  className="admin-row"
                >
                  <div>
                    <strong>{like.projectSlug}</strong>
                    <span>{like.visitorId}</span>
                    <p>Visitor liked this project.</p>
                    <small>{formatDate(like.createdAt)}</small>
                  </div>
                </article>
              ))}
              {visibleLikes.length === 0 && (
                <p className="text-sm text-neutral-500">No likes match this search.</p>
              )}
            </div>
          </section>
          )}

          {activeSection === 'messages' && (
          <section className="admin-section">
            <div className="admin-section-header">
              <h2>Contact Messages</h2>
              <span>{visibleMessages.length}</span>
            </div>
            <div className="admin-table">
              {visibleMessages.map((message) => (
                <article key={message.id} className="admin-row">
                  <div>
                    <strong>{message.name}</strong>
                    <span>{message.email}</span>
                    <p>{message.message}</p>
                    <small>{formatDate(message.createdAt)}</small>
                  </div>
                  <div className="admin-actions">
                    <button
                      type="button"
                      className="danger-action"
                      onClick={() =>
                        deleteItem('contact message', () =>
                          deleteAdminContactMessage(token, message.id),
                        )
                      }
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
              {visibleMessages.length === 0 && (
                <p className="text-sm text-neutral-500">
                  No contact messages match this search.
                </p>
              )}
            </div>
          </section>
          )}
        </>
      )}
    </main>
  )
}

export default Admin
