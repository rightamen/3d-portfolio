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
import { sendVerificationEmail } from './emailDelivery.js'
import { createInteractionsStore } from './interactionsStore.js'
import { convertModelToGlb } from './modelConverter.js'
import { createPostgresStores } from './postgresStores.js'
import { API_ERROR_CODES, describeUploadError, sendData, sendError, sendPage } from './responses.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const dataDir = path.join(rootDir, 'data')
const distDir = path.join(rootDir, 'dist')
const distIndexPath = path.join(distDir, 'index.html')
const uploadRoot = path.join(rootDir, 'public', 'uploads')
const modelConverterScript = path.join(rootDir, 'scripts', 'convert-model-to-glb.py')
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const handlePattern = /^[a-z0-9_-]{3,30}$/
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])
const profileImageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const imageUploadLimit = 16 * 1024 * 1024
const avatarUploadLimit = 2 * 1024 * 1024
const bannerUploadLimit = 5 * 1024 * 1024
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
const communityTopics = new Set(['general', 'showcase', 'help', 'feedback'])
const legacyAssetCategoryAliases = new Map([['hand-painted', 'hand-painted-character']])
const stores = process.env.DATABASE_URL
  ? await createPostgresStores(process.env.DATABASE_URL)
  : {
      adminStore: null,
      authStore: null,
      communityStore: null,
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
  communityStore,
  contactMessagesStore,
  downloadRequestsStore,
  interactionsStore,
  projectStore,
} = stores

const setNoStoreHeaders = (response) => {
  response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  response.setHeader('Pragma', 'no-cache')
  response.setHeader('Expires', '0')
}

const setStaticCacheHeaders = (response, filePath) => {
  if (path.basename(filePath) === 'index.html') {
    setNoStoreHeaders(response)
    return
  }

  if (filePath.includes(`${path.sep}assets${path.sep}`)) {
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  }
}

const app = express()
const port = process.env.PORT || 4173

app.use(cors({ origin: process.env.CORS_ORIGIN || true }))

// /api/v1 dual mount (docs/API_V1_FREEZE_PLAN.md §3). Requests to /api/v1/*
// are tagged apiVersion='v1' and rewritten to the matching /api/* path so both
// prefixes share the exact same route handlers — no duplicated business logic,
// no drift. The only behavioral difference lives in server/responses.js: v1
// responses use the strict envelope (data/pagination/error only), while legacy
// /api/* keeps the top-level data mirror and code/message compatibility keys
// for the current Web front end. Registered BEFORE express.json so that body
// parse errors on /api/v1/* also surface as strict envelopes. request.originalUrl
// keeps the /api/v1 prefix for logging.
const V1_PREFIX = /^\/api\/v1(?=\/|\?|$)/
app.use((request, _response, next) => {
  if (V1_PREFIX.test(request.url)) {
    request.apiVersion = 'v1'
    request.url = request.url.replace(V1_PREFIX, '/api')
  }
  next()
})

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

    if (allowed) return callback(null, true)

    // Stable code consumed by describeUploadError (server/responses.js) so
    // classification does not depend on this message string.
    const error = new Error('Unsupported file type.')
    error.code = 'INVALID_FILE_TYPE'
    callback(error, false)
  },
})

const createProfileImageUpload = ({ folder, limit }) =>
  multer({
    limits: { fileSize: limit },
    storage: multer.diskStorage({
      destination: (_request, _file, callback) => {
        const destination = path.join(uploadRoot, folder)

        mkdir(destination, { recursive: true })
          .then(() => callback(null, destination))
          .catch(callback)
      },
      filename: (_request, file, callback) => {
        const extension = path.extname(file.originalname).toLowerCase()
        callback(null, `${Date.now()}-${randomBytes(6).toString('hex')}${extension}`)
      },
    }),
    fileFilter: (_request, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase()
      const allowed =
        profileImageExtensions.has(extension) &&
        ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)

      if (allowed) return callback(null, true)

      // Stable code consumed by describeUploadError (server/responses.js) so
      // classification does not depend on this message string.
      const error = new Error('Only JPG, PNG, and WebP images are allowed.')
      error.code = 'INVALID_FILE_TYPE'
      callback(error, false)
    },
  })

const avatarUpload = createProfileImageUpload({ folder: 'avatars', limit: avatarUploadLimit })
const bannerUpload = createProfileImageUpload({ folder: 'banners', limit: bannerUploadLimit })

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const hashToken = (token) => createHash('sha256').update(token).digest('hex')

const createVerificationCode = () => String(randomBytes(4).readUInt32BE() % 1000000).padStart(6, '0')

const hashVerificationCode = (email, code) =>
  createHash('sha256')
    .update(`${email.trim().toLowerCase()}:${String(code).trim()}`)
    .digest('hex')

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

const createEmailVerification = (email) => {
  const code = createVerificationCode()
  const expiresAt = new Date(Date.now() + 1000 * 60 * 20)

  return {
    code,
    expiresAt,
    hash: hashVerificationCode(email, code),
  }
}

const sendVisitorVerification = async ({ code, displayName, email, expiresAt }) => {
  try {
    return await sendVerificationEmail({
      code,
      displayName,
      email,
      expiresAt,
    })
  } catch (error) {
    console.error('Verification email delivery failed:', error.message)
    return { delivery: 'failed', sent: false }
  }
}

const normalizeAccessLevel = (value, fallback = 'member') => {
  const normalized = String(value ?? '').trim()
  return visitorAccessLevels.includes(normalized) ? normalized : fallback
}

const normalizeAssetCategory = (value, fallback = 'generic') => {
  const normalized = String(value ?? '').trim()
  const aliased = legacyAssetCategoryAliases.get(normalized) || normalized
  return assetCategories.has(aliased) ? aliased : fallback
}

const normalizeCommunityTopic = (value, fallback = 'general') => {
  const normalized = String(value ?? '').trim()
  return communityTopics.has(normalized) ? normalized : fallback
}

const normalizeHandle = (value) => String(value ?? '').trim().toLowerCase().replace(/^@+/, '')

const normalizePagination = (query, defaultLimit = 20, maxLimit = 100) => {
  const page = Math.max(1, Number.parseInt(query?.page, 10) || 1)
  const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(query?.limit, 10) || defaultLimit))
  return { limit, offset: (page - 1) * limit, page }
}

const toPaginatedPayload = ({ items, total }, page, limit) => ({
  items,
  pagination: {
    hasNext: page * limit < total,
    hasPrevious: page > 1,
    limit,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    total,
  },
})

const normalizeUrl = (value, maxLength = 300) => {
  const text = String(value ?? '').trim().slice(0, maxLength)
  if (!text) return ''

  try {
    const url = new URL(text)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : ''
  } catch {
    return ''
  }
}

const socialLinkKeys = new Set([
  'wechat',
  'telegram',
  'twitter',
  'github',
  'bilibili',
  'youtube',
  'artstation',
])

const normalizeContactLinks = (value = {}) => {
  const links = value && typeof value === 'object' ? value : {}

  return Object.fromEntries(
    Array.from(socialLinkKeys).map((key) => {
      const item = links[key] && typeof links[key] === 'object' ? links[key] : {}
      const rawValue = String(item.value ?? '').trim().slice(0, 160)
      const url = key === 'wechat' ? '' : normalizeUrl(item.url ?? rawValue, 300)

      return [
        key,
        {
          public: item.public === true,
          url,
          value: key === 'wechat' ? rawValue : url,
        },
      ]
    }),
  )
}

const normalizeAccountProfile = (body) => ({
  activityPublic: body?.activityPublic !== false,
  bio: String(body?.bio ?? '').trim().slice(0, 300),
  contactLinks: normalizeContactLinks(body?.contactLinks),
  contactsPublic: body?.contactsPublic === true,
  displayName: String(body?.displayName ?? '').trim().slice(0, 40),
  handle: normalizeHandle(body?.handle),
  location: String(body?.location ?? '').trim().slice(0, 120),
  profilePublic: body?.profilePublic !== false,
  publicEmail: String(body?.publicEmail ?? '').trim().toLowerCase().slice(0, 180),
  website: normalizeUrl(body?.website, 300),
})

const stripInternalPublicProfile = (profile) => {
  if (!profile) return null
  const publicProfile = { ...profile }
  delete publicProfile.internalId
  return publicProfile
}

const toPublicUploadPayload = (upload) => ({
  assetCategory: upload.assetCategory,
  createdAt: upload.createdAt,
  description: upload.description,
  fileType: upload.fileType,
  fileUrl: upload.fileUrl,
  id: upload.id,
  previewUrl: upload.previewUrl,
  title: upload.title,
})

const toPublicPostPayload = (post) => ({
  createdAt: post.createdAt,
  id: post.id,
  message: post.message,
  title: post.title,
  topic: post.topic,
})

const toPublicCommentPayload = (comment) => ({
  createdAt: comment.createdAt,
  id: comment.id,
  message: comment.message,
  projectSlug: comment.projectSlug,
})

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
    return sendError(
      response,
      API_ERROR_CODES.SERVICE_UNAVAILABLE,
      'Visitor accounts are not configured.',
      503,
    )
  }

  return next()
}

const requireUser = async (request, response, message) => {
  const user = await getOptionalUser(request)
  if (user) return user

  sendError(response, API_ERROR_CODES.AUTH_REQUIRED, message, 401)
  return null
}

app.get('/api/health', (_request, response) => {
  sendData(response, { ok: true, service: 'mrright-portfolio' })
})

app.get('/api/auth/me', async (request, response) => {
  const user = await getOptionalUser(request)
  sendData(response, { user })
})

app.post('/api/auth/register', requireAuthStore, async (request, response) => {
  const displayName = String(request.body?.displayName ?? '').trim().slice(0, 80)
  const email = String(request.body?.email ?? '').trim().toLowerCase().slice(0, 180)
  const password = String(request.body?.password ?? '')

  if (!displayName || !emailPattern.test(email) || password.length < 8) {
    return sendError(
      response,
      API_ERROR_CODES.VALIDATION_ERROR,
      'Please provide a display name, valid email, and password with at least 8 characters.',
      400,
    )
  }

  const existingUser = await authStore.getUserByEmail(email)
  if (existingUser) {
    return sendError(
      response,
      API_ERROR_CODES.EMAIL_ALREADY_REGISTERED,
      'This email is already registered.',
      409,
    )
  }

  const verification = createEmailVerification(email)
  const user = await authStore.createUser({
    accessLevel: 'member',
    displayName,
    email,
    id: createId(),
    passwordHash: hashPassword(password),
    verificationCodeHash: verification.hash,
    verificationExpiresAt: verification.expiresAt,
  })
  const delivery = await sendVisitorVerification({
    code: verification.code,
    displayName,
    email,
    expiresAt: verification.expiresAt,
  })

  return sendData(
    response,
    {
      user,
      verification: {
        delivery: delivery.delivery,
        expiresAt: verification.expiresAt.toISOString(),
        required: true,
        ...(process.env.NODE_ENV === 'production' ? {} : { devCode: verification.code }),
      },
    },
    201,
  )
})

app.post('/api/auth/resend-verification', requireAuthStore, async (request, response) => {
  const email = String(request.body?.email ?? '').trim().toLowerCase().slice(0, 180)

  if (!emailPattern.test(email)) {
    return sendError(response, API_ERROR_CODES.VALIDATION_ERROR, 'Valid email is required.', 400)
  }

  const user = await authStore.getUserByEmail(email)
  if (!user) {
    return sendError(
      response,
      API_ERROR_CODES.EMAIL_NOT_REGISTERED,
      'This email is not registered.',
      404,
    )
  }

  if (user.emailVerified) {
    return sendError(
      response,
      API_ERROR_CODES.EMAIL_ALREADY_VERIFIED,
      'This email is already verified.',
      409,
    )
  }

  const verification = createEmailVerification(email)
  await authStore.setVerificationCode(email, verification.hash, verification.expiresAt)
  const delivery = await sendVisitorVerification({
    code: verification.code,
    displayName: user.displayName,
    email,
    expiresAt: verification.expiresAt,
  })

  return sendData(response, {
    verification: {
      delivery: delivery.delivery,
      expiresAt: verification.expiresAt.toISOString(),
      required: true,
      ...(process.env.NODE_ENV === 'production' ? {} : { devCode: verification.code }),
    },
  })
})

app.post('/api/auth/login', requireAuthStore, async (request, response) => {
  const email = String(request.body?.email ?? '').trim().toLowerCase().slice(0, 180)
  const password = String(request.body?.password ?? '')
  const user = await authStore.getUserByEmail(email)

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return sendError(
      response,
      API_ERROR_CODES.VALIDATION_ERROR,
      'Email or password is incorrect.',
      401,
    )
  }

  if (!user.emailVerified) {
    return sendError(
      response,
      API_ERROR_CODES.EMAIL_NOT_VERIFIED,
      'Please verify your email before signing in.',
      403,
    )
  }

  const session = await createSession(user)
  const publicUser = await authStore.getAccountProfile(user.id)

  return sendData(response, { session, user: publicUser })
})

app.post('/api/auth/verify-email', requireAuthStore, async (request, response) => {
  const email = String(request.body?.email ?? '').trim().toLowerCase().slice(0, 180)
  const code = String(request.body?.code ?? '').trim().slice(0, 12)

  if (!emailPattern.test(email) || !code) {
    return sendError(
      response,
      API_ERROR_CODES.VALIDATION_ERROR,
      'Valid email and verification code are required.',
      400,
    )
  }

  const user = await authStore.verifyEmail(email, hashVerificationCode(email, code))
  if (!user) {
    return sendError(
      response,
      API_ERROR_CODES.VALIDATION_ERROR,
      'Verification code is invalid or expired.',
      400,
    )
  }

  const session = await createSession(user)
  return sendData(response, { session, user })
})

app.post('/api/auth/logout', async (request, response) => {
  const token = getAuthToken(request)
  if (token && authStore) await authStore.deleteSession(hashToken(token))
  sendData(response, { ok: true })
})

const requireAdmin = (request, response, next) => {
  const token = request.get('Authorization')?.replace(/^Bearer\s+/i, '')

  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return sendError(
      response,
      API_ERROR_CODES.ADMIN_AUTH_REQUIRED,
      'Admin authorization is required.',
      401,
    )
  }

  if (!adminStore) {
    return sendError(
      response,
      API_ERROR_CODES.SERVICE_UNAVAILABLE,
      'Admin data store is not configured.',
      503,
    )
  }

  return next()
}

app.get('/api/profile', (_request, response) => {
  sendData(response, { profile, skills })
})

app.get('/api/projects', (_request, response) => {
  projectStore
    .listProjects(staticProjects)
    .then((projects) => sendData(response, { projects }))
    .catch((error) => {
      console.error(error)
      sendError(response, API_ERROR_CODES.SERVICE_UNAVAILABLE, 'Could not load projects.', 503)
    })
})

app.get('/api/projects/:slug', async (request, response) => {
  const project = await projectStore.getProject(staticProjects, request.params.slug)

  if (!project) {
    return sendError(response, API_ERROR_CODES.PROJECT_NOT_FOUND, 'Project not found.', 404)
  }

  return sendData(response, { project })
})

app.get('/api/projects/:slug/interactions', async (request, response) => {
  const project = await projectStore.getProject(staticProjects, request.params.slug)

  if (!project) {
    return sendError(response, API_ERROR_CODES.PROJECT_NOT_FOUND, 'Project not found.', 404)
  }

  const state = await interactionsStore.getProjectState(project.slug)
  return sendData(response, {
    comments: state.comments,
    likeCount: state.likes.length,
  })
})

app.get('/api/community/uploads', async (_request, response) => {
  if (!communityStore) return sendData(response, { uploads: [] })

  sendData(response, { uploads: await communityStore.listApprovedUploads() })
})

app.get('/api/community/posts', async (_request, response) => {
  if (!communityStore) return sendData(response, { posts: [] })

  sendData(response, { posts: await communityStore.listPosts() })
})

app.post('/api/community/posts', requireAuthStore, async (request, response) => {
  if (!communityStore) {
    return sendError(
      response,
      API_ERROR_CODES.SERVICE_UNAVAILABLE,
      'Community posts are not configured.',
      503,
    )
  }

  const user = await getOptionalUser(request)
  if (!user) {
    return sendError(response, API_ERROR_CODES.AUTH_REQUIRED, 'Please sign in before posting.', 401)
  }

  const title = String(request.body?.title ?? '').trim().slice(0, 160)
  const message = String(request.body?.message ?? '').trim().slice(0, 1800)

  if (!title || !message) {
    return sendError(response, API_ERROR_CODES.VALIDATION_ERROR, 'Title and message are required.', 400)
  }

  const post = await communityStore.createPost({
    id: createId(),
    message,
    title,
    topic: normalizeCommunityTopic(request.body?.topic),
    user,
    userId: user.id,
  })

  return sendData(response, { post }, 201)
})

app.get('/api/community/posts/:id', async (request, response) => {
  if (!communityStore) {
    return sendError(
      response,
      API_ERROR_CODES.COMMUNITY_POST_NOT_FOUND,
      'Community post not found.',
      404,
    )
  }

  const post = await communityStore.getPost(request.params.id)
  if (!post) {
    return sendError(
      response,
      API_ERROR_CODES.COMMUNITY_POST_NOT_FOUND,
      'Community post not found.',
      404,
    )
  }

  return sendData(response, { post })
})

app.get('/api/community/posts/:id/comments', async (request, response) => {
  if (!communityStore) return sendData(response, { comments: [] })

  const post = await communityStore.getPost(request.params.id)
  if (!post) {
    return sendError(
      response,
      API_ERROR_CODES.COMMUNITY_POST_NOT_FOUND,
      'Community post not found.',
      404,
    )
  }

  const sort = request.query?.sort === 'top' ? 'top' : 'newest'
  const viewer = await getOptionalUser(request)
  const comments = await communityStore.listComments(post.id, {
    sort,
    viewerId: viewer?.id || null,
  })

  return sendData(response, { comments })
})

app.post('/api/community/posts/:id/comments', requireAuthStore, async (request, response) => {
  if (!communityStore) {
    return sendError(
      response,
      API_ERROR_CODES.SERVICE_UNAVAILABLE,
      'Community comments are not configured.',
      503,
    )
  }

  const user = await getOptionalUser(request)
  if (!user) {
    return sendError(response, API_ERROR_CODES.AUTH_REQUIRED, 'Please sign in before commenting.', 401)
  }

  const post = await communityStore.getPost(request.params.id)
  if (!post) {
    return sendError(
      response,
      API_ERROR_CODES.COMMUNITY_POST_NOT_FOUND,
      'Community post not found.',
      404,
    )
  }

  const message = String(request.body?.message ?? '').trim().slice(0, 1800)
  const parentId = String(request.body?.parentId ?? '').trim().slice(0, 120) || null

  if (!message) {
    return sendError(response, API_ERROR_CODES.VALIDATION_ERROR, 'Comment message is required.', 400)
  }

  if (parentId) {
    const parents = await communityStore.listComments(post.id)
    const parent = parents.find((comment) => comment.id === parentId)
    if (!parent) {
      return sendError(response, API_ERROR_CODES.VALIDATION_ERROR, 'Parent comment not found.', 400)
    }
  }

  const comment = await communityStore.createComment({
    author: user.displayName,
    id: createId(),
    message,
    parentId,
    postId: post.id,
    userId: user.id,
  })

  return sendData(response, { comment }, 201)
})

app.post(
  '/api/community/comments/:id/like',
  requireAuthStore,
  async (request, response) => {
    if (!communityStore) {
      return sendError(
        response,
        API_ERROR_CODES.SERVICE_UNAVAILABLE,
        'Community comments are not configured.',
        503,
      )
    }

    const user = await getOptionalUser(request)
    if (!user) {
      return sendError(response, API_ERROR_CODES.AUTH_REQUIRED, 'Please sign in before liking.', 401)
    }

    const result = await communityStore.toggleCommentLike(request.params.id, user.id)
    if (!result) {
      return sendError(
        response,
        API_ERROR_CODES.COMMUNITY_COMMENT_NOT_FOUND,
        'Community comment not found.',
        404,
      )
    }

    return sendData(response, result)
  },
)

app.delete('/api/community/comments/:id', requireAuthStore, async (request, response) => {
  if (!communityStore) {
    return sendError(
      response,
      API_ERROR_CODES.SERVICE_UNAVAILABLE,
      'Community comments are not configured.',
      503,
    )
  }

  const user = await getOptionalUser(request)
  if (!user) {
    return sendError(
      response,
      API_ERROR_CODES.AUTH_REQUIRED,
      'Please sign in to manage your comments.',
      401,
    )
  }

  const deleted = await communityStore.deleteUserComment(request.params.id, user.id)
  if (!deleted) {
    return sendError(
      response,
      API_ERROR_CODES.COMMUNITY_COMMENT_NOT_FOUND,
      'Community comment not found.',
      404,
    )
  }

  return sendData(response, { ok: true })
})

app.get('/api/account/profile', requireAuthStore, async (request, response) => {
  const user = await requireUser(request, response, 'Please sign in to manage your profile.')
  if (!user) return

  const profile = await authStore.getAccountProfile(user.id)
  return sendData(response, { profile })
})

app.put('/api/account/profile', requireAuthStore, async (request, response) => {
  const user = await getOptionalUser(request)
  if (!user) {
    return sendError(
      response,
      API_ERROR_CODES.AUTH_REQUIRED,
      'Please sign in to manage your profile.',
      401,
    )
  }

  const profile = normalizeAccountProfile(request.body)

  if (profile.displayName.length < 2) {
    return sendError(
      response,
      API_ERROR_CODES.VALIDATION_ERROR,
      'Display name must be 2-40 characters.',
      400,
    )
  }

  if (!handlePattern.test(profile.handle)) {
    return sendError(
      response,
      API_ERROR_CODES.VALIDATION_ERROR,
      'Handle must use 3-30 lowercase letters, numbers, hyphens, or underscores.',
      400,
    )
  }

  if (request.body?.website && !profile.website) {
    return sendError(
      response,
      API_ERROR_CODES.VALIDATION_ERROR,
      'Website must be a valid http or https URL.',
      400,
    )
  }

  if (profile.publicEmail && !emailPattern.test(profile.publicEmail)) {
    return sendError(response, API_ERROR_CODES.VALIDATION_ERROR, 'Public email must be valid.', 400)
  }

  try {
    const updated = await authStore.updateAccountProfile(user.id, profile)
    return sendData(response, { profile: updated })
  } catch (error) {
    if (error.code === '23505') {
      return sendError(response, API_ERROR_CODES.HANDLE_TAKEN, 'This handle is already taken.', 409)
    }
    throw error
  }
})

app.post(
  '/api/account/avatar',
  requireAuthStore,
  avatarUpload.single('file'),
  async (request, response) => {
    const user = await getOptionalUser(request)
    if (!user) {
      if (request.file) unlink(request.file.path).catch((error) => console.error(error))
      return sendError(
        response,
        API_ERROR_CODES.AUTH_REQUIRED,
        'Please sign in to update your avatar.',
        401,
      )
    }

    if (!request.file) {
      return sendError(response, API_ERROR_CODES.VALIDATION_ERROR, 'Avatar file is required.', 400)
    }

    const avatarUrl = `/uploads/avatars/${request.file.filename}`
    const profile = await authStore.updateAccountImage(user.id, 'avatar', avatarUrl)
    return sendData(response, { avatarUrl, profile }, 201)
  },
)

app.post(
  '/api/account/banner',
  requireAuthStore,
  bannerUpload.single('file'),
  async (request, response) => {
    const user = await getOptionalUser(request)
    if (!user) {
      if (request.file) unlink(request.file.path).catch((error) => console.error(error))
      return sendError(
        response,
        API_ERROR_CODES.AUTH_REQUIRED,
        'Please sign in to update your banner.',
        401,
      )
    }

    if (!request.file) {
      return sendError(response, API_ERROR_CODES.VALIDATION_ERROR, 'Banner file is required.', 400)
    }

    const bannerUrl = `/uploads/banners/${request.file.filename}`
    const profile = await authStore.updateAccountImage(user.id, 'banner', bannerUrl)
    return sendData(response, { bannerUrl, profile }, 201)
  },
)

// Public profile lookups deliberately return RESOURCE_FORBIDDEN with a 404 for
// every "cannot show this handle" case — missing store, invalid handle format,
// and non-existent profile all share one response. This is intentional: it
// avoids leaking through the error code whether a given handle actually exists,
// so the endpoints cannot be used to enumerate registered users.
app.get('/api/users/:handle', async (request, response) => {
  if (!authStore) {
    return sendError(response, API_ERROR_CODES.RESOURCE_FORBIDDEN, 'User profile not found.', 404)
  }

  const handle = normalizeHandle(request.params.handle)
  if (!handlePattern.test(handle)) {
    return sendError(response, API_ERROR_CODES.RESOURCE_FORBIDDEN, 'User profile not found.', 404)
  }

  const profile = await authStore.getUserByHandle(handle)
  if (!profile) {
    return sendError(response, API_ERROR_CODES.RESOURCE_FORBIDDEN, 'User profile not found.', 404)
  }
  if (profile.profileAdminDisabled) {
    return sendError(
      response,
      API_ERROR_CODES.PROFILE_ADMIN_DISABLED,
      'This public profile is currently unavailable.',
      403,
    )
  }
  if (!profile.profilePublic) {
    return sendData(response, { profile: { handle, profilePublic: false } })
  }

  return sendData(response, { profile: stripInternalPublicProfile(profile) })
})

app.get('/api/users/:handle/resources', async (request, response) => {
  if (!authStore || !communityStore) return sendData(response, { resources: [] })

  const handle = normalizeHandle(request.params.handle)
  if (!handlePattern.test(handle)) {
    return sendError(response, API_ERROR_CODES.RESOURCE_FORBIDDEN, 'User profile not found.', 404)
  }

  const profile = await authStore.getUserByHandle(handle)
  if (!profile) {
    return sendError(response, API_ERROR_CODES.RESOURCE_FORBIDDEN, 'User profile not found.', 404)
  }
  if (profile.profileAdminDisabled) {
    return sendError(
      response,
      API_ERROR_CODES.PROFILE_ADMIN_DISABLED,
      'This public profile is currently unavailable.',
      403,
    )
  }
  if (!profile.profilePublic || !profile.activityPublic) return sendData(response, { resources: [] })

  const resources = await communityStore.listPublicUserUploads(profile.internalId)
  return sendData(response, { resources: resources.map(toPublicUploadPayload) })
})

app.get('/api/users/:handle/posts', async (request, response) => {
  if (!authStore || !communityStore) return sendData(response, { posts: [] })

  const handle = normalizeHandle(request.params.handle)
  if (!handlePattern.test(handle)) {
    return sendError(response, API_ERROR_CODES.RESOURCE_FORBIDDEN, 'User profile not found.', 404)
  }

  const profile = await authStore.getUserByHandle(handle)
  if (!profile) {
    return sendError(response, API_ERROR_CODES.RESOURCE_FORBIDDEN, 'User profile not found.', 404)
  }
  if (profile.profileAdminDisabled) {
    return sendError(
      response,
      API_ERROR_CODES.PROFILE_ADMIN_DISABLED,
      'This public profile is currently unavailable.',
      403,
    )
  }
  if (!profile.profilePublic || !profile.activityPublic) return sendData(response, { posts: [] })

  const posts = await communityStore.listPublicUserPosts(profile.internalId)
  return sendData(response, { posts: posts.map(toPublicPostPayload) })
})

app.get('/api/users/:handle/activity', async (request, response) => {
  if (!authStore || !communityStore) {
    return sendData(response, { comments: [], posts: [], resources: [] })
  }

  const handle = normalizeHandle(request.params.handle)
  if (!handlePattern.test(handle)) {
    return sendError(response, API_ERROR_CODES.RESOURCE_FORBIDDEN, 'User profile not found.', 404)
  }

  const profile = await authStore.getUserByHandle(handle)
  if (!profile) {
    return sendError(response, API_ERROR_CODES.RESOURCE_FORBIDDEN, 'User profile not found.', 404)
  }
  if (profile.profileAdminDisabled) {
    return sendError(
      response,
      API_ERROR_CODES.PROFILE_ADMIN_DISABLED,
      'This public profile is currently unavailable.',
      403,
    )
  }
  if (!profile.profilePublic || !profile.activityPublic) {
    return sendData(response, { comments: [], posts: [], resources: [] })
  }

  const [comments, posts, resources] = await Promise.all([
    communityStore.listPublicUserComments(profile.internalId),
    communityStore.listPublicUserPosts(profile.internalId),
    communityStore.listPublicUserUploads(profile.internalId),
  ])

  return sendData(response, {
    comments: comments.map(toPublicCommentPayload),
    posts: posts.map(toPublicPostPayload),
    resources: resources.map(toPublicUploadPayload),
  })
})

app.get('/api/account/community', requireAuthStore, async (request, response) => {
  if (!communityStore) {
    return sendError(
      response,
      API_ERROR_CODES.SERVICE_UNAVAILABLE,
      'Community features are not configured.',
      503,
    )
  }

  const user = await requireUser(
    request,
    response,
    'Please sign in to manage your community resources.',
  )
  if (!user) return

  const [uploads, posts] = await Promise.all([
    communityStore.listUserUploads(user.id),
    communityStore.listUserPosts(user.id),
  ])

  return sendData(response, { posts, uploads })
})

app.get('/api/account/downloads', requireAuthStore, async (request, response) => {
  const user = await requireUser(request, response, 'Please sign in to view your download requests.')
  if (!user) return

  if (typeof downloadRequestsStore.listUserRequests !== 'function') {
    return sendData(response, { requests: [] })
  }

  const requests = await downloadRequestsStore.listUserRequests(user.id)
  return sendData(response, { requests })
})

app.get('/api/account/comments', requireAuthStore, async (request, response) => {
  const user = await requireUser(request, response, 'Please sign in to view your comments.')
  if (!user) return

  if (typeof interactionsStore.listUserComments !== 'function') {
    return sendData(response, { comments: [], likeCount: 0 })
  }

  const [comments, likeCount] = await Promise.all([
    interactionsStore.listUserComments(user.id),
    typeof interactionsStore.countUserLikes === 'function'
      ? interactionsStore.countUserLikes(user.id)
      : Promise.resolve(0),
  ])

  return sendData(response, { comments, likeCount })
})

app.delete('/api/account/community/uploads/:id', requireAuthStore, async (request, response) => {
  if (!communityStore) {
    return sendError(
      response,
      API_ERROR_CODES.SERVICE_UNAVAILABLE,
      'Community features are not configured.',
      503,
    )
  }

  const user = await getOptionalUser(request)
  if (!user) {
    return sendError(
      response,
      API_ERROR_CODES.AUTH_REQUIRED,
      'Please sign in to manage your community resources.',
      401,
    )
  }

  const deleted = await communityStore.deleteUserUpload(request.params.id, user.id)
  if (!deleted) {
    return sendError(
      response,
      API_ERROR_CODES.COMMUNITY_UPLOAD_NOT_FOUND,
      'Community upload not found.',
      404,
    )
  }

  if (deleted.file_url?.startsWith('/uploads/')) {
    const localPath = path.resolve(rootDir, 'public', deleted.file_url.replace(/^\//, ''))
    if (localPath.startsWith(uploadRoot)) {
      unlink(localPath).catch((error) => console.error(error))
    }
  }

  return sendData(response, { ok: true })
})

app.delete('/api/account/community/posts/:id', requireAuthStore, async (request, response) => {
  if (!communityStore) {
    return sendError(
      response,
      API_ERROR_CODES.SERVICE_UNAVAILABLE,
      'Community features are not configured.',
      503,
    )
  }

  const user = await getOptionalUser(request)
  if (!user) {
    return sendError(
      response,
      API_ERROR_CODES.AUTH_REQUIRED,
      'Please sign in to manage your community posts.',
      401,
    )
  }

  const deleted = await communityStore.deleteUserPost(request.params.id, user.id)
  if (!deleted) {
    return sendError(
      response,
      API_ERROR_CODES.COMMUNITY_POST_NOT_FOUND,
      'Community post not found.',
      404,
    )
  }

  return sendData(response, { ok: true })
})

app.post('/api/community/uploads', requireAuthStore, upload.single('file'), async (request, response) => {
  if (!communityStore) {
    return sendError(
      response,
      API_ERROR_CODES.SERVICE_UNAVAILABLE,
      'Community uploads are not configured.',
      503,
    )
  }

  const user = await getOptionalUser(request)
  if (!user) {
    if (request.file) unlink(request.file.path).catch((error) => console.error(error))
    return sendError(
      response,
      API_ERROR_CODES.AUTH_REQUIRED,
      'Please sign in before uploading community resources.',
      401,
    )
  }

  if (!request.file) {
    return sendError(response, API_ERROR_CODES.VALIDATION_ERROR, 'Upload file is required.', 400)
  }

  const title = String(request.body?.title ?? '').trim().slice(0, 160)
  const description = String(request.body?.description ?? '').trim().slice(0, 1200)
  const extension = path.extname(request.file.originalname).toLowerCase()
  const fileType = imageExtensions.has(extension) ? 'image' : 'model'

  if (!title || !description) {
    unlink(request.file.path).catch((error) => console.error(error))

    return sendError(
      response,
      API_ERROR_CODES.VALIDATION_ERROR,
      'Title and description are required.',
      400,
    )
  }

  const folder = fileType === 'image' ? 'images' : 'models'
  const fileUrl = `/uploads/${folder}/${request.file.filename}`
  const uploadRecord = await communityStore.createUpload({
    assetCategory: normalizeAssetCategory(request.body?.assetCategory),
    description,
    fileName: request.file.originalname,
    fileSize: request.file.size,
    fileType,
    fileUrl,
    id: createId(),
    previewUrl: fileType === 'image' ? fileUrl : null,
    title,
    user,
    userId: user.id,
  })

  return sendData(response, { upload: uploadRecord }, 201)
})

app.post('/api/projects/:slug/like', async (request, response) => {
  const project = await projectStore.getProject(staticProjects, request.params.slug)
  const visitorId = String(request.body?.visitorId ?? '').trim().slice(0, 120)
  const user = await getOptionalUser(request)

  if (!project) {
    return sendError(response, API_ERROR_CODES.PROJECT_NOT_FOUND, 'Project not found.', 404)
  }

  if (!visitorId) {
    return sendError(response, API_ERROR_CODES.VALIDATION_ERROR, 'Visitor id is required.', 400)
  }

  const result = await interactionsStore.toggleLike(project.slug, visitorId, user?.id)
  return sendData(response, result)
})

app.post('/api/projects/:slug/comments', async (request, response) => {
  const project = await projectStore.getProject(staticProjects, request.params.slug)
  const user = await getOptionalUser(request)
  const author = String(request.body?.author || user?.displayName || '').trim().slice(0, 80)
  const message = String(request.body?.message ?? '').trim().slice(0, 1000)

  if (!project) {
    return sendError(response, API_ERROR_CODES.PROJECT_NOT_FOUND, 'Project not found.', 404)
  }

  if (!author || !message) {
    return sendError(response, API_ERROR_CODES.VALIDATION_ERROR, 'Author and message are required.', 400)
  }

  const comment = await interactionsStore.addComment(project.slug, {
    author,
    message,
    userId: user?.id,
  })
  return sendData(response, { comment }, 201)
})

app.post('/api/projects/:slug/download-requests', async (request, response) => {
  const project = await projectStore.getProject(staticProjects, request.params.slug)

  if (!project) {
    return sendError(response, API_ERROR_CODES.PROJECT_NOT_FOUND, 'Project not found.', 404)
  }

  const user = await getOptionalUser(request)
  const name = String(request.body?.name || user?.displayName || '').trim().slice(0, 120)
  const email = String(request.body?.email || user?.email || '').trim().slice(0, 180)
  const purpose = String(request.body?.purpose ?? '').trim().slice(0, 1200)
  const requiredAccessLevel = getPolicyAccessLevel(project.downloadPolicy || project.downloadPolicyEn)
  const currentAccessLevel = user?.accessLevel || 'guest'

  if (!name || !emailPattern.test(email) || !purpose) {
    return sendError(
      response,
      API_ERROR_CODES.VALIDATION_ERROR,
      'Please provide a valid name, email, and usage purpose.',
      400,
    )
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

  return sendData(
    response,
    {
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
    },
    201,
  )
})

app.get('/api/experience', (_request, response) => {
  sendData(response, { experience })
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
    return sendError(
      response,
      API_ERROR_CODES.VALIDATION_ERROR,
      'Please provide a valid name, email, and message.',
      400,
    )
  }

  await contactMessagesStore.addMessage(normalized)

  return sendData(response, { ok: true }, 201)
})

app.get('/api/admin/summary', requireAdmin, async (_request, response) => {
  sendData(response, { summary: await adminStore.getSummary() })
})

app.get('/api/admin/comments', requireAdmin, async (_request, response) => {
  sendData(response, { comments: await adminStore.listComments() })
})

app.get('/api/admin/likes', requireAdmin, async (_request, response) => {
  sendData(response, { likes: await adminStore.listLikes() })
})

app.get('/api/admin/contact-messages', requireAdmin, async (_request, response) => {
  sendData(response, { messages: await adminStore.listContactMessages() })
})

app.get('/api/admin/download-requests', requireAdmin, async (_request, response) => {
  sendData(response, { requests: await adminStore.listDownloadRequests() })
})

app.get('/api/admin/projects', requireAdmin, async (_request, response) => {
  sendData(response, { projects: await adminStore.listProjects(staticProjects) })
})

app.get('/api/admin/visitors', requireAdmin, async (request, response) => {
  const { limit, offset, page } = normalizePagination(request.query, 20, 100)
  const verified =
    request.query.verified === 'true'
      ? true
      : request.query.verified === 'false'
        ? false
        : null
  const accessLevel = visitorAccessLevels.includes(request.query.accessLevel)
    ? request.query.accessLevel
    : ''
  const profileStatuses = new Set(['public', 'private', 'disabled'])
  const profileStatus = profileStatuses.has(request.query.profileStatus)
    ? request.query.profileStatus
    : ''
  const visitorSorts = new Set(['createdAt', 'updatedAt', 'lastLoginAt', 'displayName'])
  const sort = visitorSorts.has(request.query.sort) ? request.query.sort : 'createdAt'
  const query = String(request.query.query ?? '').trim().slice(0, 120)
  const result = await adminStore.listVisitors({
    accessLevel,
    limit,
    offset,
    profileStatus,
    query,
    sort,
    verified,
  })
  const payload = toPaginatedPayload(result, page, limit)
  sendPage(response, { visitors: payload.items }, payload.pagination)
})

app.get('/api/admin/visitors/:id', requireAdmin, async (request, response) => {
  const visitor = await adminStore.getVisitor(request.params.id)
  if (!visitor) {
    return sendError(response, API_ERROR_CODES.VISITOR_NOT_FOUND, 'Visitor not found.', 404)
  }
  const actions = await adminStore.listVisitorActions(request.params.id, 10, 0)
  return sendData(response, { visitor, recentActions: actions.items })
})

const sendVisitorContentPage = (method) => async (request, response) => {
  const visitor = await adminStore.getVisitor(request.params.id)
  if (!visitor) {
    return sendError(response, API_ERROR_CODES.VISITOR_NOT_FOUND, 'Visitor not found.', 404)
  }
  const { limit, offset, page } = normalizePagination(request.query, 20, 100)
  const payload = toPaginatedPayload(
    await adminStore[method](request.params.id, limit, offset),
    page,
    limit,
  )
  return sendPage(response, { items: payload.items }, payload.pagination)
}

app.get(
  '/api/admin/visitors/:id/comments',
  requireAdmin,
  sendVisitorContentPage('listVisitorComments'),
)
app.get(
  '/api/admin/visitors/:id/posts',
  requireAdmin,
  sendVisitorContentPage('listVisitorPosts'),
)
app.get(
  '/api/admin/visitors/:id/uploads',
  requireAdmin,
  sendVisitorContentPage('listVisitorUploads'),
)
app.get(
  '/api/admin/visitors/:id/download-requests',
  requireAdmin,
  sendVisitorContentPage('listVisitorDownloadRequests'),
)
app.get(
  '/api/admin/visitors/:id/actions',
  requireAdmin,
  sendVisitorContentPage('listVisitorActions'),
)

app.patch('/api/admin/visitors/:id/profile-visibility', requireAdmin, async (request, response) => {
  if (typeof request.body?.disabled !== 'boolean') {
    return sendError(response, API_ERROR_CODES.VALIDATION_ERROR, 'disabled must be a boolean.', 400)
  }
  const reason = String(request.body?.reason ?? '').trim().slice(0, 500)
  const visitor = await adminStore.setVisitorProfileVisibility(
    request.params.id,
    request.body.disabled,
    reason,
  )
  if (!visitor) {
    return sendError(response, API_ERROR_CODES.VISITOR_NOT_FOUND, 'Visitor not found.', 404)
  }
  return sendData(response, { visitor })
})

app.patch('/api/admin/visitors/:id/profile-moderation', requireAdmin, async (request, response) => {
  const allowedFields = new Set(['avatar', 'banner', 'bio', 'contacts'])
  const fields = Array.isArray(request.body?.clear)
    ? [...new Set(request.body.clear.map((value) => String(value).trim()))]
    : []
  if (!fields.length || fields.some((field) => !allowedFields.has(field))) {
    return sendError(
      response,
      API_ERROR_CODES.VALIDATION_ERROR,
      'clear must contain one or more allowed profile fields.',
      400,
    )
  }
  const reason = String(request.body?.reason ?? '').trim().slice(0, 500)
  const visitor = await adminStore.moderateVisitorProfile(request.params.id, fields, reason)
  if (!visitor) {
    return sendError(response, API_ERROR_CODES.VISITOR_NOT_FOUND, 'Visitor not found.', 404)
  }
  return sendData(response, { visitor })
})

app.get('/api/admin/community-uploads', requireAdmin, async (_request, response) => {
  sendData(response, { uploads: await adminStore.listCommunityUploads() })
})

app.get('/api/admin/community-posts', requireAdmin, async (_request, response) => {
  sendData(response, { posts: await adminStore.listCommunityPosts() })
})

app.get('/api/admin/community-comments', requireAdmin, async (_request, response) => {
  sendData(response, { comments: await adminStore.listCommunityComments() })
})

app.patch('/api/admin/visitors/:id', requireAdmin, async (request, response) => {
  const accessLevel = normalizeAccessLevel(request.body?.accessLevel, '')

  if (!accessLevel) {
    return sendError(response, API_ERROR_CODES.VALIDATION_ERROR, 'Invalid visitor access level.', 400)
  }

  const visitor = await adminStore.updateVisitorAccessLevel(request.params.id, accessLevel)

  if (!visitor) {
    return sendError(response, API_ERROR_CODES.VISITOR_NOT_FOUND, 'Visitor not found.', 404)
  }

  return sendData(response, { visitor })
})

app.patch('/api/admin/visitors/:id/email-verification', requireAdmin, async (request, response) => {
  const verified = Boolean(request.body?.verified)
  const visitor = await adminStore.setVisitorEmailVerified(request.params.id, verified)

  if (!visitor) {
    return sendError(response, API_ERROR_CODES.VISITOR_NOT_FOUND, 'Visitor not found.', 404)
  }

  return sendData(response, { visitor })
})

app.delete('/api/admin/visitors/:id', requireAdmin, async (request, response) => {
  const deleted = await adminStore.deleteVisitor(request.params.id)

  if (!deleted) {
    return sendError(response, API_ERROR_CODES.VISITOR_NOT_FOUND, 'Visitor not found.', 404)
  }

  return sendData(response, { deleted })
})

app.patch('/api/admin/community-uploads/:id', requireAdmin, async (request, response) => {
  const status = String(request.body?.status ?? '').trim()
  const allowedStatuses = new Set(['pending', 'approved', 'rejected'])

  if (!allowedStatuses.has(status)) {
    return sendError(response, API_ERROR_CODES.VALIDATION_ERROR, 'Invalid upload status.', 400)
  }

  const uploadRecord = await adminStore.updateCommunityUploadStatus(request.params.id, status)

  if (!uploadRecord) {
    return sendError(
      response,
      API_ERROR_CODES.COMMUNITY_UPLOAD_NOT_FOUND,
      'Community upload not found.',
      404,
    )
  }

  return sendData(response, { upload: uploadRecord })
})

app.post('/api/admin/uploads', requireAdmin, upload.single('file'), async (request, response) => {
  if (!request.file) {
    return sendError(response, API_ERROR_CODES.VALIDATION_ERROR, 'Upload file is required.', 400)
  }

  const extension = path.extname(request.file.originalname).toLowerCase()
  const type = imageExtensions.has(extension) ? 'image' : 'model'

  if (type === 'image' && request.file.size > imageUploadLimit) {
    unlink(request.file.path).catch((error) => console.error(error))

    return sendError(
      response,
      API_ERROR_CODES.VALIDATION_ERROR,
      'Image uploads must be 16 MB or smaller.',
      400,
    )
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

  return sendData(
    response,
    {
      file: {
        name: request.file.originalname,
        size: request.file.size,
        type,
        url,
      },
      conversion,
    },
    201,
  )
})

const normalizeProjectPayload = (body) => {
  const localizedText = (field, maxLength) =>
    Object.fromEntries(
      ['Zh', 'En', 'Ja'].map((suffix) => [
        `${field}${suffix}`,
        String(body?.[`${field}${suffix}`] ?? '').trim().slice(0, maxLength),
      ]),
    )
  const normalized = {
    assetCategory: normalizeAssetCategory(body?.assetCategory),
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
    return sendError(
      response,
      API_ERROR_CODES.VALIDATION_ERROR,
      'Slug must use lowercase letters, numbers, and hyphens.',
      400,
    )
  }

  const existingProject = await projectStore.getProject(staticProjects, slug, {
    includeHidden: true,
  })

  if (existingProject) {
    return sendError(response, API_ERROR_CODES.PROJECT_SLUG_TAKEN, 'Project slug already exists.', 409)
  }

  if (!normalized.title || !normalized.summary || !normalized.image || !normalized.year) {
    return sendError(
      response,
      API_ERROR_CODES.VALIDATION_ERROR,
      'Title, summary, image, and year are required.',
      400,
    )
  }

  await adminStore.createProject({ slug, ...normalized })
  const project = await projectStore.getProject(staticProjects, slug, {
    includeHidden: true,
  })

  return sendData(response, { project }, 201)
})

app.patch('/api/admin/projects/:slug', requireAdmin, async (request, response) => {
  const existingProject = await projectStore.getProject(staticProjects, request.params.slug, {
    includeHidden: true,
  })

  if (!existingProject) {
    return sendError(response, API_ERROR_CODES.PROJECT_NOT_FOUND, 'Project not found.', 404)
  }

  const normalized = normalizeProjectPayload(request.body)

  if (!normalized.title || !normalized.summary || !normalized.image || !normalized.year) {
    return sendError(
      response,
      API_ERROR_CODES.VALIDATION_ERROR,
      'Title, summary, image, and year are required.',
      400,
    )
  }

  await adminStore.updateProject(request.params.slug, normalized)
  const project = await projectStore.getProject(staticProjects, request.params.slug, {
    includeHidden: true,
  })

  return sendData(response, { project })
})

app.delete('/api/admin/projects/:slug', requireAdmin, async (request, response) => {
  const existingProject = await projectStore.getProject(staticProjects, request.params.slug, {
    includeHidden: true,
  })

  if (!existingProject) {
    return sendError(response, API_ERROR_CODES.PROJECT_NOT_FOUND, 'Project not found.', 404)
  }

  const deleted = await adminStore.deleteProject(request.params.slug)

  if (!deleted) {
    return sendError(response, API_ERROR_CODES.PROJECT_NOT_FOUND, 'Project not found.', 404)
  }

  return sendData(response, { ok: true })
})

app.patch('/api/admin/download-requests/:id', requireAdmin, async (request, response) => {
  const status = String(request.body?.status ?? '').trim()
  const allowedStatuses = new Set(['pending', 'approved', 'rejected'])

  if (!allowedStatuses.has(status)) {
    return sendError(response, API_ERROR_CODES.VALIDATION_ERROR, 'Invalid request status.', 400)
  }

  const updated = await adminStore.updateDownloadRequestStatus(request.params.id, status)

  if (!updated) {
    return sendError(
      response,
      API_ERROR_CODES.DOWNLOAD_REQUEST_NOT_FOUND,
      'Download request not found.',
      404,
    )
  }

  return sendData(response, { request: updated })
})

app.delete('/api/admin/comments/:id', requireAdmin, async (request, response) => {
  const deleted = await adminStore.deleteComment(request.params.id)

  if (!deleted) {
    return sendError(response, API_ERROR_CODES.COMMENT_NOT_FOUND, 'Comment not found.', 404)
  }

  return sendData(response, { ok: true })
})

app.delete('/api/admin/contact-messages/:id', requireAdmin, async (request, response) => {
  const deleted = await adminStore.deleteContactMessage(request.params.id)

  if (!deleted) {
    return sendError(
      response,
      API_ERROR_CODES.CONTACT_MESSAGE_NOT_FOUND,
      'Contact message not found.',
      404,
    )
  }

  return sendData(response, { ok: true })
})

app.delete('/api/admin/download-requests/:id', requireAdmin, async (request, response) => {
  const deleted = await adminStore.deleteDownloadRequest(request.params.id)

  if (!deleted) {
    return sendError(
      response,
      API_ERROR_CODES.DOWNLOAD_REQUEST_NOT_FOUND,
      'Download request not found.',
      404,
    )
  }

  return sendData(response, { ok: true })
})

app.delete('/api/admin/community-uploads/:id', requireAdmin, async (request, response) => {
  const deleted = await adminStore.deleteCommunityUpload(request.params.id)

  if (!deleted) {
    return sendError(
      response,
      API_ERROR_CODES.COMMUNITY_UPLOAD_NOT_FOUND,
      'Community upload not found.',
      404,
    )
  }

  if (deleted.file_url?.startsWith('/uploads/')) {
    const localPath = path.resolve(rootDir, 'public', deleted.file_url.replace(/^\//, ''))
    if (localPath.startsWith(uploadRoot)) {
      unlink(localPath).catch((error) => console.error(error))
    }
  }

  return sendData(response, { ok: true })
})

app.delete('/api/admin/community-posts/:id', requireAdmin, async (request, response) => {
  const deleted = await adminStore.deleteCommunityPost(request.params.id)

  if (!deleted) {
    return sendError(
      response,
      API_ERROR_CODES.COMMUNITY_POST_NOT_FOUND,
      'Community post not found.',
      404,
    )
  }

  return sendData(response, { ok: true })
})

app.delete('/api/admin/community-comments/:id', requireAdmin, async (request, response) => {
  const deleted = await adminStore.deleteCommunityComment(request.params.id)

  if (!deleted) {
    return sendError(
      response,
      API_ERROR_CODES.COMMUNITY_COMMENT_NOT_FOUND,
      'Community comment not found.',
      404,
    )
  }

  return sendData(response, { ok: true })
})

// Test-only route: lets tests/api/contract.spec.js exercise the final
// INTERNAL_ERROR envelope handler below with a deterministic uncaught
// exception. Registered only when NODE_ENV === 'test' — it does not exist in
// production (or any other environment) and must never be relied on outside
// the contract tests.
if (process.env.NODE_ENV === 'test') {
  app.get('/api/__test__/throw', () => {
    throw new Error('Deliberate uncaught contract-test error.')
  })
}

app.use((error, _request, response, next) => {
  if (!error) return next()

  const uploadError = describeUploadError(error)
  if (uploadError) {
    return sendError(response, uploadError.code, uploadError.message, uploadError.httpStatus)
  }

  return next(error)
})

// Final API error handler: any error that escapes a route handler or
// middleware on an /api/* request must surface as the JSON envelope, never
// Express's default HTML error page. Malformed JSON bodies rejected by
// express.json arrive as SyntaxErrors flagged `entity.parse.failed` and map to
// 400 REQUEST_BODY_INVALID; every other uncaught error maps to 500
// INTERNAL_ERROR. The response body carries only the fixed code/message —
// stack traces, driver errors, and file paths stay in the server-side log.
// Non-API requests fall through to Express so the static/SPA pipeline below
// keeps its existing behavior.
app.use((error, request, response, next) => {
  if (!error) return next()
  if (response.headersSent) return next(error)

  const requestPath = request.path || request.originalUrl || ''
  if (!(requestPath === '/api' || requestPath.startsWith('/api/'))) return next(error)

  const isBodyParseError =
    error.type === 'entity.parse.failed' ||
    (error instanceof SyntaxError && error.status === 400 && 'body' in error)

  if (isBodyParseError) {
    return sendError(
      response,
      API_ERROR_CODES.REQUEST_BODY_INVALID,
      'Request body is not valid JSON.',
      400,
    )
  }

  console.error(`[API INTERNAL ERROR] ${request.method} ${request.originalUrl}`, error)
  return sendError(response, API_ERROR_CODES.INTERNAL_ERROR, 'Internal server error.', 500)
})

// Non-API responses below intentionally bypass the JSON envelope
// (sendData/sendPage/sendError): they serve the built single-page client, not
// the API contract. Static assets are streamed as-is, and any non-API GET
// falls back to the SPA's index.html so client-side routing can take over.
// API routes are all registered above; the envelope contract applies to them.
app.use(express.static(distDir, { setHeaders: setStaticCacheHeaders }))

app.get(/.*/, (_request, response) => {
  setNoStoreHeaders(response)
  response.sendFile(distIndexPath)
})

app.listen(port, () => {
  console.log(`Portfolio server listening on http://localhost:${port}`)
})
