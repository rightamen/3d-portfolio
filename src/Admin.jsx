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
import { assetCategoryProfiles, getAssetCategoryProfile } from './lib/assetCategories'

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

const modelFileExtensions = new Set(['.glb', '.gltf', '.fbx', '.obj'])
const materialFileExtensions = new Set(['.mtl'])
const textureFileExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const mtlTextureReferenceExtensions = new Set([
  ...textureFileExtensions,
  '.bmp',
  '.psd',
  '.tga',
  '.tif',
  '.tiff',
])

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

const assetCategoryPresets = assetCategoryProfiles.map((category) => ({
  label: category.label,
  value: category.value,
}))

const projectPresets = [
  {
    key: 'game-prop',
    label: 'Next-Gen Prop',
    values: {
      assetCategory: 'next-gen-prop',
      downloadPolicy: downloadPolicyPresets[2].value,
      format: 'Realtime 3D asset',
      modelSize: 'Auto-detected after upload',
      stackText: '3ds Max, FBX, PBR, GLB',
      summary: 'A production-ready realtime prop with optimized topology, PBR materials, and asset presentation.',
      viewerFeaturesText: 'Orbit, Zoom, Pan, Texture view, Clay view, Wireframe',
      workflow:
        'Modeled and UV prepared for a realtime workflow, then converted into a compressed model preview with PBR texture maps preserved.',
    },
  },
  {
    key: 'environment',
    label: 'Next-Gen Scene',
    values: {
      assetCategory: 'next-gen-scene',
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
    label: 'Next-Gen Character',
    values: {
      assetCategory: 'next-gen-character',
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
    key: 'hand-painted-character',
    label: 'Hand-Painted Character',
    values: {
      assetCategory: 'hand-painted-character',
      downloadPolicy: downloadPolicyPresets[1].value,
      format: 'Hand-painted character',
      modelSize: 'Auto-detected after upload',
      stackText: '3ds Max, OBJ, Hand-Painted, GLB',
      summary: 'A hand-painted asset preview focused on clean texture color, silhouette, and readable shape language.',
      viewerFeaturesText: 'Orbit, Zoom, Pan, Texture view, Clay view',
      workflow:
        'Built with painted texture presentation in mind, then converted into a model preview that preserves the authored color map.',
    },
  },
  {
    key: 'hand-painted-scene',
    label: 'Hand-Painted Scene',
    values: {
      assetCategory: 'hand-painted-scene',
      downloadPolicy: downloadPolicyPresets[1].value,
      format: 'Hand-painted scene',
      modelSize: 'Auto-detected after upload',
      stackText: '3ds Max, OBJ, Hand-Painted, Environment, GLB',
      summary:
        'A hand-painted environment or scene study focused on color mood, readable composition, and stylized atmosphere.',
      viewerFeaturesText: 'Orbit, Zoom, Pan, Texture view, Clay view',
      workflow:
        'Built with painted texture and composition-first presentation in mind, then converted into a model preview that preserves authored color and atmosphere.',
    },
  },
  {
    key: 'case-study',
    label: 'Case Study',
    values: {
      assetCategory: 'generic',
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
  'Hand-painted scene',
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
  assetCategory: 'generic',
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

const normalizeAssetName = (value) =>
  decodeURIComponent(String(value || ''))
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .toLowerCase()

const getAssetBasename = (value) => normalizeAssetName(value).split('/').pop()

const getAssetStem = (value) => getAssetBasename(value).replace(/\.[^.]+$/, '')

const createLocalAssetManager = (files) => {
  const objectUrls = []
  const urlByName = new Map()
  const textureAssets = []

  files.forEach((file) => {
    const url = URL.createObjectURL(file)
    const filePath = file.webkitRelativePath || file.name
    const extension = getFileExtension(file.name)
    const basename = getAssetBasename(file.name)

    objectUrls.push(url)
    urlByName.set(normalizeAssetName(filePath), url)
    urlByName.set(normalizeAssetName(file.name), url)
    urlByName.set(basename, url)

    if (textureFileExtensions.has(extension)) {
      textureAssets.push({
        basename,
        stem: getAssetStem(file.name),
        url,
      })
    }
  })

  const findTextureFallback = (assetUrl) => {
    if (!mtlTextureReferenceExtensions.has(getFileExtension(assetUrl))) return null

    const requestedStem = getAssetStem(assetUrl)
    const directMatch = textureAssets.find(
      (asset) => asset.stem === requestedStem || asset.stem.startsWith(`${requestedStem}_`),
    )
    if (directMatch) return directMatch

    const looseMatch = textureAssets.find(
      (asset) => requestedStem.includes(asset.stem) || asset.stem.includes(requestedStem),
    )
    if (looseMatch) return looseMatch

    return textureAssets.length === 1 ? textureAssets[0] : null
  }

  return {
    resolveTextureReference(url) {
      const normalized = normalizeAssetName(url)
      const basename = getAssetBasename(url)
      const exactUrl = urlByName.get(normalized) || urlByName.get(basename)

      if (exactUrl) {
        return { basename, replaced: false, url: exactUrl }
      }

      const fallback = findTextureFallback(url)
      if (!fallback) return null

      return { ...fallback, replaced: true }
    },
    resolve(url) {
      return this.resolveTextureReference(url)?.url || url
    },
    has(url) {
      return Boolean(this.resolveTextureReference(url))
    },
    revoke() {
      objectUrls.forEach((url) => URL.revokeObjectURL(url))
    },
  }
}

const getMtlTextureReferences = (mtlText) =>
  mtlText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(map_|bump|disp|decal|refl)\S*\s+/i.test(line))
    .map((line) => {
      const parts = line.split(/\s+/)
      const candidates = []

      for (let index = 1; index < parts.length; index += 1) {
        const candidate = parts.slice(index).join(' ')
        if (mtlTextureReferenceExtensions.has(getFileExtension(candidate))) {
          candidates.push(candidate)
        }
      }

      return candidates
    })
    .filter((candidates) => candidates.length > 0)

const assertSelectedMtlTextures = (mtlText, assetManager) => {
  const missing = getMtlTextureReferences(mtlText)
    .filter((candidates) => !candidates.some((textureName) => assetManager.has(textureName)))
    .map((candidates) => candidates.at(-1))

  if (missing.length > 0) {
    throw new Error(`Missing texture files: ${missing.slice(0, 3).join(', ')}`)
  }
}

const rewriteMtlTextureReferences = (mtlText, assetManager) =>
  mtlText
    .split(/\r?\n/)
    .map((line) => {
      if (!/^\s*(map_|bump|disp|decal|refl)\S*\s+/i.test(line)) return line

      const trimmed = line.trim()
      const parts = trimmed.split(/\s+/)

      for (let index = 1; index < parts.length; index += 1) {
        const candidate = parts.slice(index).join(' ')
        if (!mtlTextureReferenceExtensions.has(getFileExtension(candidate))) continue

        const resolved = assetManager.resolveTextureReference(candidate)
        if (!resolved?.replaced) return line

        return line.replace(candidate, resolved.basename)
      }

      return line
    })
    .join('\n')

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

const createLoadingManagerWaiter = (loadingManager) => {
  let finish
  const promise = new Promise((resolve, reject) => {
    let settled = false

    finish = () => {
      if (settled) return
      settled = true
      resolve()
    }

    loadingManager.onLoad = finish
    loadingManager.onError = (url) => {
      if (settled) return
      settled = true
      reject(new Error(`Texture failed to load: ${getAssetBasename(url) || url}`))
    }
  })

  return () => {
    if (loadingManager.itemsTotal === loadingManager.itemsLoaded) finish()
    return promise
  }
}

const waitForTextureImage = (texture, timeoutMs = 8000) =>
  new Promise((resolve, reject) => {
    const startedAt = performance.now()

    const check = () => {
      const image = texture?.image
      if (image) {
        resolve(image)
        return
      }

      if (performance.now() - startedAt > timeoutMs) {
        reject(new Error('Texture image was not loaded before GLB export.'))
        return
      }

      requestAnimationFrame(check)
    }

    check()
  })

const waitForTexture = async (texture) => {
  const image = await waitForTextureImage(texture)

  if (image.complete || image.width > 0 || image.data) {
    if (image.decode) {
      await image.decode().catch(() => {})
    }
    return
  }

  if (!image.addEventListener) return

  await new Promise((resolve, reject) => {
    image.addEventListener('load', resolve, { once: true })
    image.addEventListener('error', () => reject(new Error('A texture image failed to load.')), {
      once: true,
    })
  })

  if (image.decode) {
    await image.decode().catch(() => {})
  }
}

const normalizeTextureForGlbExport = (texture) => {
  const image = texture?.image
  if (!image || image.data || image instanceof HTMLCanvasElement) {
    return
  }

  const width = image.naturalWidth || image.videoWidth || image.width
  const height = image.naturalHeight || image.videoHeight || image.height

  if (!width || !height) {
    throw new Error('Texture image loaded without readable dimensions.')
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Unable to prepare texture canvas for GLB export.')
  }

  try {
    context.drawImage(image, 0, 0, width, height)
  } catch {
    throw new Error('Unable to read selected texture image for GLB export.')
  }

  texture.image = canvas
  if (texture.source) {
    texture.source.data = canvas
  }
  texture.needsUpdate = true
}

const collectObjectTextures = (object) => {
  const textures = new Set()
  const textureKeys = [
    'map',
    'normalMap',
    'roughnessMap',
    'metalnessMap',
    'aoMap',
    'alphaMap',
    'emissiveMap',
    'bumpMap',
    'specularMap',
  ]

  object.traverse((item) => {
    const materials = Array.isArray(item.material) ? item.material : [item.material]
    materials.filter(Boolean).forEach((material) => {
      textureKeys.forEach((key) => {
        if (material[key]) textures.add(material[key])
      })
    })
  })

  return textures
}

const waitForObjectTextures = async (object) => {
  const textures = collectObjectTextures(object)

  await Promise.all(Array.from(textures).map(waitForTexture))
  textures.forEach(normalizeTextureForGlbExport)
  return textures.size
}

const findPrimaryModelFile = (files) =>
  files.find((file) => ['.fbx', '.obj'].includes(getFileExtension(file.name))) ||
  files.find((file) => modelFileExtensions.has(getFileExtension(file.name))) ||
  files[0]

const convertModelInBrowser = async (files) => {
  const fileList = Array.isArray(files) ? files : [files]
  const file = findPrimaryModelFile(fileList)
  const extension = getFileExtension(file.name)
  if (!['.fbx', '.obj'].includes(extension)) {
    return {
      converted: false,
      file,
      originalExtension: getExtension(file.name),
    }
  }

  const baseName = file.name.replace(/\.[^.]+$/, '')
  const [{ GLTFExporter }, { FBXLoader }, { OBJLoader }, { MTLLoader }, { LoadingManager }] =
    await Promise.all([
    import('three/examples/jsm/exporters/GLTFExporter.js'),
    import('three/examples/jsm/loaders/FBXLoader.js'),
    import('three/examples/jsm/loaders/OBJLoader.js'),
    import('three/examples/jsm/loaders/MTLLoader.js'),
    import('three'),
  ])
  const assetManager = createLocalAssetManager(fileList)
  const loadingManager = new LoadingManager()
  loadingManager.setURLModifier((url) => assetManager.resolve(url))
  const waitForAssetLoads = createLoadingManagerWaiter(loadingManager)

  let object
  try {
    if (extension === '.fbx') {
      object = new FBXLoader(loadingManager).parse(await file.arrayBuffer(), '')
    } else {
      const objLoader = new OBJLoader(loadingManager)
      const materialFile = fileList.find((item) => materialFileExtensions.has(getFileExtension(item.name)))

      if (materialFile) {
        const mtlText = await materialFile.text()
        const rewrittenMtlText = rewriteMtlTextureReferences(mtlText, assetManager)
        assertSelectedMtlTextures(rewrittenMtlText, assetManager)
        const materials = new MTLLoader(loadingManager).parse(rewrittenMtlText, '')
        materials.preload()
        objLoader.setMaterials(materials)
      }

      object = objLoader.parse(await file.text())
    }

    await waitForAssetLoads()
    const embeddedTextureCount = await waitForObjectTextures(object)
    const glbBuffer = await exportGlb(object, GLTFExporter)

    return {
      converted: true,
      file: new File([glbBuffer], `${baseName}.glb`, { type: 'model/gltf-binary' }),
      originalExtension: getExtension(file.name),
      textureCount: Math.max(
        embeddedTextureCount,
        fileList.filter((item) => textureFileExtensions.has(getFileExtension(item.name))).length,
      ),
    }
  } finally {
    assetManager.revoke()
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

  const uploadAsset = async (files, targetField) => {
    const selectedFiles = Array.isArray(files) ? files.filter(Boolean) : [files].filter(Boolean)
    if (selectedFiles.length === 0) return

    const file = targetField === 'modelUrl' ? findPrimaryModelFile(selectedFiles) : selectedFiles[0]

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
          localConversion = await convertModelInBrowser(selectedFiles)
          uploadFile = localConversion.file
        } catch (error) {
          throw new Error(error.message || 'Local model conversion failed.')
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
        targetField === 'modelUrl' && localConversion.converted && localConversion.textureCount > 0
          ? 'Converted with textures and uploaded'
          : targetField === 'modelUrl' && localConversion.converted
            ? 'Converted locally and uploaded'
          : targetField === 'modelUrl' && conversionStatus === 'converted'
            ? 'Uploaded and converted to GLB'
          : targetField === 'modelUrl' && conversionStatus === 'skipped'
            ? 'Uploaded, converter unavailable'
            : targetField === 'modelUrl' && conversionStatus === 'failed'
              ? 'Uploaded, conversion failed'
              : 'Uploaded successfully'
      setUploadStatus((current) => ({
        ...current,
        [targetField]: { phase: 'done', progress: 100, message: uploadMessage },
      }))
    } catch (error) {
      setUploadStatus((current) => ({
        ...current,
        [targetField]: {
          phase: 'error',
          progress: 0,
          message:
            targetField === 'modelUrl'
              ? `Conversion failed: ${error.message || 'check OBJ, MTL, and texture files.'}`
              : error.message || 'Upload failed. Check size and format.',
        },
      }))
    }
  }

  const selectAsset = async (event, targetField) => {
    await uploadAsset(Array.from(event.target.files || []), targetField)
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
                <article
                  key={project.slug}
                  className="admin-row"
                  style={{ '--category-accent': getAssetCategoryProfile(project).accent }}
                >
                  <div>
                    <div className="admin-row-title">
                      <strong>{project.title}</strong>
                      <span>{getAssetCategoryProfile(project).label}</span>
                    </div>
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
                  Asset Category
                  <select
                    className="field-input field-input-focus"
                    value={getAssetCategoryProfile(editingProject).value}
                    onChange={(event) =>
                      setEditingProject((current) => ({
                        ...current,
                        assetCategory: event.target.value,
                      }))
                    }
                  >
                    {assetCategoryPresets.map((category) => (
                      <option key={category.value} value={category.value}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                  <span
                    className="asset-editor-note"
                    style={{
                      '--category-accent': getAssetCategoryProfile({
                        assetCategory: editingProject.assetCategory,
                      }).accent,
                    }}
                  >
                    <strong>
                      {
                        getAssetCategoryProfile({
                          assetCategory: editingProject.assetCategory,
                        }).label
                      }
                    </strong>
                    <span>
                      {
                        getAssetCategoryProfile({
                          assetCategory: editingProject.assetCategory,
                        }).description
                      }
                    </span>
                  </span>
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
                      {uploadStatus.modelUrl.phase === 'idle' && 'Choose model and texture files'}
                      <input
                        type="file"
                        accept=".glb,.gltf,.fbx,.obj,.mtl,.jpg,.jpeg,.png,.webp"
                        multiple
                        onChange={(event) => selectAsset(event, 'modelUrl')}
                      />
                    </span>
                    {uploadStatus.modelUrl.phase !== 'idle' && (
                      <span className="asset-upload-progress">
                        <span style={{ width: `${uploadStatus.modelUrl.progress}%` }} />
                      </span>
                    )}
                    <span className="field-hint">
                      Select OBJ, MTL, and web textures together. PSD/TGA references can use a selected
                      PNG/JPG/WebP replacement.
                    </span>
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
