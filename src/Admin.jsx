import { useEffect, useRef, useState } from 'react'
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

const createSlug = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 64)

const toTitle = (value) =>
  value
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())

const getExtension = (fileName) => fileName.split('.').pop()?.toUpperCase() || ''

const getFileExtension = (fileName) => `.${fileName.split('.').pop()?.toLowerCase() || ''}`

const formatFileSize = (size) => {
  if (!Number.isFinite(size) || size <= 0) return ''
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`
  return `${(size / 1024 / 1024).toFixed(size > 20 * 1024 * 1024 ? 0 : 1)} MB`
}

const searchInItem = (item, query) =>
  !query ||
  JSON.stringify(item)
    .toLowerCase()
    .includes(query.toLowerCase())

const downloadPolicyPresets = [
  { label: 'Open Download', value: 'Open download' },
  { label: 'Member Download', value: 'Member download' },
  { label: 'Approved Download', value: 'Approved download' },
]

const projectPresets = [
  {
    key: 'game-prop',
    label: 'Game Prop',
    values: {
      downloadPolicy: downloadPolicyPresets[2].value,
      format: 'Realtime 3D asset',
      modelSize: 'Auto-detected after upload',
      stackText: '3ds Max, FBX, PBR, GLB',
      summary: 'A production-ready realtime prop with optimized topology, PBR materials, and web delivery.',
      viewerFeaturesText: 'Orbit, Zoom, Pan, Texture view, Clay view, Wireframe',
      workflow:
        'Modeled and UV prepared for a realtime workflow, then converted into a compressed web preview with PBR texture maps preserved.',
    },
  },
  {
    key: 'environment',
    label: 'Environment',
    values: {
      downloadPolicy: downloadPolicyPresets[1].value,
      format: 'Environment scene',
      modelSize: 'Auto-detected after upload',
      stackText: 'Environment Art, Lighting, PBR, Optimization',
      summary: 'A compact environment showcase focused on composition, lighting, materials, and web performance.',
      viewerFeaturesText: 'Orbit, Zoom, Pan, Lighting preview, Wireframe',
      workflow:
        'Built as a scene presentation with optimized geometry, compressed textures, and a browser-friendly model export.',
    },
  },
  {
    key: 'character',
    label: 'Character',
    values: {
      downloadPolicy: downloadPolicyPresets[2].value,
      format: 'Character model',
      modelSize: 'Auto-detected after upload',
      stackText: 'Character Art, Retopology, UV, PBR',
      summary: 'A character-focused 3D study presenting silhouette, material response, and realtime model preparation.',
      viewerFeaturesText: 'Orbit, Zoom, Pan, Texture view, Clay view',
      workflow:
        'Prepared from high-level sculpt/modeling work into a clean presentation asset with readable materials and optimized preview settings.',
    },
  },
  {
    key: 'case-study',
    label: 'Case Study',
    values: {
      downloadPolicy: downloadPolicyPresets[0].value,
      format: 'Image case study',
      modelSize: 'Static showcase',
      stackText: '3D, Rendering, Portfolio',
      summary: 'A visual case study documenting the project result, production choices, and final presentation.',
      viewerFeaturesText: 'Case study',
      workflow:
        'Presented as a still-image breakdown with concise production notes and portfolio-ready context.',
    },
  },
]

const formatPresets = [
  'Realtime 3D asset',
  'GLB model',
  'FBX model',
  'OBJ model',
  'Environment scene',
  'Character model',
  'Image case study',
]

const modelSizePresets = [
  'Auto-detected after upload',
  'Static showcase',
  'Under 10 MB',
  '10-50 MB',
  '50-120 MB',
  'Source package',
]

const stackKeywordPresets = [
  '3ds Max',
  'FBX',
  'PBR',
  'GLB',
  'Realtime',
  'Game Asset',
  'Hard Surface',
  'Texture Baking',
  'Optimization',
]

const viewerFeaturePresets = [
  'Orbit',
  'Zoom',
  'Pan',
  'Texture view',
  'Clay view',
  'Wireframe',
  'Auto rotate',
  'Grid floor',
  'Case study',
]

const emptyUploadStatus = {
  image: { phase: 'idle', progress: 0, message: '' },
  modelUrl: { phase: 'idle', progress: 0, message: '' },
}

const emptyProjectForm = () => ({
  downloadPolicy: downloadPolicyPresets[2].value,
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

const appendKeyword = (text, keyword) => {
  const values = new Set(textToList(text))
  values.add(keyword)
  return Array.from(values).join(', ')
}

const exportGlb = (object, GLTFExporter) =>
  new Promise((resolve, reject) => {
    const exporter = new GLTFExporter()
    exporter.parse(
      object,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(result)
          return
        }

        reject(new Error('GLB exporter returned JSON instead of binary data.'))
      },
      (error) => reject(error),
      {
        binary: true,
        embedImages: true,
        forceIndices: true,
        truncateDrawRange: true,
      },
    )
  })

const convertModelInBrowser = async (file) => {
  const extension = getFileExtension(file.name)
  if (!['.fbx', '.obj'].includes(extension)) {
    return {
      converted: false,
      file,
      originalExtension: getExtension(file.name),
    }
  }

  const baseName = file.name.replace(/\.[^.]+$/, '')
  const [{ GLTFExporter }, { FBXLoader }, { OBJLoader }] = await Promise.all([
    import('three/examples/jsm/exporters/GLTFExporter.js'),
    import('three/examples/jsm/loaders/FBXLoader.js'),
    import('three/examples/jsm/loaders/OBJLoader.js'),
  ])
  const object =
    extension === '.fbx'
      ? new FBXLoader().parse(await file.arrayBuffer(), '')
      : new OBJLoader().parse(await file.text())
  const glbBuffer = await exportGlb(object, GLTFExporter)

  return {
    converted: true,
    file: new File([glbBuffer], `${baseName}.glb`, { type: 'model/gltf-binary' }),
    originalExtension: getExtension(file.name),
  }
}

const Admin = () => {
  const editorRef = useRef(null)
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
  const [editorScrollKey, setEditorScrollKey] = useState(0)
  const [projectStatus, setProjectStatus] = useState('idle')
  const [searchQuery, setSearchQuery] = useState('')
  const [uploadStatus, setUploadStatus] = useState(() => ({ ...emptyUploadStatus }))

  useEffect(() => {
    if (!editorScrollKey) return

    window.setTimeout(() => {
      editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
  }, [editorScrollKey])

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

  const applyProjectPreset = (presetKey) => {
    const preset = projectPresets.find((item) => item.key === presetKey)
    if (!preset) return

    setEditingProject((current) => ({
      ...current,
      ...preset.values,
    }))
  }

  const addStackKeyword = (keyword) => {
    setEditingProject((current) => ({
      ...current,
      stackText: appendKeyword(current.stackText, keyword),
    }))
  }

  const addViewerFeature = (feature) => {
    setEditingProject((current) => ({
      ...current,
      viewerFeaturesText: appendKeyword(current.viewerFeaturesText, feature),
    }))
  }

  const uploadAsset = async (file, targetField) => {
    if (!file) return

    let uploadFile = file
    let localConversion = {
      converted: false,
      originalExtension: getExtension(file.name),
    }

    setUploadStatus((current) => ({
      ...current,
      [targetField]: {
        phase: targetField === 'modelUrl' ? 'processing' : 'uploading',
        progress: 0,
        message: targetField === 'modelUrl' ? 'Preparing model...' : '',
      },
    }))
    try {
      if (targetField === 'modelUrl') {
        setUploadStatus((current) => ({
          ...current,
          [targetField]: {
            phase: 'processing',
            progress: 6,
            message: 'Converting locally to GLB...',
          },
        }))

        try {
          localConversion = await convertModelInBrowser(file)
          uploadFile = localConversion.file
        } catch {
          localConversion = {
            converted: false,
            failed: true,
            originalExtension: getExtension(file.name),
          }
          uploadFile = file
        }
      }

      const payload = await uploadAdminAsset(token, uploadFile, (progress) => {
        setUploadStatus((current) => ({
          ...current,
          [targetField]: {
            phase: progress >= 100 && targetField === 'modelUrl' ? 'processing' : 'uploading',
            progress,
            message: progress >= 100 && targetField === 'modelUrl' ? 'Finalizing model...' : '',
          },
        }))
      })
      const extension = getExtension(payload.file.name)
      const size = formatFileSize(payload.file.size)
      const title = toTitle(file.name)

      setEditingProject((current) => {
        const next = {
          ...current,
          [targetField]: payload.file.url,
        }

        if (targetField === 'modelUrl') {
          const converted = localConversion.converted || payload.conversion?.status === 'converted'
          next.format = converted ? 'GLB model' : extension ? `${extension} model` : next.format
          next.modelSize = size || next.modelSize
          next.stackText = appendKeyword(
            appendKeyword(next.stackText, localConversion.originalExtension || extension || '3D'),
            converted ? 'GLB' : '3D',
          )
          if (!next.title) next.title = title
          if (next.isNew && !next.slug) next.slug = createSlug(title)
          if (!next.summary) {
            next.summary = `A realtime 3D asset preview for ${title || 'this project'}.`
          }
        }

        if (targetField === 'image') {
          if (!next.title) next.title = title
          if (next.isNew && !next.slug) next.slug = createSlug(title)
          if (!next.format || next.format === 'Image case study') {
            next.format = extension ? `${extension} preview image` : next.format
          }
        }

        return next
      })
      const conversionStatus = payload.conversion?.status
      const uploadMessage =
        targetField === 'modelUrl' && localConversion.converted
          ? 'Converted locally and uploaded'
          : targetField === 'modelUrl' && conversionStatus === 'converted'
            ? 'Uploaded and converted to GLB'
          : targetField === 'modelUrl' && conversionStatus === 'skipped'
            ? localConversion.failed
              ? 'Uploaded, local conversion failed'
              : 'Uploaded, converter unavailable'
            : targetField === 'modelUrl' && conversionStatus === 'failed'
              ? 'Uploaded, conversion failed'
              : 'Uploaded successfully'
      setUploadStatus((current) => ({
        ...current,
        [targetField]: { phase: 'done', progress: 100, message: uploadMessage },
      }))
    } catch {
      setUploadStatus((current) => ({
        ...current,
        [targetField]: {
          phase: 'error',
          progress: 0,
          message: 'Upload failed. Check size and format.',
        },
      }))
    }
  }

  const selectAsset = async (event, targetField) => {
    await uploadAsset(event.target.files?.[0], targetField)
    event.target.value = ''
  }

  const startEditingProject = (project) => {
    setActiveSection('projects')
    setProjectStatus('idle')
    setUploadStatus({ ...emptyUploadStatus })
    setEditingProject({
      ...project,
      isNew: false,
      stackText: listToText(project.stack),
      viewerFeaturesText: listToText(project.viewerFeatures),
    })
    setEditorScrollKey((current) => current + 1)
  }

  const startCreatingProject = () => {
    setActiveSection('projects')
    setProjectStatus('idle')
    setUploadStatus({ ...emptyUploadStatus })
    setEditingProject({
      ...emptyProjectForm(),
      ...projectPresets[0].values,
      downloadPolicy: downloadPolicyPresets[2].value,
    })
    setEditorScrollKey((current) => current + 1)
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
            <section className="admin-section" ref={editorRef}>
              <div className="admin-section-header">
                <h2>{editingProject.isNew ? 'New Project' : 'Edit Project'}</h2>
                <span>{editingProject.slug}</span>
              </div>
              <form className="admin-editor" onSubmit={saveProject}>
                <label className="field-label">
                  Project Type Preset
                  <select
                    className="field-input field-input-focus"
                    defaultValue=""
                    onChange={(event) => {
                      applyProjectPreset(event.target.value)
                      event.target.value = ''
                    }}
                  >
                    <option value="" disabled>
                      Apply a project type...
                    </option>
                    {projectPresets.map((preset) => (
                      <option key={preset.key} value={preset.key}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </label>
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
                    <select
                      className="field-input field-input-focus"
                      value=""
                      onChange={(event) =>
                        setEditingProject((current) => ({
                          ...current,
                          format: event.target.value,
                        }))
                      }
                    >
                      <option value="" disabled>
                        Choose a format preset...
                      </option>
                      {formatPresets.map((format) => (
                        <option key={format} value={format}>
                          {format}
                        </option>
                      ))}
                    </select>
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
                    <span
                      className={`asset-upload-control ${
                        uploadStatus.image.phase === 'done' ? 'asset-upload-control-done' : ''
                      }`}
                    >
                      {uploadStatus.image.phase === 'uploading' && 'Uploading image...'}
                      {uploadStatus.image.phase === 'done' && uploadStatus.image.message}
                      {uploadStatus.image.phase === 'error' && uploadStatus.image.message}
                      {uploadStatus.image.phase === 'idle' && 'Choose image file'}
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,.gif"
                        onChange={(event) => selectAsset(event, 'image')}
                      />
                    </span>
                    {uploadStatus.image.phase !== 'idle' && (
                      <span className="asset-upload-progress">
                        <span style={{ width: `${uploadStatus.image.progress}%` }} />
                      </span>
                    )}
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
                    <span
                      className={`asset-upload-control ${
                        uploadStatus.modelUrl.phase === 'done' ? 'asset-upload-control-done' : ''
                      }`}
                    >
                      {uploadStatus.modelUrl.phase === 'uploading' && 'Uploading model...'}
                      {uploadStatus.modelUrl.phase === 'processing' && uploadStatus.modelUrl.message}
                      {uploadStatus.modelUrl.phase === 'done' && uploadStatus.modelUrl.message}
                      {uploadStatus.modelUrl.phase === 'error' && uploadStatus.modelUrl.message}
                      {uploadStatus.modelUrl.phase === 'idle' && 'Choose model file'}
                      <input
                        type="file"
                        accept=".glb,.gltf,.fbx,.obj,.zip"
                        onChange={(event) => selectAsset(event, 'modelUrl')}
                      />
                    </span>
                    {uploadStatus.modelUrl.phase !== 'idle' && (
                      <span className="asset-upload-progress">
                        <span style={{ width: `${uploadStatus.modelUrl.progress}%` }} />
                      </span>
                    )}
                  </label>
                  <label className="field-label">
                    Model Size
                    <select
                      className="field-input field-input-focus"
                      value=""
                      onChange={(event) =>
                        setEditingProject((current) => ({
                          ...current,
                          modelSize: event.target.value,
                        }))
                      }
                    >
                      <option value="" disabled>
                        Choose a size preset...
                      </option>
                      {modelSizePresets.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
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
                    <select
                      className="field-input field-input-focus"
                      value={editingProject.downloadPolicy || ''}
                      onChange={(event) =>
                        setEditingProject((current) => ({
                          ...current,
                          downloadPolicy: event.target.value,
                        }))
                      }
                    >
                      {downloadPolicyPresets.map((policy) => (
                        <option key={policy.value} value={policy.value}>
                          {policy.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="field-label">
                  Stack
                  <select
                    className="field-input field-input-focus"
                    value=""
                    onChange={(event) => {
                      addStackKeyword(event.target.value)
                      event.target.value = ''
                    }}
                  >
                    <option value="" disabled>
                      Add a keyword...
                    </option>
                    {stackKeywordPresets.map((keyword) => (
                      <option key={keyword} value={keyword}>
                        {keyword}
                      </option>
                    ))}
                  </select>
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
                  <select
                    className="field-input field-input-focus"
                    value=""
                    onChange={(event) => {
                      addViewerFeature(event.target.value)
                      event.target.value = ''
                    }}
                  >
                    <option value="" disabled>
                      Add a viewer feature...
                    </option>
                    {viewerFeaturePresets.map((feature) => (
                      <option key={feature} value={feature}>
                        {feature}
                      </option>
                    ))}
                  </select>
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
