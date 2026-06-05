import cors from 'cors'
import express from 'express'
import multer from 'multer'
import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createContactMessagesStore } from './contactMessagesStore.js'
import { experience, profile, projects as staticProjects, skills } from './content.js'
import { createDownloadRequestsStore } from './downloadRequestsStore.js'
import { createInteractionsStore } from './interactionsStore.js'
import { convertModelToGlb } from './modelConverter.js'
import { createPostgresStores } from './postgresStores.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const dataDir = path.join(rootDir, 'data')
const distDir = path.join(rootDir, 'dist')
const uploadRoot = path.join(rootDir, 'public', 'uploads')
const modelConverterScript = path.join(rootDir, 'scripts', 'convert-model-to-glb.py')
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])
const imageUploadLimit = 16 * 1024 * 1024
const modelExtensions = new Set(['.glb', '.gltf', '.fbx', '.obj', '.zip'])
const visitorAccessLevels = ['guest', 'member', 'approved']
const accessRank = new Map(visitorAccessLevels.map((level, index) => [level, index]))
const assetCategories = new Set([
  'generic',
  'next-gen-prop',
  'next-gen-character',
  'next-gen-scene',
  'hand-painted-character',
  'hand-painted-scene',
])
const legacyAssetCategoryAliases = new Map([['hand-painted', 'hand-painted-character']])
const stores = process.env.DATABASE_URL
  ? await createPostgresStores(process.env.DATABASE_URL)
  : {
      adminStore: null,
      authStore: null,
      contactMessagesStore: createContactMessagesStore(dataDir),
      downloadRequestsStore: createDownloadRequestsStore(dataDir),
      interactionsStore: createInteractionsStore(dataDir),
      projectStore: {
        getProject: async (projects, slug) =>
          projects.find((project) => project.slug === slug) || null,
        listProjects: async (projects) => projects.map((project) => ({ ...project, isPublic: true })),
      },
    }

const {
  adminStore,
  authStore,
  contactMessagesStore,
  downloadRequestsStore,
  interactionsStore,
  projectStore,
} = stores

const app = express()
const port = process.env.PORT || 4173

app.use(cors({ origin: process.env.CORS_ORIGIN || true }))
app.use(express.json({ limit: '96kb' }))
app.use('/uploads', express.static(path.join(rootDir, 'public', 'uploads')))

const upload = multer({
  limits: { fileSize: 120 * 1024 * 1024 },
  storage: multer.diskStorage({
    destination: (_request, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase()
      const folder = imageExtensions.has(extension) ? 'images' : 'models'
      const destination = path.join(uploadRoot, folder)

      mkdir(destination, { recursive: true })
        .then(() => callback(null, destination))
        .catch(callback)
    },
    filename: (_request, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase()
      const baseName = path
        .basename(file.originalname, extension)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 60)
      callback(null, `${Date.now()}-${baseName || 'asset'}${extension}`)
    },
  }),
  fileFilter: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase()
    const allowed = imageExtensions.has(extension) || modelExtensions.has(extension)

    callback(allowed ? null : new Error('Unsupported file type.'), allowed)
  },
})

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const hashToken = (token) => createHash('sha256').update(token).digest('hex')

const hashPassword = (password) => {
  const salt = randomBytes(16).toString('hex')
  const hash = pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex')
  return `pbkdf2_sha256$120000$${salt}$${hash}`
}

const verifyPassword = (password, storedHash = '') => {
  const [algorithm, iterationsRaw, salt, expected] = storedHash.split('$')
  if (algorithm !== 'pbkdf2_sha256' || !iterationsRaw || !salt || !expected) return false

  const actual = pbkdf2Sync(
    password,
    salt,
    Number(iterationsRaw),
    Buffer.from(expected, 'hex').length,
    'sha256',
  )
  const expectedBuffer = Buffer.from(expected, 'hex')
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer)
}

const createSession = async (user) => {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
  await authStore.createSession({
    expiresAt,
    tokenHash: hashToken(token),
    userId: user.id,
  })

  return {
    expiresAt: expiresAt.toISOString(),
    token,
  }
}

const normalizeAccessLevel = (value, fallback = 'member') => {
  const normalized = String(value ?? '').trim()
  return visitorAccessLevels.includes(normalized) ? normalized : fallback
}

const getPolicyAccessLevel = (policy = '') => {
  const normalized = policy.toLowerCase()
  if (/open|免登录|自由/.test(normalized)) return 'guest'
  if (/member|login|登录|ログイン|メンバー/.test(normalized)) return 'member'
  return 'approved'
}

const canAccess = (user, requiredAccessLevel) =>
  (accessRank.get(user?.accessLevel || 'guest') ?? 0) >=
  (accessRank.get(requiredAccessLevel) ?? accessRank.get('approved'))

const getAuthToken = (request) => request.get('Authorization')?.replace(/^Bearer\s+/i, '').trim()

const getOptionalUser = async (request) => {
  if (!authStore) return null

  const token = getAuthToken(request)
  if (!token) return null

  return authStore.getSessionUser(hashToken(token))
}

const requireAuthStore = (_request, response, next) => {
  if (!authStore) {
    return response.status(503).json({
      error: 'Visitor accounts are not configured.',
    })
  }

  return next()
}

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, service: 'mrright-portfolio' })
})

app.get('/api/auth/me', async (request, response) => {
  const user = await getOptionalUser(request)
  response.json({ user })
})

app.post('/api/auth/register', requireAuthStore, async (request, response) => {
  const displayName = String(request.body?.displayName ?? '').trim().slice(0, 80)
  const email = String(request.body?.email ?? '').trim().toLowerCase().slice(0, 180)
  const password = String(request.body?.password ?? '')

  if (!displayName || !emailPattern.test(email) || password.length < 8) {
    return response.status(400).json({
      error: 'Please provide a display name, valid email, and password with at least 8 characters.',
    })
  }

  const existingUser = await authStore.getUserByEmail(email)
  if (existingUser) {
    return response.status(409).json({
      error: 'This email is already registered.',
    })
  }

  const user = await authStore.createUser({
    accessLevel: 'member',
    displayName,
    email,
    id: createId(),
    passwordHash: hashPassword(password),
  })
  const session = await createSession(user)

  return response.status(201).json({ session, user })
})

app.post('/api/auth/login', requireAuthStore, async (request, response) => {
  const email = String(request.body?.email ?? '').trim().toLowerCase().slice(0, 180)
  const password = String(request.body?.password ?? '')
  const user = await authStore.getUserByEmail(email)

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return response.status(401).json({
      error: 'Email or password is incorrect.',
    })
  }

  const session = await createSession(user)
  const publicUser = {
    accessLevel: user.accessLevel,
    createdAt: user.createdAt,
    displayName: user.displayName,
    email: user.email,
    id: user.id,
  }

  return response.json({ session, user: publicUser })
})

app.post('/api/auth/logout', async (request, response) => {
  const token = getAuthToken(request)
  if (token && authStore) await authStore.deleteSession(hashToken(token))
  response.json({ ok: true })
})

const requireAdmin = (request, response, next) => {
  const token = request.get('Authorization')?.replace(/^Bearer\s+/i, '')

  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return response.status(401).json({
      error: 'Admin authorization is required.',
    })
  }

  if (!adminStore) {
    return response.status(503).json({
      error: 'Admin data store is not configured.',
    })
  }

  return next()
}

app.get('/api/profile', (_request, response) => {
  response.json({ profile, skills })
})

app.get('/api/projects', (_request, response) => {
  projectStore
    .listProjects(staticProjects)
    .then((projects) => response.json({ projects }))
    .catch((error) => {
      console.error(error)
      response.status(500).json({ error: 'Could not load projects.' })
    })
})

app.get('/api/projects/:slug', async (request, response) => {
  const project = await projectStore.getProject(staticProjects, request.params.slug)

  if (!project) {
    return response.status(404).json({
      error: 'Project not found.',
    })
  }

  return response.json({ project })
})

app.get('/api/projects/:slug/interactions', async (request, response) => {
  const project = await projectStore.getProject(staticProjects, request.params.slug)

  if (!project) {
    return response.status(404).json({
      error: 'Project not found.',
    })
  }

  const state = await interactionsStore.getProjectState(project.slug)
  return response.json({
    comments: state.comments,
    likeCount: state.likes.length,
  })
})

app.post('/api/projects/:slug/like', async (request, response) => {
  const project = await projectStore.getProject(staticProjects, request.params.slug)
  const visitorId = String(request.body?.visitorId ?? '').trim().slice(0, 120)
  const user = await getOptionalUser(request)

  if (!project) {
    return response.status(404).json({
      error: 'Project not found.',
    })
  }

  if (!visitorId) {
    return response.status(400).json({
      error: 'Visitor id is required.',
    })
  }

  const result = await interactionsStore.toggleLike(project.slug, visitorId, user?.id)
  return response.json(result)
})

app.post('/api/projects/:slug/comments', async (request, response) => {
  const project = await projectStore.getProject(staticProjects, request.params.slug)
  const user = await getOptionalUser(request)
  const author = String(request.body?.author || user?.displayName || '').trim().slice(0, 80)
  const message = String(request.body?.message ?? '').trim().slice(0, 1000)

  if (!project) {
    return response.status(404).json({
      error: 'Project not found.',
    })
  }

  if (!author || !message) {
    return response.status(400).json({
      error: 'Author and message are required.',
    })
  }

  const comment = await interactionsStore.addComment(project.slug, {
    author,
    message,
    userId: user?.id,
  })
  return response.status(201).json({ comment })
})

app.post('/api/projects/:slug/download-requests', async (request, response) => {
  const project = await projectStore.getProject(staticProjects, request.params.slug)
  const user = await getOptionalUser(request)
  const name = String(request.body?.name || user?.displayName || '').trim().slice(0, 120)
  const email = String(request.body?.email || user?.email || '').trim().slice(0, 180)
  const purpose = String(request.body?.purpose ?? '').trim().slice(0, 1200)
  const requiredAccessLevel = getPolicyAccessLevel(project.downloadPolicy || project.downloadPolicyEn)
  const currentAccessLevel = user?.accessLevel || 'guest'

  if (!project) {
    return response.status(404).json({
      error: 'Project not found.',
    })
  }

  if (!name || !emailPattern.test(email) || !purpose) {
    return response.status(400).json({
      error: 'Please provide a valid name, email, and usage purpose.',
    })
  }

  const downloadRequest = await downloadRequestsStore.addRequest({
    accessGranted: canAccess(user, requiredAccessLevel),
    projectSlug: project.slug,
    projectTitle: project.title,
    name,
    email,
    purpose,
    requiredAccessLevel,
    userId: user?.id,
    visitorAccessLevel: currentAccessLevel,
    ip: request.ip,
  })

  return response.status(201).json({
    ok: true,
    request: {
      id: downloadRequest.id,
      status: downloadRequest.status,
      createdAt: downloadRequest.createdAt,
    },
    access: {
      allowed: canAccess(user, requiredAccessLevel),
      current: currentAccessLevel,
      required: requiredAccessLevel,
    },
  })
})

app.get('/api/experience', (_request, response) => {
  response.json({ experience })
})

app.post('/api/contact', async (request, response) => {
  const { name, email, message } = request.body ?? {}
  const normalized = {
    name: String(name ?? '').trim().slice(0, 120),
    email: String(email ?? '').trim().slice(0, 180),
    message: String(message ?? '').trim().slice(0, 2000),
    createdAt: new Date().toISOString(),
  }

  if (!normalized.name || !normalized.email || !normalized.message) {
    return response.status(400).json({
      ok: false,
      error: 'Please provide a valid name, email, and message.',
    })
  }

  await contactMessagesStore.addMessage(normalized)

  return response.status(201).json({ ok: true })
})

app.get('/api/admin/summary', requireAdmin, async (_request, response) => {
  response.json({ summary: await adminStore.getSummary() })
})

app.get('/api/admin/comments', requireAdmin, async (_request, response) => {
  response.json({ comments: await adminStore.listComments() })
})

app.get('/api/admin/likes', requireAdmin, async (_request, response) => {
  response.json({ likes: await adminStore.listLikes() })
})

app.get('/api/admin/contact-messages', requireAdmin, async (_request, response) => {
  response.json({ messages: await adminStore.listContactMessages() })
})

app.get('/api/admin/download-requests', requireAdmin, async (_request, response) => {
  response.json({ requests: await adminStore.listDownloadRequests() })
})

app.get('/api/admin/projects', requireAdmin, async (_request, response) => {
  response.json({ projects: await adminStore.listProjects(staticProjects) })
})

app.get('/api/admin/visitors', requireAdmin, async (_request, response) => {
  response.json({ visitors: await adminStore.listVisitors() })
})

app.patch('/api/admin/visitors/:id', requireAdmin, async (request, response) => {
  const accessLevel = normalizeAccessLevel(request.body?.accessLevel, '')

  if (!accessLevel) {
    return response.status(400).json({
      error: 'Invalid visitor access level.',
    })
  }

  const visitor = await adminStore.updateVisitorAccessLevel(request.params.id, accessLevel)

  if (!visitor) {
    return response.status(404).json({
      error: 'Visitor not found.',
    })
  }

  return response.json({ visitor })
})

app.post('/api/admin/uploads', requireAdmin, upload.single('file'), async (request, response) => {
  if (!request.file) {
    return response.status(400).json({
      error: 'Upload file is required.',
    })
  }

  const extension = path.extname(request.file.originalname).toLowerCase()
  const type = imageExtensions.has(extension) ? 'image' : 'model'

  if (type === 'image' && request.file.size > imageUploadLimit) {
    unlink(request.file.path).catch((error) => console.error(error))

    return response.status(400).json({
      error: 'Image uploads must be 16 MB or smaller.',
    })
  }

  const folder = type === 'image' ? 'images' : 'models'
  let conversion = {
    status: type === 'model' ? 'not-needed' : 'not-applicable',
    message: type === 'model' ? 'Model is already web-ready.' : 'Images do not need conversion.',
  }
  let url = `/uploads/${folder}/${request.file.filename}`

  if (type === 'model') {
    const originalExtension = path.extname(request.file.filename).toLowerCase()
    const outputFilename = request.file.filename.replace(originalExtension, '.glb')
    const outputPath = path.join(uploadRoot, 'models', outputFilename)

    conversion = await convertModelToGlb({
      inputPath: request.file.path,
      outputPath,
      scriptPath: modelConverterScript,
    })

    if (conversion.status === 'converted') {
      url = `/uploads/models/${outputFilename}`
      conversion.url = url
    }
  }

  return response.status(201).json({
    file: {
      name: request.file.originalname,
      size: request.file.size,
      type,
      url,
    },
    conversion,
  })
})

const normalizeProjectPayload = (body) => {
  const assetCategory = String(body?.assetCategory ?? '').trim()
  const normalizedAssetCategory = legacyAssetCategoryAliases.get(assetCategory) || assetCategory
  const localizedText = (field, maxLength) =>
    Object.fromEntries(
      ['Zh', 'En', 'Ja'].map((suffix) => [
        `${field}${suffix}`,
        String(body?.[`${field}${suffix}`] ?? '').trim().slice(0, maxLength),
      ]),
    )
  const normalized = {
    assetCategory: assetCategories.has(normalizedAssetCategory) ? normalizedAssetCategory : 'generic',
    downloadPolicy: String(body?.downloadPolicy ?? '').trim().slice(0, 120),
    format: String(body?.format ?? '').trim().slice(0, 120),
    image: String(body?.image ?? '').trim().slice(0, 500),
    isPublic: body?.isPublic !== false,
    modelSize: String(body?.modelSize ?? '').trim().slice(0, 120),
    modelUrl: String(body?.modelUrl ?? '').trim().slice(0, 500),
    stack: Array.isArray(body?.stack)
      ? body.stack.map((item) => String(item).trim()).filter(Boolean).slice(0, 20)
      : [],
    summary: String(body?.summary ?? '').trim().slice(0, 1000),
    title: String(body?.title ?? '').trim().slice(0, 180),
    viewerFeatures: Array.isArray(body?.viewerFeatures)
      ? body.viewerFeatures.map((item) => String(item).trim()).filter(Boolean).slice(0, 20)
      : [],
    workflow: String(body?.workflow ?? '').trim().slice(0, 2000),
    year: String(body?.year ?? '').trim().slice(0, 20),
    ...localizedText('downloadPolicy', 120),
    ...localizedText('format', 120),
    ...localizedText('modelSize', 120),
    ...localizedText('summary', 1000),
    ...localizedText('title', 180),
    ...localizedText('workflow', 2000),
  }

  return normalized
}

app.post('/api/admin/projects', requireAdmin, async (request, response) => {
  const slug = String(request.body?.slug ?? '').trim().slice(0, 120)
  const normalized = normalizeProjectPayload(request.body)

  if (!slugPattern.test(slug)) {
    return response.status(400).json({
      error: 'Slug must use lowercase letters, numbers, and hyphens.',
    })
  }

  const existingProject = await projectStore.getProject(staticProjects, slug, {
    includeHidden: true,
  })

  if (existingProject) {
    return response.status(409).json({
      error: 'Project slug already exists.',
    })
  }

  if (!normalized.title || !normalized.summary || !normalized.image || !normalized.year) {
    return response.status(400).json({
      error: 'Title, summary, image, and year are required.',
    })
  }

  await adminStore.createProject({ slug, ...normalized })
  const project = await projectStore.getProject(staticProjects, slug, {
    includeHidden: true,
  })

  return response.status(201).json({ project })
})

app.patch('/api/admin/projects/:slug', requireAdmin, async (request, response) => {
  const existingProject = await projectStore.getProject(staticProjects, request.params.slug, {
    includeHidden: true,
  })

  if (!existingProject) {
    return response.status(404).json({
      error: 'Project not found.',
    })
  }

  const normalized = normalizeProjectPayload(request.body)

  if (!normalized.title || !normalized.summary || !normalized.image || !normalized.year) {
    return response.status(400).json({
      error: 'Title, summary, image, and year are required.',
    })
  }

  await adminStore.updateProject(request.params.slug, normalized)
  const project = await projectStore.getProject(staticProjects, request.params.slug, {
    includeHidden: true,
  })

  return response.json({ project })
})

app.delete('/api/admin/projects/:slug', requireAdmin, async (request, response) => {
  const existingProject = await projectStore.getProject(staticProjects, request.params.slug, {
    includeHidden: true,
  })

  if (!existingProject) {
    return response.status(404).json({
      error: 'Project not found.',
    })
  }

  const deleted = await adminStore.deleteProject(request.params.slug)

  if (!deleted) {
    return response.status(404).json({
      error: 'Project not found.',
    })
  }

  return response.json({ ok: true })
})

app.patch('/api/admin/download-requests/:id', requireAdmin, async (request, response) => {
  const status = String(request.body?.status ?? '').trim()
  const allowedStatuses = new Set(['pending', 'approved', 'rejected'])

  if (!allowedStatuses.has(status)) {
    return response.status(400).json({
      error: 'Invalid request status.',
    })
  }

  const updated = await adminStore.updateDownloadRequestStatus(request.params.id, status)

  if (!updated) {
    return response.status(404).json({
      error: 'Download request not found.',
    })
  }

  return response.json({ request: updated })
})

app.delete('/api/admin/comments/:id', requireAdmin, async (request, response) => {
  const deleted = await adminStore.deleteComment(request.params.id)

  if (!deleted) {
    return response.status(404).json({
      error: 'Comment not found.',
    })
  }

  return response.json({ ok: true })
})

app.delete('/api/admin/contact-messages/:id', requireAdmin, async (request, response) => {
  const deleted = await adminStore.deleteContactMessage(request.params.id)

  if (!deleted) {
    return response.status(404).json({
      error: 'Contact message not found.',
    })
  }

  return response.json({ ok: true })
})

app.delete('/api/admin/download-requests/:id', requireAdmin, async (request, response) => {
  const deleted = await adminStore.deleteDownloadRequest(request.params.id)

  if (!deleted) {
    return response.status(404).json({
      error: 'Download request not found.',
    })
  }

  return response.json({ ok: true })
})

app.use((error, _request, response, next) => {
  if (!error) return next()

  if (error instanceof multer.MulterError || error.message === 'Unsupported file type.') {
    return response.status(400).json({
      error: error.message,
    })
  }

  return next(error)
})

app.use(express.static(distDir))

app.get(/.*/, (_request, response) => {
  response.sendFile(path.join(distDir, 'index.html'))
})

app.listen(port, () => {
  console.log(`Portfolio server listening on http://localhost:${port}`)
})
