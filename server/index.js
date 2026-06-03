import cors from 'cors'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createContactMessagesStore } from './contactMessagesStore.js'
import { experience, profile, projects as staticProjects, skills } from './content.js'
import { createDownloadRequestsStore } from './downloadRequestsStore.js'
import { createInteractionsStore } from './interactionsStore.js'
import { createPostgresStores } from './postgresStores.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const dataDir = path.join(rootDir, 'data')
const distDir = path.join(rootDir, 'dist')
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const stores = process.env.DATABASE_URL
  ? await createPostgresStores(process.env.DATABASE_URL)
  : {
      adminStore: null,
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
  contactMessagesStore,
  downloadRequestsStore,
  interactionsStore,
  projectStore,
} = stores

const app = express()
const port = process.env.PORT || 4173

app.use(cors({ origin: process.env.CORS_ORIGIN || true }))
app.use(express.json({ limit: '32kb' }))

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, service: 'mrright-portfolio' })
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

  const result = await interactionsStore.toggleLike(project.slug, visitorId)
  return response.json(result)
})

app.post('/api/projects/:slug/comments', async (request, response) => {
  const project = await projectStore.getProject(staticProjects, request.params.slug)
  const author = String(request.body?.author ?? '').trim().slice(0, 80)
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
  })
  return response.status(201).json({ comment })
})

app.post('/api/projects/:slug/download-requests', async (request, response) => {
  const project = await projectStore.getProject(staticProjects, request.params.slug)
  const name = String(request.body?.name ?? '').trim().slice(0, 120)
  const email = String(request.body?.email ?? '').trim().slice(0, 180)
  const purpose = String(request.body?.purpose ?? '').trim().slice(0, 1200)

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
    projectSlug: project.slug,
    projectTitle: project.title,
    name,
    email,
    purpose,
    ip: request.ip,
  })

  return response.status(201).json({
    ok: true,
    request: {
      id: downloadRequest.id,
      status: downloadRequest.status,
      createdAt: downloadRequest.createdAt,
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

app.get('/api/admin/contact-messages', requireAdmin, async (_request, response) => {
  response.json({ messages: await adminStore.listContactMessages() })
})

app.get('/api/admin/download-requests', requireAdmin, async (_request, response) => {
  response.json({ requests: await adminStore.listDownloadRequests() })
})

app.get('/api/admin/projects', requireAdmin, async (_request, response) => {
  response.json({ projects: await adminStore.listProjects(staticProjects) })
})

const normalizeProjectPayload = (body) => {
  const normalized = {
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

app.use(express.static(distDir))

app.get(/.*/, (_request, response) => {
  response.sendFile(path.join(distDir, 'index.html'))
})

app.listen(port, () => {
  console.log(`Portfolio server listening on http://localhost:${port}`)
})
