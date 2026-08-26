import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import multer from 'multer'
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdir, unlink, access, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createContactMessagesStore } from './contactMessagesStore.js'
import { createContentHealthChecker } from './contentHealth.js'
import { experience, profile, projects as staticProjects, skills } from './content.js'
import { createDownloadRequestsStore } from './downloadRequestsStore.js'
import { hasValidFileSignature } from './fileSignatures.js'
import {
  isEmailDeliveryConfigured,
  sendDownloadDecisionEmail,
  sendEmailChangeEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from './emailDelivery.js'
import { createInteractionsStore } from './interactionsStore.js'
import { convertModelToGlb } from './modelConverter.js'
import { createPostgresStores } from './postgresStores.js'
import { hashPassword, verifyPassword } from './passwordHash.js'
import {
  buildOtpAuthUrl,
  generateRecoveryCodes,
  generateTotpSecret,
  normalizeRecoveryCode,
  verifyTotp,
} from './adminTotp.js'
import { API_ERROR_CODES, describeUploadError, sendData, sendError, sendPage } from './responses.js'
import { renderSeoHtml, resolveRoute } from './seo.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const dataDir = path.join(rootDir, 'data')
const distDir = path.join(rootDir, 'dist')
const distIndexPath = path.join(distDir, 'index.html')
const uploadRoot = path.join(rootDir, 'public', 'uploads')
const modelConverterScript = path.join(rootDir, 'scripts', 'convert-model-to-glb.py')
// Stateless -- it holds only the two directories it searches, so it is built
// once here rather than per request.
const contentHealth = createContentHealthChecker({ rootDir })
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Opt-in, not derived from NODE_ENV. The deploy script's systemd unit only sets
// EnvironmentFile, so NODE_ENV is usually undefined in production — keying the
// code echo off `!== 'production'` meant an unauthenticated caller could read a
// live verification code out of the response and take over any unverified
// account. Absent env now means no echo.
const exposeDevVerificationCode = process.env.EXPOSE_DEV_VERIFICATION_CODE === 'true'
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

// --------------------------------------------------------------------------
// Per-account security policy.
//
// The rate limiters further down are keyed on the caller's IP, which is the
// wrong axis for credential attacks: an attacker with a proxy pool gets a
// fresh bucket per request while the account under attack absorbs every
// guess. These budgets live on the account row instead, so they are shared
// across every source address.
// --------------------------------------------------------------------------
const LOGIN_LOCK_AFTER = Math.max(3, Number(process.env.LOGIN_LOCK_AFTER || 8))
const LOGIN_LOCK_MS = Math.max(1, Number(process.env.LOGIN_LOCK_MINUTES || 15)) * 60 * 1000
const VERIFICATION_MAX_ATTEMPTS = Math.max(3, Number(process.env.VERIFICATION_MAX_ATTEMPTS || 6))
const PASSWORD_RESET_MAX_ATTEMPTS = Math.max(3, Number(process.env.PASSWORD_RESET_MAX_ATTEMPTS || 6))
const CODE_TTL_MS = 20 * 60 * 1000
const MIN_PASSWORD_LENGTH = 8

// Admin sessions expire; the static ADMIN_TOKEN no longer has to live in a
// browser forever. See docs/OPERATIONS_ADMIN_AUTH.md.
const ADMIN_SESSION_TTL_MS =
  Math.max(1, Number(process.env.ADMIN_SESSION_HOURS || 12)) * 60 * 60 * 1000
// Set ADMIN_ALLOW_STATIC_TOKEN=false once every admin client exchanges the
// token for a session, to retire direct static-token API access entirely.
const allowStaticAdminToken = process.env.ADMIN_ALLOW_STATIC_TOKEN !== 'false'
// Named admin accounts (docs/OPERATIONS_ADMIN_AUTH.md, step 3). The lockout
// budget is tighter than the visitor one: there are a handful of these accounts
// and every one of them is worth more than any visitor account.
const ADMIN_LOGIN_LOCK_AFTER = Math.max(3, Number(process.env.ADMIN_LOGIN_LOCK_AFTER || 5))
const ADMIN_LOGIN_LOCK_MS =
  Math.max(1, Number(process.env.ADMIN_LOGIN_LOCK_MINUTES || 15)) * 60 * 1000

// Storage budget per account, independent of the per-IP request limiter.
const UPLOAD_QUOTA_WINDOW_MS = Math.max(1, Number(process.env.UPLOAD_QUOTA_HOURS || 24)) * 3600 * 1000
const UPLOAD_QUOTA_MAX_FILES = Math.max(1, Number(process.env.UPLOAD_QUOTA_MAX_FILES || 30))
const UPLOAD_QUOTA_MAX_BYTES =
  Math.max(1, Number(process.env.UPLOAD_QUOTA_MAX_MB || 1024)) * 1024 * 1024

// Download tickets are redeemed immediately by a browser navigation, so the
// window only has to cover the round trip.
const DOWNLOAD_TICKET_TTL_MS = 2 * 60 * 1000

// Key for the server-derived anonymous visitor identity used by project likes.
// Without a stable value across restarts, anonymous like de-duplication resets
// on every deploy; the startup self-check warns when it is unset.
const visitorIdentitySecret =
  process.env.VISITOR_ID_SECRET || randomBytes(32).toString('hex')
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

// Vite's own output is content-hashed, so /assets can be cached forever. Model
// previews live in /models and are not built by Vite, but the big one is hashed
// by hand (scripts/optimize-model.mjs) precisely so it can join that deal: a
// multi-megabyte GLB served with the express.static default of max-age=0 pays a
// revalidation round-trip on every single visit. Only hashed names qualify --
// an unhashed file could change under a URL a browser has been told to trust
// for a year.
const HASHED_ASSET_PATTERN = /\.[0-9a-f]{8}\.[a-z0-9]+$/

const setStaticCacheHeaders = (response, filePath) => {
  if (path.basename(filePath) === 'index.html') {
    setNoStoreHeaders(response)
    return
  }

  if (
    filePath.includes(`${path.sep}assets${path.sep}`) ||
    HASHED_ASSET_PATTERN.test(path.basename(filePath))
  ) {
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    return
  }

  // The Draco decoder is versioned by the three release it was copied from, not
  // by its filename, so it gets a week rather than a year.
  if (filePath.includes(`${path.sep}draco${path.sep}`)) {
    response.setHeader('Cache-Control', 'public, max-age=604800')
  }
}

const app = express()
const port = process.env.PORT || 4173

// The app always runs behind nginx (and Cloudflare in production). Without this
// request.ip is 127.0.0.1 for every visitor, which silently emptied the
// download_requests / admin visitor audit trail and would make every IP-based
// rate limit below behave as one global bucket.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1))
app.disable('x-powered-by')

app.use(
  helmet({
    // Blocking since 2026-08-12. It ran report-only from 2026-08-11 and the
    // collector below reported exactly two violations, both of them the
    // policy's fault rather than the app's:
    //   script-src <- wasm-eval    three.js decoders compile WebAssembly
    //   connect-src <- blob        the admin upload preview fetches a blob: URL
    // Both are covered by the directives below; see scriptSrc / connectSrc.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        workerSrc: ["'self'", 'blob:'],
        // 'wasm-unsafe-eval' allows WebAssembly.instantiate and nothing else —
        // it does not bring back eval() or inline script. Without it the
        // three.js draco/meshopt decoders cannot compile and the model silently
        // fails to load. scriptSrc has to be spelled out: leaving it unset
        // falls back to defaultSrc, which is where the reported violation came
        // from.
        scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
        // blob: is needed to read back an object URL, not to reach the network.
        connectSrc: ["'self'", 'blob:'],
        // The collector is what made this policy tightenable against evidence
        // instead of guesses, and it matters more now than in report-only mode:
        // a violation is a broken page, and this is the only signal for a code
        // path the browser pass did not cover. reportUri is the widely
        // supported directive; reportTo needs a Report-To/Reporting-Endpoints
        // header pair to be useful.
        reportUri: ['/api/csp-report'],
        // upgrade-insecure-requests is helmet's default and is back now that
        // the policy blocks. It was disabled while report-only because browsers
        // ignore it there and log an error about it on every SPA page.
        // Browsers exempt localhost, so it does not affect a local http run.
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
    hsts: { maxAge: 15552000, includeSubDomains: true },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }),
)

// origin:true echoed any Origin back, letting any site read API responses.
const allowedOrigins = (
  process.env.CORS_ORIGIN ||
  'https://mrright.blog,https://www.mrright.blog,http://localhost:5173,http://127.0.0.1:5173'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

app.use(cors({ origin: allowedOrigins }))

// /api/v1 dual mount (docs/API_V1_FREEZE_PLAN.md §3). Requests to /api/v1/*
// are tagged apiVersion='v1' and rewritten to the matching /api/* path so both
// prefixes share the exact same route handlers — no duplicated business logic,
// no drift. The only behavioral difference lives in server/responses.js: v1
// responses use the strict envelope (data/pagination/error only), while legacy
// /api/* keeps the top-level data mirror and code/message compatibility keys
// for the current Web front end. Registered BEFORE express.json so that body
// parse errors on /api/v1/* also surface as strict envelopes. request.originalUrl
// keeps the /api/v1 prefix for logging.
const API_V1_PREFIX = '/api/v1'
const rewriteApiV1Url = (url) => {
  if (url === API_V1_PREFIX) return '/api'
  if (url.startsWith(`${API_V1_PREFIX}/`) || url.startsWith(`${API_V1_PREFIX}?`)) {
    return `/api${url.slice(API_V1_PREFIX.length)}`
  }
  return null
}

app.use((request, _response, next) => {
  const rewrittenUrl = rewriteApiV1Url(request.url)
  if (rewrittenUrl) {
    request.apiVersion = 'v1'
    request.url = rewrittenUrl
  }
  next()
})

app.use(express.json({ limit: '96kb' }))

// Access gate for user-supplied files. Two things were reachable by anyone who
// knew (or was handed) the URL: community uploads still sitting in pending or
// already rejected, and the original .fbx/.obj/.zip sources that survive after
// an admin upload is converted to .glb.
//
// Deliberate non-goal: the .glb a public project renders in the browser stays
// public. A mesh the viewer downloads and draws is downloadable by definition —
// gating it would only break the portfolio while stopping nobody. Enforce
// distribution policy on the source archives, not on the preview mesh.
//
// <img> and the GLTF loader cannot attach an Authorization header, so anything
// a public page needs to render must pass without one.
const restrictedUploadExtensions = new Set(['.fbx', '.obj', '.zip'])

// Every /uploads request used to cost one database round trip, so a gallery
// page with N images issued N queries before a single byte was served. The
// lookup is cached for a short TTL and invalidated explicitly wherever an
// upload's status changes, so a rejection takes effect immediately rather than
// waiting out the TTL.
const UPLOAD_ACCESS_CACHE_TTL_MS = 30 * 1000
const UPLOAD_ACCESS_CACHE_MAX_ENTRIES = 1000
const uploadAccessCache = new Map()

const invalidateUploadAccessCache = (assetUrl) => {
  if (assetUrl) {
    uploadAccessCache.delete(assetUrl)
    return
  }

  uploadAccessCache.clear()
}

const lookupUploadByAssetUrl = async (assetUrl) => {
  if (!communityStore) return null

  const cached = uploadAccessCache.get(assetUrl)
  if (cached && cached.expiresAt > Date.now()) return cached.upload

  const upload = await communityStore.getUploadByAssetUrl(assetUrl)

  // Plain insertion-ordered eviction: the oldest key goes when the map is
  // full. An LRU would be better under a hot working set, but this only has
  // to stop unbounded growth from one-off asset URLs.
  if (uploadAccessCache.size >= UPLOAD_ACCESS_CACHE_MAX_ENTRIES) {
    const oldestKey = uploadAccessCache.keys().next().value
    uploadAccessCache.delete(oldestKey)
  }

  uploadAccessCache.set(assetUrl, {
    expiresAt: Date.now() + UPLOAD_ACCESS_CACHE_TTL_MS,
    upload,
  })

  return upload
}

const uploadAccessGate = async (request, response, next) => {
  let assetPath
  try {
    assetPath = decodeURIComponent(request.path)
  } catch {
    return response.status(400).end()
  }

  const assetUrl = `/uploads${assetPath}`
  const upload = await lookupUploadByAssetUrl(assetUrl)

  if (upload) {
    if (upload.status === 'approved') return next()
  } else if (!restrictedUploadExtensions.has(path.extname(assetPath).toLowerCase())) {
    return next()
  }

  if (await resolveAdminAuth(request)) return next()

  const viewer = await getOptionalUser(request)
  if (viewer && upload && upload.user_id === viewer.id) return next()

  // 404 rather than 403: a 403 would confirm the file exists.
  return response.status(404).end()
}

app.use(
  '/uploads',
  uploadAccessGate,
  express.static(uploadRoot, {
    setHeaders: (response) => {
      response.setHeader('X-Content-Type-Options', 'nosniff')
    },
  }),
)

// Nothing was rate limited before this: /api/auth/login took unlimited password
// guesses, the 6-digit verification code could be brute forced while
// /api/auth/resend-verification refreshed the window for free, and that same
// endpoint could mail-bomb any registered address. RATE_LIMITED already exists
// in responses.js and the OpenAPI enum, so this adds no contract change.
//
// Registered after the /api/v1 rewrite so both prefixes share one bucket, and
// it relies on the trust proxy setting above — without it every visitor would
// count against a single 127.0.0.1 bucket.
const createLimiter = ({ windowMs, limit, message, writesOnly = false }) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (request) => writesOnly && (request.method === 'GET' || request.method === 'HEAD'),
    handler: (_request, response) =>
      sendError(response, API_ERROR_CODES.RATE_LIMITED, message, 429),
  })

const minutes = (count) => count * 60 * 1000

// Authentication responses are user-specific and must never be served from a
// browser, intermediary, or a conditional 304 response. In particular, a
// cached anonymous /api/auth/me response can be revalidated as 304 after a
// successful login; the client then receives an empty body and would clear the
// freshly-issued token as if the session had expired. Mount this before the
// rate limiters too, so a 429 auth response carries the same policy.
app.use('/api/auth', (_request, response, next) => {
  // Express can turn a successful JSON response into an empty 304 when these
  // validators are present. Auth state is not a cacheable representation, so
  // ignore client/intermediary validators and always send the complete body.
  delete _request.headers['if-none-match']
  delete _request.headers['if-modified-since']
  setNoStoreHeaders(response)
  next()
})

app.use('/api', createLimiter({
  windowMs: minutes(15),
  limit: 600,
  message: 'Too many requests. Please slow down and try again shortly.',
}))

// The per-IP budgets below are the first line of defence; the per-account
// budgets in the route handlers are the one that actually stops a distributed
// attack. Both are env-overridable so the contract suite can exercise the
// account-level behaviour without tripping the network-level cap first —
// production leaves every one of them at the default.
app.use('/api/auth/login', createLimiter({
  windowMs: minutes(15),
  limit: Math.max(1, Number(process.env.LOGIN_LIMIT_PER_WINDOW || 10)),
  message: 'Too many sign-in attempts. Please try again in a few minutes.',
}))

// Sign-in for named admin accounts. Tighter than the visitor budget for the
// same reason the lockout is: the value of the account being guessed at is
// much higher, and no legitimate operator signs in ten times in a quarter hour.
app.use('/api/admin/login', createLimiter({
  windowMs: minutes(15),
  limit: Math.max(1, Number(process.env.ADMIN_LOGIN_LIMIT_PER_WINDOW || 10)),
  message: 'Too many sign-in attempts. Please try again in a few minutes.',
}))

// Re-enrolling the second factor. The confirm step accepts a six-digit code,
// so without a budget it is a 10^6 space to walk; the account lockout does not
// cover it, because that counts *sign-in* failures. Same window as admin login.
app.use('/api/admin/totp/enrolment', createLimiter({
  windowMs: minutes(15),
  limit: Math.max(1, Number(process.env.ADMIN_TOTP_ENROL_LIMIT_PER_WINDOW || 10)),
  message: 'Too many enrolment attempts. Please try again in a few minutes.',
}))

app.use('/api/auth/verify-email', createLimiter({
  windowMs: minutes(15),
  limit: Math.max(1, Number(process.env.VERIFY_LIMIT_PER_WINDOW || 10)),
  message: 'Too many verification attempts. Please request a new code.',
}))

// Overridable so the contract suite can exercise flows that need more than a
// handful of throwaway accounts per run. Production leaves them at the default.
app.use('/api/auth/register', createLimiter({
  windowMs: minutes(60),
  limit: Math.max(1, Number(process.env.REGISTER_LIMIT_PER_HOUR || 5)),
  message: 'Too many accounts created from this network. Please try again later.',
}))

app.use('/api/auth/resend-verification', createLimiter({
  windowMs: minutes(60),
  limit: Math.max(1, Number(process.env.RESEND_LIMIT_PER_HOUR || 3)),
  message: 'Verification email already requested. Please wait before trying again.',
}))

// Reset mails go to an address the caller does not have to control, so the
// send side is capped harder than the redeem side.
app.use('/api/auth/forgot-password', createLimiter({
  windowMs: minutes(60),
  limit: Math.max(1, Number(process.env.FORGOT_PASSWORD_LIMIT_PER_HOUR || 3)),
  message: 'Password reset already requested. Please wait before trying again.',
}))

app.use('/api/auth/reset-password', createLimiter({
  windowMs: minutes(15),
  limit: 10,
  message: 'Too many reset attempts. Please request a new code.',
}))

// Changing a sign-in address mails a code to an address supplied in the
// request body, which is the same mail-bomb primitive as resend-verification.
//
// The budget covers the confirm step too — app.use matches by prefix, so
// /api/account/email/confirm lands in this bucket as well. That is why it is
// not the tight 5/hour the send side alone would want: a visitor who mistypes
// the code a few times must not be locked out of finishing the change. The
// per-account attempt counter is what actually bounds code guessing.
app.use('/api/account/email', createLimiter({
  windowMs: minutes(60),
  limit: Math.max(1, Number(process.env.EMAIL_CHANGE_LIMIT_PER_HOUR || 15)),
  message: 'Too many email change requests. Please try again later.',
  writesOnly: true,
}))

app.use('/api/account/password', createLimiter({
  windowMs: minutes(15),
  limit: 10,
  message: 'Too many password change attempts. Please try again shortly.',
  writesOnly: true,
}))

app.use('/api/contact', createLimiter({
  windowMs: minutes(60),
  limit: 5,
  message: 'Too many messages sent. Please try again later.',
}))

app.use('/api/community/uploads', createLimiter({
  windowMs: minutes(60),
  limit: 20,
  message: 'Upload limit reached. Please try again later.',
  writesOnly: true,
}))

app.use('/api/community/posts', createLimiter({
  windowMs: minutes(60),
  limit: 30,
  message: 'Posting limit reached. Please try again later.',
  writesOnly: true,
}))

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
      // The random component is not decoration: `${Date.now()}-${baseName}`
      // collides whenever two uploads of the same file name land in the same
      // millisecond, and the loser silently overwrites the winner's file. It
      // also made every stored path guessable from the original file name.
      const suffix = randomBytes(4).toString('hex')
      callback(null, `${Date.now()}-${suffix}-${baseName || 'asset'}${extension}`)
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

// Rejects and removes an upload whose bytes do not match its extension.
// Returns true when the caller should stop (the response has been sent).
const rejectOnSignatureMismatch = async (request, response) => {
  const extension = path.extname(request.file.originalname).toLowerCase()
  if (await hasValidFileSignature(request.file.path, extension)) return false

  unlink(request.file.path).catch((error) => console.error(error))
  sendError(
    response,
    API_ERROR_CODES.INVALID_FILE_TYPE,
    `File contents do not match the ${extension} format.`,
    400,
  )

  return true
}

// Storage budget per account, checked BEFORE multer streams the body so an
// over-quota member never gets to write 120MB to disk first. Content-Length is
// a hint from the client, but multer's own fileSize limit bounds the real
// write, so the worst case is one oversized file slipping past the byte check.
const enforceUploadQuota = async (request, response, next) => {
  if (typeof communityStore?.getUploadUsage !== 'function') return next()

  const usage = await communityStore.getUploadUsage(request.visitorUser.id, UPLOAD_QUOTA_WINDOW_MS)
  const declaredSize = Number(request.get('Content-Length') || 0)
  const windowHours = Math.round(UPLOAD_QUOTA_WINDOW_MS / 3600000)

  if (usage.count >= UPLOAD_QUOTA_MAX_FILES) {
    return sendError(
      response,
      API_ERROR_CODES.UPLOAD_QUOTA_EXCEEDED,
      `Upload limit reached: ${UPLOAD_QUOTA_MAX_FILES} files per ${windowHours} hours.`,
      429,
    )
  }

  if (usage.bytes + declaredSize > UPLOAD_QUOTA_MAX_BYTES) {
    const quotaMb = Math.round(UPLOAD_QUOTA_MAX_BYTES / (1024 * 1024))
    return sendError(
      response,
      API_ERROR_CODES.UPLOAD_QUOTA_EXCEEDED,
      `Storage limit reached: ${quotaMb}MB per ${windowHours} hours.`,
      429,
    )
  }

  return next()
}

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const hashToken = (token) => createHash('sha256').update(token).digest('hex')

const createVerificationCode = () => String(randomBytes(4).readUInt32BE() % 1000000).padStart(6, '0')

const hashVerificationCode = (email, code) =>
  createHash('sha256')
    .update(`${email.trim().toLowerCase()}:${String(code).trim()}`)
    .digest('hex')

// Domain-separated from hashVerificationCode so a code minted for one purpose
// can never be replayed against another, even if a future refactor lets the
// two share a column.
const hashScopedCode = (scope, key, code) =>
  createHash('sha256')
    .update(`${scope}:${String(key).trim().toLowerCase()}:${String(code).trim()}`)
    .digest('hex')

// Rejects the passwords that show up first in every credential-stuffing list,
// plus anything derived from the account's own identifiers. Length alone is a
// weak signal — "password" and "12345678" both clear an 8-character minimum.
const weakPasswords = new Set([
  '12345678', '123456789', '1234567890', 'password', 'password1', 'password123',
  'qwertyui', 'qwerty123', 'iloveyou', 'admin123', 'welcome1', 'abc12345',
  'letmein1', 'football', 'baseball', 'sunshine', 'princess', 'trustno1',
  '11111111', '00000000', 'passw0rd', 'zaq12wsx', 'dragon123', 'monkey12',
])

const describePasswordProblem = (password, { displayName = '', email = '' } = {}) => {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  }

  if (password.length > 200) return 'Password must be 200 characters or fewer.'

  const normalized = password.toLowerCase()
  if (weakPasswords.has(normalized)) return 'This password is too common. Please choose another.'

  const localPart = String(email).split('@')[0]?.toLowerCase() || ''
  if (localPart.length >= 3 && normalized.includes(localPart)) {
    return 'Password must not contain your email address.'
  }

  const name = String(displayName).trim().toLowerCase()
  if (name.length >= 3 && normalized.includes(name)) {
    return 'Password must not contain your display name.'
  }

  if (/^(.)\1+$/.test(password)) return 'Password must not be a single repeated character.'

  return null
}

// hashPassword / verifyPassword live in ./passwordHash.js so the admin-user CLI
// derives hashes identically; see the comment at the top of that file.

// Burned so that "no such account" costs the same as a wrong password. Without
// it the missing-user branch returned in microseconds while a real account paid
// the full derivation, which is a reliable account-existence oracle.
const dummyPasswordHash = await hashPassword(randomBytes(16).toString('hex'))

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

// Authentication middleware for the upload routes, so multer never runs for an
// anonymous caller. Previously the chain was requireAuthStore -> multer ->
// handler, which meant an unauthenticated request streamed its whole body to
// disk (up to 120MB) before the handler rejected it and unlinked the file.
// Resolves the session once and hands it to the handler via request.visitorUser.
const requireVisitor = async (request, response, next) => {
  if (!authStore) {
    return sendError(
      response,
      API_ERROR_CODES.SERVICE_UNAVAILABLE,
      'Visitor accounts are not configured.',
      503,
    )
  }

  const user = await getOptionalUser(request)
  if (!user) {
    return sendError(response, API_ERROR_CODES.AUTH_REQUIRED, 'Please sign in to continue.', 401)
  }

  request.visitorUser = user
  return next()
}

app.get('/api/health', (_request, response) => {
  sendData(response, { ok: true, service: 'mrright-portfolio' })
})

// CSP violation collector. Browsers post these with content-type
// application/csp-report (or application/reports+json for the newer Reporting
// API), neither of which express.json accepts by default, so the payload
// needs its own parser.
//
// Deliberately NOT part of the JSON envelope contract: the browser is the
// caller and it ignores the body entirely. It answers 204 and never anything
// else, so a malformed or hostile report cannot turn into an error the site
// has to handle.
const cspReportCounts = new Map()

app.post(
  '/api/csp-report',
  express.json({ limit: '16kb', type: ['application/csp-report', 'application/reports+json', 'application/json'] }),
  (request, response) => {
    const report = request.body?.['csp-report'] || request.body || {}
    const directive = String(
      report['effective-directive'] || report['violated-directive'] || 'unknown',
    ).slice(0, 80)
    const blockedUri = String(report['blocked-uri'] || '').slice(0, 200)

    // Aggregate rather than log every hit: a single broken third-party asset
    // on a busy page would otherwise flood the journal.
    const key = `${directive} <- ${blockedUri}`
    const count = (cspReportCounts.get(key) || 0) + 1
    cspReportCounts.set(key, count)

    // Log on a widening interval so the first occurrences are visible without
    // the thousandth being noise.
    if (count === 1 || count === 10 || count % 100 === 0) {
      console.warn(`[CSP] ${key} (${count} report(s))`)
    }

    response.status(204).end()
  },
)

app.get('/api/auth/me', async (request, response) => {
  const user = await getOptionalUser(request)
  sendData(response, { user })
})

app.post('/api/auth/register', requireAuthStore, async (request, response) => {
  // Strip CR/LF before this value reaches the mail body. formatMessage writes
  // straight into the SMTP DATA segment, so an embedded "\r\n.\r\n" terminated
  // the message early and let the rest be parsed as SMTP commands.
  const displayName = String(request.body?.displayName ?? '')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, 80)
  const email = String(request.body?.email ?? '').trim().toLowerCase().slice(0, 180)
  const password = String(request.body?.password ?? '')

  if (!displayName || !emailPattern.test(email) || password.length < MIN_PASSWORD_LENGTH) {
    return sendError(
      response,
      API_ERROR_CODES.VALIDATION_ERROR,
      'Please provide a display name, valid email, and password with at least 8 characters.',
      400,
    )
  }

  const passwordProblem = describePasswordProblem(password, { displayName, email })
  if (passwordProblem) {
    return sendError(response, API_ERROR_CODES.VALIDATION_ERROR, passwordProblem, 400)
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
  let user
  try {
    user = await authStore.createUser({
      accessLevel: 'member',
      displayName,
      email,
      id: createId(),
      passwordHash: await hashPassword(password),
      verificationCodeHash: verification.hash,
      verificationExpiresAt: verification.expiresAt,
    })
  } catch (error) {
    // The check above is not atomic. Two simultaneous registrations for the same
    // address used to surface the visitor_users.email unique violation as a bare
    // 500 instead of the 409 the caller already handles. Same pattern as the
    // handle uniqueness path in PUT /api/account/profile.
    if (error?.code === '23505') {
      return sendError(
        response,
        API_ERROR_CODES.EMAIL_ALREADY_REGISTERED,
        'This email is already registered.',
        409,
      )
    }

    throw error
  }

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
        ...(exposeDevVerificationCode ? { devCode: verification.code } : {}),
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

  // Uniform response whether or not the address exists or is already verified.
  // The previous 404 / 409 / 200 split turned this unauthenticated endpoint into
  // a free "is this address registered, and has it been verified" oracle, and
  // handed an attacker a way to mail every address in a dictionary.
  const respondAccepted = (expiresAt, extra = {}) =>
    sendData(response, {
      verification: {
        delivery: 'accepted',
        expiresAt: expiresAt.toISOString(),
        required: true,
        ...extra,
      },
    })

  if (!user || user.emailVerified) {
    return respondAccepted(new Date(Date.now() + 1000 * 60 * 20))
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
      ...(exposeDevVerificationCode ? { devCode: verification.code } : {}),
    },
  })
})

app.post('/api/auth/login', requireAuthStore, async (request, response) => {
  const email = String(request.body?.email ?? '').trim().toLowerCase().slice(0, 180)
  const password = String(request.body?.password ?? '')
  const user = await authStore.getUserByEmail(email)

  // Always run one derivation, even when the address is unknown, so the
  // response time does not reveal whether the account exists.
  const passwordMatches = await verifyPassword(password, user?.passwordHash ?? dummyPasswordHash)

  // A locked account rejects even the correct password, so an attacker who
  // eventually guesses it inside the lock window still gains nothing. The
  // check runs after the derivation above to keep the timing uniform.
  if (user?.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    return sendError(
      response,
      API_ERROR_CODES.ACCOUNT_LOCKED,
      'Too many failed sign-in attempts. Please try again later or reset your password.',
      423,
    )
  }

  if (!user || !passwordMatches) {
    // Only a real account can be locked out; an unknown address must not
    // create state, or the endpoint becomes an account-enumeration oracle.
    if (user && typeof authStore.registerFailedLogin === 'function') {
      await authStore.registerFailedLogin(user.id, {
        lockAfter: LOGIN_LOCK_AFTER,
        lockMs: LOGIN_LOCK_MS,
      })
    }

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

  if (typeof authStore.clearLoginFailures === 'function') {
    await authStore.clearLoginFailures(user.id)
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
    // Burn one attempt against the account. Six digits is only a million
    // possibilities: without an account-scoped budget, an attacker rotating
    // IPs walks the space and takes over any unverified registration.
    if (typeof authStore.registerVerificationAttempt === 'function') {
      const attempts = await authStore.registerVerificationAttempt(email, {
        maxAttempts: VERIFICATION_MAX_ATTEMPTS,
      })

      if (attempts >= VERIFICATION_MAX_ATTEMPTS) {
        return sendError(
          response,
          API_ERROR_CODES.VALIDATION_ERROR,
          'Too many incorrect codes. Please request a new verification email.',
          400,
        )
      }
    }

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

// Password reset. Before this existed, a visitor who forgot their password was
// permanently locked out: there was no self-service path back into the account
// and no way to rotate a password suspected of being compromised.
//
// Like /api/auth/resend-verification, the response is uniform whether or not
// the address is registered — otherwise this becomes a free account-existence
// oracle for every address an attacker cares to try.
app.post('/api/auth/forgot-password', requireAuthStore, async (request, response) => {
  const email = String(request.body?.email ?? '').trim().toLowerCase().slice(0, 180)

  if (!emailPattern.test(email)) {
    return sendError(response, API_ERROR_CODES.VALIDATION_ERROR, 'Valid email is required.', 400)
  }

  const expiresAt = new Date(Date.now() + CODE_TTL_MS)
  const respondAccepted = (extra = {}) =>
    sendData(response, {
      reset: {
        delivery: 'accepted',
        expiresAt: expiresAt.toISOString(),
        required: true,
        ...extra,
      },
    })

  if (typeof authStore.setPasswordResetCode !== 'function') {
    return sendError(
      response,
      API_ERROR_CODES.SERVICE_UNAVAILABLE,
      'Password reset is not configured.',
      503,
    )
  }

  const code = createVerificationCode()
  const issued = await authStore.setPasswordResetCode(
    email,
    hashScopedCode('password-reset', email, code),
    expiresAt,
  )

  // An unverified or unknown address gets the same 200 with no email sent.
  if (!issued) return respondAccepted()

  const user = await authStore.getUserByEmail(email)
  try {
    await sendPasswordResetEmail({
      code,
      displayName: user?.displayName,
      email,
      expiresAt,
    })
  } catch (error) {
    console.error('Password reset email delivery failed:', error.message)
  }

  return respondAccepted(exposeDevVerificationCode ? { devCode: code } : {})
})

app.post('/api/auth/reset-password', requireAuthStore, async (request, response) => {
  const email = String(request.body?.email ?? '').trim().toLowerCase().slice(0, 180)
  const code = String(request.body?.code ?? '').trim().slice(0, 12)
  const password = String(request.body?.password ?? '')

  if (!emailPattern.test(email) || !code) {
    return sendError(
      response,
      API_ERROR_CODES.VALIDATION_ERROR,
      'Valid email and reset code are required.',
      400,
    )
  }

  const passwordProblem = describePasswordProblem(password, { email })
  if (passwordProblem) {
    return sendError(response, API_ERROR_CODES.VALIDATION_ERROR, passwordProblem, 400)
  }

  if (typeof authStore.resetPasswordWithCode !== 'function') {
    return sendError(
      response,
      API_ERROR_CODES.SERVICE_UNAVAILABLE,
      'Password reset is not configured.',
      503,
    )
  }

  const user = await authStore.resetPasswordWithCode(
    email,
    hashScopedCode('password-reset', email, code),
    await hashPassword(password),
  )

  if (!user) {
    if (typeof authStore.registerPasswordResetAttempt === 'function') {
      await authStore.registerPasswordResetAttempt(email, {
        maxAttempts: PASSWORD_RESET_MAX_ATTEMPTS,
      })
    }

    return sendError(
      response,
      API_ERROR_CODES.PASSWORD_RESET_INVALID,
      'Reset code is invalid or expired. Please request a new one.',
      400,
    )
  }

  // resetPasswordWithCode dropped every existing session, so the caller is
  // handed a fresh one rather than being bounced back to the sign-in form.
  const session = await createSession(user)
  const publicUser = await authStore.getAccountProfile(user.id)

  return sendData(response, { session, user: publicUser })
})

app.post('/api/auth/logout', async (request, response) => {
  const token = getAuthToken(request)
  if (token && authStore) await authStore.deleteSession(hashToken(token))
  sendData(response, { ok: true })
})

// sha256 both sides before comparing so the buffers are always the same length:
// timingSafeEqual throws on a length mismatch, and the raw length would itself
// leak information. Reuses getAuthToken so the trimming rule matches the
// visitor auth path, which previously differed.
const isAdminToken = (token) => {
  if (!process.env.ADMIN_TOKEN || !token) return false

  return timingSafeEqual(
    createHash('sha256').update(token).digest(),
    createHash('sha256').update(process.env.ADMIN_TOKEN).digest(),
  )
}

// Accepts either the static ADMIN_TOKEN or a session token minted from it by
// POST /api/admin/session.
//
// The static token used to be what the browser kept in localStorage, forever:
// one XSS or one leaked backup handed over permanent, unrevocable control of
// every admin route. The dashboard now exchanges it once at sign-in and stores
// only the resulting session, so the blast radius of a stolen browser token is
// ADMIN_SESSION_HOURS instead of "until someone notices". Direct static-token
// API access stays enabled for scripts and the deploy checks until
// ADMIN_ALLOW_STATIC_TOKEN=false retires it.
const resolveAdminAuth = async (request) => {
  const token = getAuthToken(request)
  if (!token) return null

  if (allowStaticAdminToken && isAdminToken(token)) return { kind: 'static' }

  if (typeof adminStore?.getAdminSession !== 'function') return null

  const session = await adminStore.getAdminSession(hashToken(token))
  if (!session) return null

  return {
    // null for a session minted from the shared static token. Routes that write
    // to the audit trail pass this straight through, so "nobody in particular"
    // is recorded as such instead of being attributed to whoever is handy.
    adminUserId: session.adminUserId ?? null,
    expiresAt: session.expiresAt,
    kind: 'session',
    username: session.username ?? null,
  }
}

const requireAdmin = async (request, response, next) => {
  if (!adminStore) {
    // Reported before the auth check so a misconfigured deployment is
    // distinguishable from a rejected credential.
    if (!isAdminToken(getAuthToken(request))) {
      return sendError(
        response,
        API_ERROR_CODES.ADMIN_AUTH_REQUIRED,
        'Admin authorization is required.',
        401,
      )
    }

    return sendError(
      response,
      API_ERROR_CODES.SERVICE_UNAVAILABLE,
      'Admin data store is not configured.',
      503,
    )
  }

  const auth = await resolveAdminAuth(request)
  if (!auth) {
    return sendError(
      response,
      API_ERROR_CODES.ADMIN_AUTH_REQUIRED,
      'Admin authorization is required.',
      401,
    )
  }

  request.adminAuth = auth
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

// --------------------------------------------------------------------------
// Account security. None of this existed before: a visitor could not change
// their password, could not move to a new email address, could not sign out a
// device they no longer had, and could not delete the account at all.
// --------------------------------------------------------------------------

// Re-authenticates the caller with their current password before a sensitive
// change. Returns null and sends the error response when it does not match, so
// call sites can `if (!(await confirmPassword(...))) return`.
const confirmCurrentPassword = async (request, response, user) => {
  const currentPassword = String(request.body?.currentPassword ?? '')

  if (typeof authStore.getPasswordHash !== 'function') {
    sendError(response, API_ERROR_CODES.SERVICE_UNAVAILABLE, 'Account security is not configured.', 503)
    return false
  }

  const storedHash = await authStore.getPasswordHash(user.id)
  // Falls back to the dummy hash so a missing record costs the same time as a
  // wrong password, matching the sign-in path.
  const matches = await verifyPassword(currentPassword, storedHash ?? dummyPasswordHash)

  if (!storedHash || !matches) {
    sendError(response, API_ERROR_CODES.PASSWORD_INCORRECT, 'Current password is incorrect.', 403)
    return false
  }

  return true
}

app.put('/api/account/password', requireAuthStore, async (request, response) => {
  const user = await requireUser(request, response, 'Please sign in to change your password.')
  if (!user) return

  const newPassword = String(request.body?.newPassword ?? '')
  const problem = describePasswordProblem(newPassword, {
    displayName: user.displayName,
    email: user.email,
  })
  if (problem) return sendError(response, API_ERROR_CODES.VALIDATION_ERROR, problem, 400)

  if (!(await confirmCurrentPassword(request, response, user))) return

  if (typeof authStore.updatePassword !== 'function') {
    return sendError(
      response,
      API_ERROR_CODES.SERVICE_UNAVAILABLE,
      'Account security is not configured.',
      503,
    )
  }

  // The device doing the change keeps its session; every other one is dropped,
  // which is the behaviour a password change has to have to be worth anything
  // after a suspected compromise.
  const currentTokenHash = hashToken(getAuthToken(request))
  await authStore.updatePassword(user.id, await hashPassword(newPassword), {
    keepTokenHash: currentTokenHash,
  })

  return sendData(response, { ok: true, otherSessionsRevoked: true })
})

app.post('/api/account/sessions/revoke-all', requireAuthStore, async (request, response) => {
  const user = await requireUser(request, response, 'Please sign in to manage your sessions.')
  if (!user) return

  if (typeof authStore.deleteSessionsForUser !== 'function') {
    return sendError(
      response,
      API_ERROR_CODES.SERVICE_UNAVAILABLE,
      'Account security is not configured.',
      503,
    )
  }

  const keepCurrent = request.body?.keepCurrent !== false
  const revoked = await authStore.deleteSessionsForUser(user.id, {
    keepTokenHash: keepCurrent ? hashToken(getAuthToken(request)) : null,
  })

  return sendData(response, { ok: true, revoked })
})

// Email change is a two-step flow: the code goes to the NEW address only, so
// completing it proves control of that mailbox. The old address keeps working
// for sign-in until the change is confirmed.
app.post('/api/account/email', requireAuthStore, async (request, response) => {
  const user = await requireUser(request, response, 'Please sign in to change your email.')
  if (!user) return

  const newEmail = String(request.body?.email ?? '').trim().toLowerCase().slice(0, 180)

  if (!emailPattern.test(newEmail)) {
    return sendError(response, API_ERROR_CODES.VALIDATION_ERROR, 'Valid email is required.', 400)
  }

  if (newEmail === String(user.email || '').toLowerCase()) {
    return sendError(
      response,
      API_ERROR_CODES.VALIDATION_ERROR,
      'This is already your sign-in email.',
      400,
    )
  }

  if (!(await confirmCurrentPassword(request, response, user))) return

  if (typeof authStore.setPendingEmail !== 'function') {
    return sendError(
      response,
      API_ERROR_CODES.SERVICE_UNAVAILABLE,
      'Account security is not configured.',
      503,
    )
  }

  // Deliberately not reported to the caller: telling them the address is taken
  // turns an authenticated endpoint into a registration oracle. The pending
  // change is stored either way and fails at confirmation on the unique index.
  const taken = await authStore.getUserByEmail(newEmail)

  const code = createVerificationCode()
  const expiresAt = new Date(Date.now() + CODE_TTL_MS)
  await authStore.setPendingEmail(
    user.id,
    newEmail,
    hashScopedCode('email-change', newEmail, code),
    expiresAt,
  )

  if (!taken) {
    try {
      await sendEmailChangeEmail({
        code,
        displayName: user.displayName,
        email: newEmail,
        expiresAt,
      })
    } catch (error) {
      console.error('Email change delivery failed:', error.message)
    }
  }

  return sendData(response, {
    pendingEmail: {
      email: newEmail,
      expiresAt: expiresAt.toISOString(),
      ...(exposeDevVerificationCode && !taken ? { devCode: code } : {}),
    },
  })
})

app.post('/api/account/email/confirm', requireAuthStore, async (request, response) => {
  const user = await requireUser(request, response, 'Please sign in to change your email.')
  if (!user) return

  const code = String(request.body?.code ?? '').trim().slice(0, 12)
  if (!code) {
    return sendError(response, API_ERROR_CODES.VALIDATION_ERROR, 'Confirmation code is required.', 400)
  }

  if (typeof authStore.confirmPendingEmail !== 'function') {
    return sendError(
      response,
      API_ERROR_CODES.SERVICE_UNAVAILABLE,
      'Account security is not configured.',
      503,
    )
  }

  const profile = await authStore.getAccountProfile(user.id)
  const pendingEmail = profile?.pendingEmail
  if (!pendingEmail) {
    return sendError(
      response,
      API_ERROR_CODES.EMAIL_CHANGE_INVALID,
      'No pending email change. Please start again.',
      400,
    )
  }

  let updated
  try {
    updated = await authStore.confirmPendingEmail(
      user.id,
      hashScopedCode('email-change', pendingEmail, code),
    )
  } catch (error) {
    // Someone registered the address while the change was pending.
    if (error?.code === '23505') {
      await authStore.cancelPendingEmail(user.id)
      return sendError(
        response,
        API_ERROR_CODES.EMAIL_ALREADY_REGISTERED,
        'This email is already registered.',
        409,
      )
    }

    throw error
  }

  if (!updated) {
    if (typeof authStore.registerPendingEmailAttempt === 'function') {
      await authStore.registerPendingEmailAttempt(user.id, {
        maxAttempts: PASSWORD_RESET_MAX_ATTEMPTS,
      })
    }

    return sendError(
      response,
      API_ERROR_CODES.EMAIL_CHANGE_INVALID,
      'Confirmation code is invalid or expired.',
      400,
    )
  }

  return sendData(response, { profile: await authStore.getAccountProfile(user.id) })
})

app.delete('/api/account/email', requireAuthStore, async (request, response) => {
  const user = await requireUser(request, response, 'Please sign in to manage your email.')
  if (!user) return

  if (typeof authStore.cancelPendingEmail === 'function') {
    await authStore.cancelPendingEmail(user.id)
  }

  return sendData(response, { ok: true })
})

// Hard account deletion. Requires the current password plus an explicit typed
// confirmation, because it cannot be undone.
app.delete('/api/account', requireAuthStore, async (request, response) => {
  const user = await requireUser(request, response, 'Please sign in to delete your account.')
  if (!user) return

  if (String(request.body?.confirm ?? '').trim().toUpperCase() !== 'DELETE') {
    return sendError(
      response,
      API_ERROR_CODES.VALIDATION_ERROR,
      'Type DELETE to confirm account deletion.',
      400,
    )
  }

  if (!(await confirmCurrentPassword(request, response, user))) return

  if (typeof authStore.deleteAccount !== 'function') {
    return sendError(
      response,
      API_ERROR_CODES.SERVICE_UNAVAILABLE,
      'Account deletion is not configured.',
      503,
    )
  }

  const deleted = await authStore.deleteAccount(user.id)
  if (!deleted) {
    return sendError(response, API_ERROR_CODES.VISITOR_NOT_FOUND, 'Account not found.', 404)
  }

  // Files are removed after the transaction committed: a failed unlink must
  // not roll back the deletion, it just leaves an orphan for the operator.
  for (const fileUrl of deleted.fileUrls) {
    const localPath = path.resolve(rootDir, 'public', fileUrl.replace(/^\//, ''))
    if (localPath.startsWith(uploadRoot)) {
      unlink(localPath).catch((error) => console.error(error))
    }
  }

  return sendData(response, { ok: true })
})

app.post(
  '/api/account/avatar',
  requireVisitor,
  avatarUpload.single('file'),
  async (request, response) => {
    const user = request.visitorUser

    if (!request.file) {
      return sendError(response, API_ERROR_CODES.VALIDATION_ERROR, 'Avatar file is required.', 400)
    }

    if (await rejectOnSignatureMismatch(request, response)) return

    const avatarUrl = `/uploads/avatars/${request.file.filename}`
    const profile = await authStore.updateAccountImage(user.id, 'avatar', avatarUrl)
    return sendData(response, { avatarUrl, profile }, 201)
  },
)

app.post(
  '/api/account/banner',
  requireVisitor,
  bannerUpload.single('file'),
  async (request, response) => {
    const user = request.visitorUser

    if (!request.file) {
      return sendError(response, API_ERROR_CODES.VALIDATION_ERROR, 'Banner file is required.', 400)
    }

    if (await rejectOnSignatureMismatch(request, response)) return

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
    invalidateUploadAccessCache(deleted.file_url)
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

app.post(
  '/api/community/uploads',
  requireVisitor,
  enforceUploadQuota,
  upload.single('file'),
  async (request, response) => {
  if (!communityStore) {
    return sendError(
      response,
      API_ERROR_CODES.SERVICE_UNAVAILABLE,
      'Community uploads are not configured.',
      503,
    )
  }

  const user = request.visitorUser

  if (!request.file) {
    return sendError(response, API_ERROR_CODES.VALIDATION_ERROR, 'Upload file is required.', 400)
  }

  if (await rejectOnSignatureMismatch(request, response)) return

  const title = String(request.body?.title ?? '').trim().slice(0, 160)
  const description = String(request.body?.description ?? '').trim().slice(0, 1200)
  const extension = path.extname(request.file.originalname).toLowerCase()
  const fileType = imageExtensions.has(extension) ? 'image' : 'model'

  // The shared multer instance caps everything at the 120MB a model may need.
  // /api/admin/uploads already narrowed images to imageUploadLimit; this route
  // did not, so a member could store a 120MB "png".
  if (fileType === 'image' && request.file.size > imageUploadLimit) {
    unlink(request.file.path).catch((error) => console.error(error))

    return sendError(
      response,
      API_ERROR_CODES.VALIDATION_ERROR,
      'Image uploads must be 16MB or smaller.',
      413,
    )
  }

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

// The identity a like is recorded against is derived on the server.
//
// It used to be whatever `visitorId` the client sent — a value the browser
// generated and kept in localStorage — so inflating a project's like count was
// a matter of posting the same request with a new random string each time.
//
// A signed-in caller is identified by their account. Everyone else gets an
// HMAC over their address, user agent, and the project slug: stable for the
// same visitor (so a second like still toggles the first one off), opaque in
// the database, and not something the caller can vary at will. Visitors behind
// one NAT sharing a browser build collapse into a single identity, which is the
// safe direction to be wrong in — it undercounts rather than inflates.
// Anonymous identity comes from a cookie the SERVER issues and signs.
//
// The first version of this hashed the caller's address and user agent, which
// was fine in principle and useless here: port 443 is shared with another
// service through an nginx stream (SNI) splitter, so every HTTPS visitor
// arrives as 127.0.0.1 and the whole anonymous population collapsed into one
// identity per browser build. See docs/OPERATIONS_CLIENT_IP.md.
//
// A signed cookie needs no address at all. The client cannot forge one without
// the secret, and clearing cookies to like again is a far higher bar than
// editing the localStorage string the client used to be trusted with.
const VISITOR_COOKIE = 'mrright-vid'
const VISITOR_COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000

const signVisitorId = (id) =>
  createHmac('sha256', visitorIdentitySecret).update(id).digest('base64url').slice(0, 27)

const readCookie = (request, name) => {
  const header = request.headers.cookie
  if (!header) return ''

  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1) continue
    if (part.slice(0, separator).trim() !== name) continue

    try {
      return decodeURIComponent(part.slice(separator + 1).trim())
    } catch {
      return ''
    }
  }

  return ''
}

// Returns the caller's anonymous id, issuing and setting a fresh signed cookie
// when there is no valid one. Verifying the signature is what stops a caller
// from simply making up a new id per request.
const resolveAnonymousVisitorId = (request, response) => {
  const cookie = readCookie(request, VISITOR_COOKIE)
  const [id, signature] = cookie.split('.')

  if (id && signature && id.length <= 40) {
    const expected = signVisitorId(id)
    const provided = Buffer.from(signature)
    const wanted = Buffer.from(expected)
    if (provided.length === wanted.length && timingSafeEqual(provided, wanted)) return id
  }

  const freshId = randomBytes(16).toString('base64url')
  response.cookie(VISITOR_COOKIE, `${freshId}.${signVisitorId(freshId)}`, {
    httpOnly: true,
    maxAge: VISITOR_COOKIE_MAX_AGE_MS,
    path: '/',
    sameSite: 'lax',
    // request.protocol reflects X-Forwarded-Proto, which the TLS vhost does set
    // correctly even though it cannot set a usable X-Forwarded-For.
    secure: request.protocol === 'https',
  })

  return freshId
}

const deriveLikeIdentity = (request, response, user) => {
  if (user?.id) return `user:${user.id}`

  return `anon:${resolveAnonymousVisitorId(request, response)}`
}

app.post('/api/projects/:slug/like', async (request, response) => {
  const project = await projectStore.getProject(staticProjects, request.params.slug)
  // Still required by the frozen v1 request schema, but the VALUE is now
  // ignored — identity comes from deriveLikeIdentity below. Drop the field
  // from the request schema in the next contract version.
  const visitorId = String(request.body?.visitorId ?? '').trim().slice(0, 120)
  const user = await getOptionalUser(request)

  if (!project) {
    return sendError(response, API_ERROR_CODES.PROJECT_NOT_FOUND, 'Project not found.', 404)
  }

  if (!visitorId) {
    return sendError(response, API_ERROR_CODES.VALIDATION_ERROR, 'Visitor id is required.', 400)
  }

  const identity = deriveLikeIdentity(request, response, user)
  const result = await interactionsStore.toggleLike(project.slug, identity, user?.id)
  return sendData(response, result)
})

// Project comments are moderated rather than rate limited by address.
//
// Anyone could post anonymously under any author name, and the only thing
// between the site and a spam run was a per-IP limiter — which does nothing on
// this deployment, because port 443 is shared through an nginx stream splitter
// and every visitor arrives as 127.0.0.1 (docs/OPERATIONS_CLIENT_IP.md).
//
// So the gate is identity-based instead: a signed-in visitor with a verified
// address publishes immediately, because that account carries consequences and
// is already subject to per-account throttling. Everyone else is queued for
// review. Obvious spam is filed straight to 'spam' so it never reaches the
// queue a human reads.
const COMMENT_WINDOW_MS = 60 * 60 * 1000
const COMMENT_MAX_PER_WINDOW = Math.max(1, Number(process.env.COMMENT_MAX_PER_HOUR || 10))
const linkPattern = /https?:\/\/|www\.|\[url[=\]]|<a\s/gi

const looksLikeSpam = (message, author) => {
  const links = message.match(linkPattern)?.length ?? 0
  if (links >= 3) return true

  // A short message that is mostly a link is an advert, not a comment.
  if (links >= 1 && message.replace(linkPattern, '').trim().length < 15) return true

  // Long runs of the same character, and the usual pharma/casino keyword soup.
  if (/(.)\1{15,}/.test(message)) return true
  if (/\b(viagra|cialis|casino|porn|crypto giveaway|forex signals)\b/i.test(`${author} ${message}`)) {
    return true
  }

  return false
}

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

  // Per-account budget, the one axis that still works without a client address.
  if (user?.id && typeof interactionsStore.countRecentUserComments === 'function') {
    const recent = await interactionsStore.countRecentUserComments(user.id, COMMENT_WINDOW_MS)
    if (recent >= COMMENT_MAX_PER_WINDOW) {
      return sendError(
        response,
        API_ERROR_CODES.RATE_LIMITED,
        'You have posted a lot of comments recently. Please try again later.',
        429,
      )
    }
  }

  let status = user?.emailVerified ? 'published' : 'pending'

  if (looksLikeSpam(message, author)) {
    status = 'spam'
  } else if (typeof interactionsStore.hasRecentDuplicate === 'function') {
    const duplicate = await interactionsStore.hasRecentDuplicate(
      { message, slug: project.slug, userId: user?.id },
      COMMENT_WINDOW_MS,
    )
    if (duplicate) status = 'spam'
  }

  const comment = await interactionsStore.addComment(project.slug, {
    author,
    message,
    status,
    userId: user?.id,
  })

  // A spam verdict is reported as a normal acceptance. Telling the poster
  // which heuristic caught them just teaches them how to get around it, and a
  // false positive still shows up in the author's own account page.
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

  if (!normalized.name || !emailPattern.test(normalized.email) || !normalized.message) {
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

// Source archive download endpoint. The .glb preview files in /models are
// deliberately public (the viewer downloads and renders them, so gating access
// would only break the portfolio). This endpoint gates access to the actual
// source files (FBX/OBJ/Blend + high-res textures) that admins upload to
// public/uploads/projects/:slug-source.zip.
//
// Authorization: admin token OR an approved download_requests row for this
// project + user/email. If the file doesn't exist on disk, returns 404
// regardless of authorization (the admin hasn't uploaded it yet).
// Resolved from rootDir, not process.cwd(). The two happen to agree under the
// deploy script's systemd unit (WorkingDirectory=/opt/mrright-portfolio), but
// every other path in this file derives from rootDir, and a unit started from
// anywhere else would have made this endpoint quietly serve nothing.
const projectArchivePath = (slug) => path.join(uploadRoot, 'projects', `${slug}-source.zip`)

const archiveExists = async (archivePath) => {
  try {
    await access(archivePath)
    return true
  } catch {
    return false
  }
}

const streamProjectArchive = async (request, response, { actor, slug, userId }) => {
  const archivePath = projectArchivePath(slug)

  if (!(await archiveExists(archivePath))) {
    return sendError(
      response,
      API_ERROR_CODES.PROJECT_NOT_FOUND,
      'Source archive not available for this project.',
      404,
    )
  }

  // Who actually took an asset, and when, was previously unrecorded: only the
  // approval was. Logged before the transfer starts so an aborted download
  // still leaves a trace.
  if (typeof downloadRequestsStore?.recordDownloadEvent === 'function') {
    try {
      await downloadRequestsStore.recordDownloadEvent({
        actor,
        ip: request.ip,
        projectSlug: slug,
        userId,
      })
    } catch (error) {
      console.error('Download event logging failed:', error.message)
    }
  }

  // response.download streams from disk and sets Content-Disposition, so the
  // browser writes straight to the file system instead of buffering.
  return response.download(archivePath, `${slug}-source.zip`)
}

// Issues a short-lived, single-use ticket for the gated source archive.
//
// The Web client could not simply link to the download: the archive needs an
// Authorization header, so it pulled the whole file through fetch() into a Blob
// first, which puts a multi-hundred-megabyte archive in the tab's memory. With
// a ticket the browser navigates to a plain URL and streams the file to disk.
app.post('/api/projects/:slug/download-ticket', async (request, response) => {
  const { slug } = request.params
  const project = await projectStore.getProject(staticProjects, slug)

  if (!project) {
    return sendError(response, API_ERROR_CODES.PROJECT_NOT_FOUND, 'Project not found.', 404)
  }

  if (typeof downloadRequestsStore?.createDownloadTicket !== 'function') {
    return sendError(
      response,
      API_ERROR_CODES.SERVICE_UNAVAILABLE,
      'Download service is not available.',
      503,
    )
  }

  const adminAuth = await resolveAdminAuth(request)
  const user = adminAuth ? null : await getOptionalUser(request)

  if (!adminAuth) {
    const hasApproval = await downloadRequestsStore.hasApprovedRequest(slug, user?.id, user?.email)

    if (!hasApproval) {
      return sendError(
        response,
        API_ERROR_CODES.RESOURCE_FORBIDDEN,
        'Download access requires an approved request. Submit one from the project page.',
        403,
      )
    }
  }

  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + DOWNLOAD_TICKET_TTL_MS)

  await downloadRequestsStore.createDownloadTicket({
    expiresAt,
    projectSlug: slug,
    tokenHash: hashToken(token),
    userId: user?.id,
  })

  return sendData(
    response,
    {
      ticket: {
        expiresAt: expiresAt.toISOString(),
        token,
        url: `/api/projects/${encodeURIComponent(slug)}/download?ticket=${token}`,
      },
    },
    201,
  )
})

app.get('/api/projects/:slug/download', async (request, response) => {
  const { slug } = request.params
  const project = await projectStore.getProject(staticProjects, slug)

  if (!project) {
    return sendError(response, API_ERROR_CODES.PROJECT_NOT_FOUND, 'Project not found.', 404)
  }

  // Ticket path: a browser navigation carries no Authorization header, so the
  // credential rides in the query string. It is single-use and expires in
  // minutes, which is what keeps a URL leaked through history or a referrer
  // from being worth anything.
  const ticket = String(request.query.ticket ?? '').trim()
  if (ticket) {
    if (typeof downloadRequestsStore?.consumeDownloadTicket !== 'function') {
      return sendError(
        response,
        API_ERROR_CODES.SERVICE_UNAVAILABLE,
        'Download service is not available.',
        503,
      )
    }

    const redeemed = await downloadRequestsStore.consumeDownloadTicket(hashToken(ticket), slug)
    if (!redeemed) {
      return sendError(
        response,
        API_ERROR_CODES.DOWNLOAD_TICKET_INVALID,
        'Download link is invalid, already used, or expired. Please start the download again.',
        403,
      )
    }

    return streamProjectArchive(request, response, {
      actor: redeemed.userId ? 'visitor' : 'admin',
      slug,
      userId: redeemed.userId,
    })
  }

  // Bearer-token path, kept for the admin dashboard and API clients.
  if (await resolveAdminAuth(request)) {
    return streamProjectArchive(request, response, { actor: 'admin', slug, userId: null })
  }

  if (!downloadRequestsStore) {
    return sendError(
      response,
      API_ERROR_CODES.SERVICE_UNAVAILABLE,
      'Download service is not available.',
      503,
    )
  }

  const user = await getOptionalUser(request)
  const hasApproval = await downloadRequestsStore.hasApprovedRequest(slug, user?.id, user?.email)

  if (!hasApproval) {
    return sendError(
      response,
      API_ERROR_CODES.RESOURCE_FORBIDDEN,
      'Download access requires an approved request. Submit one from the project page.',
      403,
    )
  }

  return streamProjectArchive(request, response, { actor: 'visitor', slug, userId: user?.id })
})

// Recovery codes are hashed with a plain SHA-256 rather than pbkdf2. That is
// not a shortcut: they are 80 bits of machine-generated entropy, so there is no
// dictionary to stretch against, and the hash has to be *deterministic* for the
// single-statement "delete this one code if it is still there" to work at all.
// Passwords remain pbkdf2 because they are chosen by people.
const hashRecoveryCode = (code) => hashToken(normalizeRecoveryCode(code))

const adminAccountsAvailable = () => typeof adminStore?.getAdminUserByUsername === 'function'

const issueAdminSession = async (request, adminUserId = null) => {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_MS)

  await adminStore.createAdminSession({
    adminUserId,
    expiresAt,
    ip: request.ip,
    tokenHash: hashToken(token),
    userAgent: String(request.get('User-Agent') || '').slice(0, 300),
  })

  return { expiresAt: expiresAt.toISOString(), token }
}

// Sign-in for a named admin account: password plus a second factor, in
// exchange for the same short-lived session the static token yields — except
// this one is attributable to a person, which is the entire point of it
// existing. See docs/OPERATIONS_ADMIN_AUTH.md step 3.
app.post('/api/admin/login', async (request, response) => {
  if (!adminAccountsAvailable()) {
    return sendError(
      response,
      API_ERROR_CODES.SERVICE_UNAVAILABLE,
      'Admin data store is not configured.',
      503,
    )
  }

  const username = String(request.body?.username ?? '').trim().toLowerCase().slice(0, 80)
  const password = String(request.body?.password ?? '')
  const totp = String(request.body?.totp ?? '').trim().slice(0, 12)
  const recoveryCode = String(request.body?.recoveryCode ?? '').trim().slice(0, 40)

  const admin = username ? await adminStore.getAdminUserByUsername(username) : null
  // One derivation always, so an unknown username costs the same as a wrong
  // password and the endpoint cannot be used to enumerate accounts.
  const passwordMatches = await verifyPassword(password, admin?.passwordHash ?? dummyPasswordHash)

  const rejectCredentials = async () => {
    // Only a real, enabled account can accumulate failures: counting them for
    // an unknown username would create state an attacker could probe for.
    if (admin && !admin.disabledAt) {
      await adminStore.registerAdminLoginFailure(admin.id, {
        lockAfter: ADMIN_LOGIN_LOCK_AFTER,
        lockMs: ADMIN_LOGIN_LOCK_MS,
      })
    }

    return sendError(
      response,
      API_ERROR_CODES.VALIDATION_ERROR,
      'Username, password or verification code is incorrect.',
      401,
    )
  }

  if (admin?.lockedUntil && new Date(admin.lockedUntil) > new Date()) {
    return sendError(
      response,
      API_ERROR_CODES.ACCOUNT_LOCKED,
      'Too many failed sign-in attempts. Please try again later.',
      423,
    )
  }

  if (!admin || admin.disabledAt || !passwordMatches) return rejectCredentials()

  if (!admin.totpSecret) {
    // Accounts are created with a secret; this is the defensive branch for one
    // that somehow has none. Refusing is the only safe answer -- signing in
    // without a second factor would quietly turn the account into a password.
    return sendError(
      response,
      API_ERROR_CODES.ADMIN_TOTP_REQUIRED,
      'This account has no second factor enrolled. Re-enrol it with scripts/admin-user.mjs.',
      403,
    )
  }

  let recoveryCodesLeft = null

  if (recoveryCode) {
    const consumed = await adminStore.consumeAdminRecoveryCode(admin.id, hashRecoveryCode(recoveryCode))
    if (!consumed.ok) return rejectCredentials()
    recoveryCodesLeft = consumed.remaining
  } else if (totp) {
    const attempt = verifyTotp(admin.totpSecret, totp, { afterStep: admin.totpLastStep })
    if (!attempt.ok) return rejectCredentials()

    // Claiming the step is what enforces single use. If two requests present
    // the same code at once, exactly one of them wins here.
    const claimed = await adminStore.consumeAdminUserTotpStep(admin.id, attempt.step)
    if (!claimed) return rejectCredentials()

    // First accepted code confirms enrolment: the secret is only proven to
    // have reached the authenticator app once a code produced by it arrives.
    if (!admin.totpConfirmedAt) await adminStore.confirmAdminUserTotp(admin.id, attempt.step)
  } else {
    return sendError(
      response,
      API_ERROR_CODES.ADMIN_TOTP_REQUIRED,
      'A verification code from your authenticator app is required.',
      401,
    )
  }

  await adminStore.registerAdminLoginSuccess(admin.id)
  const session = await issueAdminSession(request, admin.id)

  return sendData(
    response,
    {
      admin: {
        displayName: admin.displayName || admin.username,
        id: admin.id,
        // Surfaced so the dashboard can warn before the envelope runs out.
        recoveryCodesLeft,
        username: admin.username,
      },
      session,
    },
    201,
  )
})

// Exchanges the static ADMIN_TOKEN for a short-lived session. This is the only
// admin route that accepts the static token unconditionally — everything else
// goes through requireAdmin, which will stop accepting it once
// ADMIN_ALLOW_STATIC_TOKEN=false.
app.post('/api/admin/session', async (request, response) => {
  if (!isAdminToken(getAuthToken(request))) {
    return sendError(
      response,
      API_ERROR_CODES.ADMIN_AUTH_REQUIRED,
      'Admin authorization is required.',
      401,
    )
  }

  if (typeof adminStore?.createAdminSession !== 'function') {
    return sendError(
      response,
      API_ERROR_CODES.SERVICE_UNAVAILABLE,
      'Admin data store is not configured.',
      503,
    )
  }

  // No admin_user_id: a session minted from the shared token has no person
  // behind it, and the audit trail says so rather than guessing.
  return sendData(response, { session: await issueAdminSession(request, null) }, 201)
})

// Who the caller is, as the server sees them. The dashboard uses it to show the
// signed-in name; it is also the quickest way for an operator to check whether
// a token in their hand is a person's session or the shared one.
app.get('/api/admin/me', requireAdmin, async (_request, response) => {
  const { adminUserId = null, kind, username = null } = _request.adminAuth || {}

  return sendData(response, {
    admin: {
      id: adminUserId,
      kind,
      username,
    },
  })
})

app.get('/api/admin/users', requireAdmin, async (_request, response) => {
  if (!adminAccountsAvailable()) {
    return sendError(
      response,
      API_ERROR_CODES.SERVICE_UNAVAILABLE,
      'Admin data store is not configured.',
      503,
    )
  }

  return sendData(response, { users: await adminStore.listAdminUsers() })
})

// Creates another named admin. The TOTP secret and the recovery codes are
// returned exactly once, here: they are stored hashed (codes) or write-only
// (secret) and there is deliberately no endpoint that reads them back.
app.post('/api/admin/users', requireAdmin, async (request, response) => {
  if (!adminAccountsAvailable()) {
    return sendError(
      response,
      API_ERROR_CODES.SERVICE_UNAVAILABLE,
      'Admin data store is not configured.',
      503,
    )
  }

  const username = String(request.body?.username ?? '').trim().toLowerCase().slice(0, 80)
  const displayName = String(request.body?.displayName ?? '').trim().slice(0, 120)
  const password = String(request.body?.password ?? '')

  if (!/^[a-z0-9][a-z0-9._-]{2,79}$/.test(username)) {
    return sendError(
      response,
      API_ERROR_CODES.VALIDATION_ERROR,
      'Username must be 3-80 characters: letters, digits, dot, dash or underscore.',
      400,
    )
  }

  const passwordProblem = describePasswordProblem(password, { displayName: displayName || username })
  if (passwordProblem) {
    return sendError(response, API_ERROR_CODES.VALIDATION_ERROR, passwordProblem, 400)
  }

  if (await adminStore.getAdminUserByUsername(username)) {
    return sendError(
      response,
      API_ERROR_CODES.ADMIN_USERNAME_TAKEN,
      'That admin username is already in use.',
      409,
    )
  }

  const totpSecret = generateTotpSecret()
  const recoveryCodes = generateRecoveryCodes()
  const created = await adminStore.createAdminUser({
    displayName: displayName || null,
    id: createId(),
    passwordHash: await hashPassword(password),
    recoveryCodeHashes: recoveryCodes.map(hashRecoveryCode),
    totpSecret,
    username,
  })

  return sendData(
    response,
    {
      enrolment: {
        otpauthUrl: buildOtpAuthUrl({ account: username, secret: totpSecret }),
        recoveryCodes,
        totpSecret,
      },
      user: { id: created.id, username: created.username },
    },
    201,
  )
})

// Disable / re-enable. Disabling also drops the account's live sessions, so it
// takes effect now rather than whenever the session would have expired.
app.patch('/api/admin/users/:id', requireAdmin, async (request, response) => {
  if (!adminAccountsAvailable()) {
    return sendError(
      response,
      API_ERROR_CODES.SERVICE_UNAVAILABLE,
      'Admin data store is not configured.',
      503,
    )
  }

  const disabled = request.body?.disabled
  if (typeof disabled !== 'boolean') {
    return sendError(response, API_ERROR_CODES.VALIDATION_ERROR, 'disabled must be a boolean.', 400)
  }

  // Disabling the account you are signed in as would revoke the session making
  // the request: the call would appear to fail while having succeeded, and if
  // it were the last enabled account nobody could undo it.
  if (disabled && request.adminAuth?.adminUserId === request.params.id) {
    return sendError(
      response,
      API_ERROR_CODES.VALIDATION_ERROR,
      'You cannot disable the account you are signed in as.',
      400,
    )
  }

  const updated = await adminStore.setAdminUserDisabled(request.params.id, disabled)
  if (!updated) {
    return sendError(
      response,
      API_ERROR_CODES.ADMIN_USER_NOT_FOUND,
      'Admin user not found.',
      404,
    )
  }

  return sendData(response, { users: await adminStore.listAdminUsers() })
})

// Fresh recovery codes for the signed-in account. Issuing a new set voids the
// old one, which is what you want after using one or losing the paper.
app.post('/api/admin/me/recovery-codes', requireAdmin, async (request, response) => {
  const adminUserId = request.adminAuth?.adminUserId
  if (!adminUserId) {
    return sendError(
      response,
      API_ERROR_CODES.ADMIN_AUTH_REQUIRED,
      'Recovery codes belong to a named admin account; sign in as one first.',
      403,
    )
  }

  const recoveryCodes = generateRecoveryCodes()
  await adminStore.replaceAdminRecoveryCodes(adminUserId, recoveryCodes.map(hashRecoveryCode))

  return sendData(response, { recoveryCodes })
})

// Re-enrolling an authenticator, without SSH.
//
// The most ordinary thing that happens to a TOTP setup is that the phone it
// lives on is replaced, wiped or lost, and until now the only answer was
// scripts/admin-user.mjs on the VPS. That is a bad answer twice over: it needs
// shell access to recover from a routine event, and it is the reason nobody
// ever saw a QR code -- the CLI prints a secret as text, so every enrolment so
// far has been a manual key entry.
//
// Two steps, because a one-step reset can lock you out of the account it was
// meant to rescue: a mis-scan would replace the working secret with one no
// phone holds. Step one parks a *candidate* secret; step two promotes it, and
// only a code generated from the candidate can do the promoting.
//
// Both steps sit behind requireAdmin *and* the account's own password. The
// session alone is deliberately not enough: sessions minted from the shared
// ADMIN_TOKEN have no person behind them, and one of those must not be able to
// silently move a named account's second factor onto a new device.
const ADMIN_TOTP_ENROLMENT_TTL_MS = Math.max(
  minutes(2),
  Number(process.env.ADMIN_TOTP_ENROLMENT_TTL_MS || minutes(10)),
)

const findEnrolmentTarget = async (request) => {
  const username = String(request.body?.username ?? '').trim().toLowerCase().slice(0, 80)
  const admin = username ? await adminStore.getAdminUserByUsername(username) : null
  return { admin, username }
}

app.post('/api/admin/totp/enrolment', requireAdmin, async (request, response) => {
  if (!adminAccountsAvailable()) {
    return sendError(
      response,
      API_ERROR_CODES.SERVICE_UNAVAILABLE,
      'Admin data store is not configured.',
      503,
    )
  }

  const { admin } = await findEnrolmentTarget(request)
  const password = String(request.body?.password ?? '')
  // One derivation whatever happens, so an unknown username costs the same as
  // a wrong password and this cannot be used to enumerate accounts.
  const passwordMatches = await verifyPassword(password, admin?.passwordHash ?? dummyPasswordHash)

  if (!admin || admin.disabledAt || !passwordMatches) {
    return sendError(
      response,
      API_ERROR_CODES.VALIDATION_ERROR,
      'Username or password is incorrect.',
      401,
    )
  }

  const totpSecret = generateTotpSecret()
  const expiresAt = new Date(Date.now() + ADMIN_TOTP_ENROLMENT_TTL_MS)
  await adminStore.startAdminUserTotpEnrolment(admin.id, { expiresAt, totpSecret })

  return sendData(response, {
    enrolment: {
      expiresAt: expiresAt.toISOString(),
      otpauthUrl: buildOtpAuthUrl({ account: admin.username, secret: totpSecret }),
      // Shown alongside the QR for the case the QR cannot be scanned -- a
      // desktop authenticator, a camera that will not focus, a printed page.
      totpSecret,
    },
  })
})

app.post('/api/admin/totp/enrolment/confirm', requireAdmin, async (request, response) => {
  if (!adminAccountsAvailable()) {
    return sendError(
      response,
      API_ERROR_CODES.SERVICE_UNAVAILABLE,
      'Admin data store is not configured.',
      503,
    )
  }

  const { admin } = await findEnrolmentTarget(request)
  const password = String(request.body?.password ?? '')
  const totp = String(request.body?.totp ?? '').trim().slice(0, 12)
  const passwordMatches = await verifyPassword(password, admin?.passwordHash ?? dummyPasswordHash)

  if (!admin || admin.disabledAt || !passwordMatches) {
    return sendError(
      response,
      API_ERROR_CODES.VALIDATION_ERROR,
      'Username or password is incorrect.',
      401,
    )
  }

  if (!admin.pendingTotpSecret || new Date(admin.pendingTotpExpiresAt || 0) <= new Date()) {
    return sendError(
      response,
      API_ERROR_CODES.VALIDATION_ERROR,
      'This enrolment has expired. Start again to get a new QR code.',
      400,
    )
  }

  // afterStep is not carried over from the live secret: the candidate is a
  // different secret, so its steps have never been used. Replay protection for
  // it begins at the step this confirmation claims, which is written below.
  const attempt = verifyTotp(admin.pendingTotpSecret, totp)
  if (!attempt.ok) {
    return sendError(
      response,
      API_ERROR_CODES.VALIDATION_ERROR,
      'That code does not match the new QR code. Check the clock on your phone and try the next one.',
      401,
    )
  }

  const recoveryCodes = generateRecoveryCodes()
  const promoted = await adminStore.confirmAdminUserTotpEnrolment(admin.id, {
    recoveryCodeHashes: recoveryCodes.map(hashRecoveryCode),
    step: attempt.step,
  })

  if (!promoted) {
    return sendError(
      response,
      API_ERROR_CODES.VALIDATION_ERROR,
      'This enrolment is no longer valid. Start again to get a new QR code.',
      409,
    )
  }

  // Live sessions are left alone, matching reset-password rather than the
  // CLI's reset-totp. This flow is recovery from a lost phone, and the person
  // driving it just proved both factors; reset-totp drops sessions because it
  // is the answer to a *compromise*, where the point is to evict whoever else
  // is holding one.
  return sendData(response, { recoveryCodes })
})

// The audit trail, now with an actor. Rows written before named accounts
// existed (or by a script still using the shared token) report a null actor,
// which is the honest answer rather than a guess.
app.get('/api/admin/actions', requireAdmin, async (request, response) => {
  if (typeof adminStore?.listAdminActions !== 'function') {
    return sendError(
      response,
      API_ERROR_CODES.SERVICE_UNAVAILABLE,
      'Admin data store is not configured.',
      503,
    )
  }

  const limit = Math.min(200, Math.max(1, Number(request.query?.limit) || 50))
  return sendData(response, { actions: await adminStore.listAdminActions(limit) })
})

app.delete('/api/admin/session', requireAdmin, async (request, response) => {
  if (request.adminAuth?.kind === 'session') {
    await adminStore.deleteAdminSession(hashToken(getAuthToken(request)))
  }

  return sendData(response, { ok: true })
})

app.get('/api/admin/sessions', requireAdmin, async (_request, response) => {
  sendData(response, { sessions: await adminStore.listAdminSessions() })
})

app.get('/api/admin/summary', requireAdmin, async (_request, response) => {
  sendData(response, { summary: await adminStore.getSummary() })
})

// The dashboard's single data source. Everything it draws comes from here, so
// the view has one loading state and one failure mode instead of eleven.
//
// The `system` block is measured here rather than read out of the database:
// process uptime and the round-trip to Postgres are properties of the running
// process, and they are exactly the two numbers that say "the page is stale
// because the service restarted" or "the page is slow because the database
// is". Nothing in it is a secret -- no connection string, no token, no
// environment values, only whether the pieces are configured at all.
app.get('/api/admin/overview', requireAdmin, async (request, response) => {
  if (typeof adminStore?.getOverview !== 'function') {
    return sendError(
      response,
      API_ERROR_CODES.SERVICE_UNAVAILABLE,
      'Admin data store is not configured.',
      503,
    )
  }

  const days = Number(request.query?.days) || 30
  const startedAt = Date.now()
  const overview = await adminStore.getOverview({ days })
  const memory = process.memoryUsage()

  return sendData(response, {
    overview: {
      ...overview,
      system: {
        // Round trip for the whole aggregate, not a synthetic ping: it is the
        // number that degrades first when the database is in trouble.
        databaseLatencyMs: Date.now() - startedAt,
        // Aggregate CSP violation count since the last restart. A number that
        // climbs is a policy that is blocking something real.
        cspReports: [...cspReportCounts.values()].reduce((sum, count) => sum + count, 0),
        emailConfigured: isEmailDeliveryConfigured(),
        nodeVersion: process.version,
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        startedAt: new Date(Date.now() - Math.round(process.uptime() * 1000)).toISOString(),
        uptimeSeconds: Math.round(process.uptime()),
      },
    },
  })
})

// Reports what the app actually resolved for the caller's address, so an
// operator can confirm the trust-proxy hop count matches the real chain. A
// wrong count silently collapses every IP rate limit into one global bucket
// and writes the proxy's address into the audit trail. Admin-gated because the
// forwarding headers can carry internal topology.
app.get('/api/admin/diagnostics', requireAdmin, (request, response) => {
  sendData(response, {
    diagnostics: {
      forwardedFor: request.get('X-Forwarded-For') || null,
      forwardedProto: request.get('X-Forwarded-Proto') || null,
      protocol: request.protocol,
      resolvedIp: request.ip,
      // If the resolved IP is not the leftmost untrusted entry you expect,
      // TRUST_PROXY_HOPS does not match the deployment.
      trustProxyHops: Number(process.env.TRUST_PROXY_HOPS || 1),
    },
  })
})

app.get('/api/admin/download-events', requireAdmin, async (_request, response) => {
  sendData(response, { events: await adminStore.listDownloadEvents() })
})

// ?status=pending drives the moderation queue; no status keeps the existing
// "everything" view the dashboard already renders.
app.get('/api/admin/comments', requireAdmin, async (request, response) => {
  const allowed = new Set(['published', 'pending', 'spam'])
  const status = allowed.has(request.query.status) ? request.query.status : ''

  sendData(response, { comments: await adminStore.listComments({ status }) })
})

app.patch('/api/admin/comments/:id', requireAdmin, async (request, response) => {
  const status = String(request.body?.status ?? '').trim()
  const allowed = new Set(['published', 'pending', 'spam'])

  if (!allowed.has(status)) {
    return sendError(response, API_ERROR_CODES.VALIDATION_ERROR, 'Invalid comment status.', 400)
  }

  const updated = await adminStore.setCommentStatus(request.params.id, status)
  if (!updated) {
    return sendError(response, API_ERROR_CODES.COMMENT_NOT_FOUND, 'Comment not found.', 404)
  }

  return sendData(response, { comment: updated })
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

// Opens every file the catalogue points at and reports what is actually there.
//
// Deliberately not folded into /api/admin/overview: that one is a handful of
// aggregate queries and is fetched on every dashboard load, while this does
// filesystem work per project and is only worth paying for when someone asks.
//
// It reads the same project list the admin table shows -- database overrides
// applied on top of the static catalogue -- because checking the source file
// would happily bless a project whose live model URL was overridden to
// something that does not exist.
app.get('/api/admin/content-health', requireAdmin, async (_request, response) => {
  const projects = await adminStore.listProjects(staticProjects)
  // Community uploads are checked from the same place, but they are optional:
  // the store is absent when the database is not configured, and a missing
  // method means an older deployment. Neither should take the whole report down.
  const uploads =
    typeof communityStore?.listUploadsForHealth === 'function'
      ? await communityStore.listUploadsForHealth()
      : []

  sendData(response, { health: await contentHealth.run(projects, uploads) })
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
    request.adminAuth?.adminUserId ?? null,
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
  const visitor = await adminStore.moderateVisitorProfile(
    request.params.id,
    fields,
    reason,
    request.adminAuth?.adminUserId ?? null,
  )
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

  // A rejection has to stop serving the file now, not once the gate's cache
  // entry ages out.
  invalidateUploadAccessCache(uploadRecord.fileUrl)
  invalidateUploadAccessCache(uploadRecord.previewUrl)

  return sendData(response, { upload: uploadRecord })
})

app.post('/api/admin/uploads', requireAdmin, upload.single('file'), async (request, response) => {
  if (!request.file) {
    return sendError(response, API_ERROR_CODES.VALIDATION_ERROR, 'Upload file is required.', 400)
  }

  if (await rejectOnSignatureMismatch(request, response)) return

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

  // Close the loop with the requester. Until now a decision was only visible
  // if they happened to come back and look at /account, which meant an
  // approved request could sit unnoticed indefinitely.
  if (status !== 'pending' && updated.email) {
    try {
      await sendDownloadDecisionEmail({
        approved: status === 'approved',
        displayName: updated.name,
        email: updated.email,
        projectTitle: updated.projectTitle,
      })
      await adminStore.markDownloadRequestNotified(updated.id)
    } catch (error) {
      // The decision itself is already committed; a mail failure must not
      // turn it into a 500 the admin would retry.
      console.error('Download decision notification failed:', error.message)
    }
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
    invalidateUploadAccessCache(deleted.file_url)
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
// Generated rather than shipped as static files so the canonical host follows
// PUBLIC_SITE_URL and the project list stays in sync with the database. The
// site had neither file, so crawlers had no entry point beyond the bare
// homepage and no signal about which paths are worth indexing.
const publicSiteUrl = (process.env.PUBLIC_SITE_URL || 'https://mrright.blog').replace(/\/$/, '')

app.get('/robots.txt', (_request, response) => {
  response.type('text/plain').send(
    [
      'User-agent: *',
      // Account, admin, and auth pages are per-user or privileged; there is
      // nothing there for an index and crawling them only burns budget.
      'Disallow: /admin',
      'Disallow: /account',
      'Disallow: /login',
      'Disallow: /api/',
      'Allow: /',
      '',
      `Sitemap: ${publicSiteUrl}/sitemap.xml`,
      '',
    ].join('\n'),
  )
})

// Projects and community posts are listed one URL each -- the pages a crawler
// cannot enumerate from the homepage without running JavaScript. Cached briefly
// because a sitemap fetch is a full catalogue read plus a full post listing,
// and crawlers do not coordinate with each other.
const sitemapCacheMs = 5 * 60 * 1000
let sitemapCache = { body: '', expiresAt: 0 }

app.get('/sitemap.xml', async (_request, response) => {
  if (sitemapCache.body && Date.now() < sitemapCache.expiresAt) {
    return response.type('application/xml').send(sitemapCache.body)
  }

  const entries = [
    { changefreq: 'weekly', loc: '/', priority: '1.0' },
    { changefreq: 'daily', loc: '/community', priority: '0.8' },
  ]

  // Projects were listed here as `/?project=<slug>` until 2026-08-26, which was
  // wrong: nothing read that query parameter, so all four URLs served the
  // homepage. They now have a route of their own and are listed under it.
  //
  // Public profiles are deliberately absent: listing them would enumerate
  // registered users, which the /api/users/:handle responses go out of their
  // way to prevent. They stay indexable when linked to -- see the SEO handler
  // below, which serves them with a canonical URL.
  try {
    const projects = (await projectStore?.listProjects(staticProjects)) || []
    for (const project of projects) {
      entries.push({
        changefreq: 'monthly',
        loc: `/projects/${encodeURIComponent(project.slug)}`,
        priority: '0.7',
      })
    }
  } catch (error) {
    console.error('Sitemap project listing failed:', error.message)
  }

  try {
    const posts = (await communityStore?.listPosts()) || []
    for (const post of posts) {
      entries.push({
        changefreq: 'weekly',
        lastmod: post.updatedAt || post.createdAt || '',
        loc: `/community/${encodeURIComponent(post.id)}`,
        priority: '0.6',
      })
    }
  } catch (error) {
    console.error('Sitemap community listing failed:', error.message)
  }

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map((entry) =>
      [
        '  <url>',
        `    <loc>${publicSiteUrl}${entry.loc}</loc>`,
        ...(entry.lastmod ? [`    <lastmod>${entry.lastmod}</lastmod>`] : []),
        `    <changefreq>${entry.changefreq}</changefreq>`,
        `    <priority>${entry.priority}</priority>`,
        '  </url>',
      ].join('\n'),
    ),
    '</urlset>',
    '',
  ].join('\n')

  sitemapCache = { body, expiresAt: Date.now() + sitemapCacheMs }
  response.type('application/xml').send(body)
})

// index: false so `/` falls through to the SEO handler below instead of being
// answered here with the unmodified template.
app.use(express.static(distDir, { index: false, setHeaders: setStaticCacheHeaders }))

// The built template, re-read only when it changes on disk. A deploy restarts
// the service so this could be read once, but a local `npm run build` against a
// running server should not need a restart to be visible.
let indexTemplateCache = { html: '', mtimeMs: 0 }

const readIndexTemplate = async () => {
  const { mtimeMs } = await stat(distIndexPath)
  if (indexTemplateCache.html && indexTemplateCache.mtimeMs === mtimeMs) {
    return indexTemplateCache.html
  }

  const html = await readFile(distIndexPath, 'utf8')
  indexTemplateCache = { html, mtimeMs }
  return html
}

// The /community post list, for the <noscript> index. Same reasoning as the
// sitemap cache: it is one query serving anonymous, identical output.
const communityListCacheMs = 60 * 1000
let communityListCache = { expiresAt: 0, posts: [] }

const recentPostsForNoscript = async () => {
  if (Date.now() < communityListCache.expiresAt) return communityListCache.posts

  const posts = ((await communityStore?.listPosts()) || []).slice(0, 30)
  communityListCache = { expiresAt: Date.now() + communityListCacheMs, posts }
  return posts
}

// Everything a route's head needs, plus whether the URL names something that
// does not exist. A store that is missing or throwing is "unknown", not
// "missing": a database blip must not turn a real post into a 404 that a
// crawler then remembers.
const loadSeoData = async (route) => {
  if (route.kind === 'community') return { posts: await recentPostsForNoscript() }

  if (route.kind === 'post') {
    if (!communityStore) return {}
    const post = await communityStore.getPost(route.postId)
    return post ? { post } : { missing: true }
  }

  if (route.kind === 'project') {
    if (!projectStore) return {}
    // listProjects (and so getProject) drops is_public = false by default, so a
    // hidden project is "missing" here on purpose -- it must not be indexed and
    // must not answer 200.
    const project = await projectStore.getProject(staticProjects, route.slug)
    return project ? { project } : { missing: true }
  }

  if (route.kind === 'profile') {
    if (!authStore) return {}
    // Named to stay clear of the static `profile` imported from content.js.
    const publicProfile = await authStore.getUserByHandle(route.handle)
    if (!publicProfile || publicProfile.profileAdminDisabled) return { missing: true }
    return { profile: publicProfile }
  }

  return {}
}

app.get(/.*/, async (request, response) => {
  setNoStoreHeaders(response)

  let template
  try {
    template = await readIndexTemplate()
  } catch (error) {
    console.error('Reading the built index.html failed:', error.message)
    return response.status(503).type('text/plain').send('Site build unavailable.')
  }

  const route = resolveRoute(request.path)

  let data = {}
  try {
    data = await loadSeoData(route)
  } catch (error) {
    console.error(`SEO lookup failed for ${request.path}:`, error.message)
  }

  // A real 404 only when the lookup positively said "no such post/profile".
  // Unmatched paths still answer 200 and render the homepage, as they always
  // have; they are kept out of the index with noindex instead, because this
  // file does not know the client router's full route table.
  if (data.missing) response.status(404)

  return response.type('html').send(
    renderSeoHtml({
      // The site owner, for the Person/author nodes in the JSON-LD graph. Named
      // `owner` here because `profile` in this file is that same static record,
      // while `data.profile` is a visitor's public profile.
      owner: profile,
      post: data.post || null,
      posts: data.posts || [],
      profile: data.profile || null,
      project: data.project || null,
      route,
      siteUrl: publicSiteUrl,
      template,
    }),
  )
})

// Expired sessions cannot authenticate (getSessionUser filters on expires_at)
// but nothing ever deleted them, so visitor_sessions grew without bound. Sweep
// on an interval instead of per-request so a slow DELETE never sits in a
// request path. unref() keeps the timer from holding the process open.
const sessionSweepIntervalMs = Number(process.env.SESSION_SWEEP_INTERVAL_MS || 6 * 60 * 60 * 1000)

const sweepExpiredSessions = async () => {
  const sweeps = [
    ['visitor session', authStore?.deleteExpiredSessions],
    ['admin session', adminStore?.deleteExpiredAdminSessions],
    ['download ticket', downloadRequestsStore?.deleteExpiredDownloadTickets],
  ]

  for (const [label, sweep] of sweeps) {
    if (typeof sweep !== 'function') continue

    try {
      const removed = await sweep()
      if (removed > 0) console.log(`Removed ${removed} expired ${label}(s).`)
    } catch (error) {
      console.error(`Expired ${label} sweep failed:`, error.message)
    }
  }
}

if (typeof authStore?.deleteExpiredSessions === 'function' && sessionSweepIntervalMs > 0) {
  sweepExpiredSessions()
  setInterval(sweepExpiredSessions, sessionSweepIntervalMs).unref()
}

// Startup configuration self-check.
//
// Every item here is something that fails silently at runtime: the site keeps
// serving pages while a security control quietly does nothing. Warnings go to
// the journal at boot so a misconfigured deploy is visible immediately instead
// of during the incident it causes.
const reportConfigurationWarnings = () => {
  const warnings = []

  if (!process.env.DATABASE_URL) {
    warnings.push('DATABASE_URL is unset — visitor accounts, community, and admin are disabled.')
  }

  if (!process.env.ADMIN_TOKEN) {
    warnings.push('ADMIN_TOKEN is unset — every admin route will reject all callers.')
  }

  if (!process.env.VISITOR_ID_SECRET) {
    warnings.push(
      'VISITOR_ID_SECRET is unset — anonymous like de-duplication resets on every restart. ' +
        'Set it to any long random string to make it stable.',
    )
  }

  if (!isEmailDeliveryConfigured()) {
    warnings.push(
      'SMTP is not configured — verification, password reset, and download decision emails ' +
        'cannot be delivered.',
    )
  }

  if (!process.env.CORS_ORIGIN) {
    warnings.push('CORS_ORIGIN is unset — falling back to the built-in origin list.')
  }

  if (!process.env.TRUST_PROXY_HOPS) {
    warnings.push(
      'TRUST_PROXY_HOPS is unset (defaulting to 1). If Cloudflare sits in front of nginx the ' +
        'real chain is 2 hops, and every IP rate limit collapses into one bucket. ' +
        'Verify with GET /api/admin/diagnostics.',
    )
  }

  if (warnings.length === 0) {
    console.log('Configuration self-check: no warnings.')
    return
  }

  console.warn(`Configuration self-check found ${warnings.length} issue(s):`)
  warnings.forEach((warning) => console.warn(`  - ${warning}`))
}

app.listen(port, () => {
  console.log(`Portfolio server listening on http://localhost:${port}`)
  reportConfigurationWarnings()
})
