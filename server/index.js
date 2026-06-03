import cors from 'cors'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createContactMessagesStore } from './contactMessagesStore.js'
import { experience, profile, projects, skills } from './content.js'
import { createDownloadRequestsStore } from './downloadRequestsStore.js'
import { createInteractionsStore } from './interactionsStore.js'
import { createPostgresStores } from './postgresStores.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const dataDir = path.join(rootDir, 'data')
const distDir = path.join(rootDir, 'dist')
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const stores = process.env.DATABASE_URL
  ? await createPostgresStores(process.env.DATABASE_URL)
  : {
      adminStore: null,
      contactMessagesStore: createContactMessagesStore(dataDir),
      downloadRequestsStore: createDownloadRequestsStore(dataDir),
      interactionsStore: createInteractionsStore(dataDir),
    }

const { adminStore, contactMessagesStore, downloadRequestsStore, interactionsStore } = stores

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
  response.json({ projects })
})

app.get('/api/projects/:slug', (request, response) => {
  const project = projects.find((item) => item.slug === request.params.slug)

  if (!project) {
    return response.status(404).json({
      error: 'Project not found.',
    })
  }

  return response.json({ project })
})

app.get('/api/projects/:slug/interactions', async (request, response) => {
  const project = projects.find((item) => item.slug === request.params.slug)

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
  const project = projects.find((item) => item.slug === request.params.slug)
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
  const project = projects.find((item) => item.slug === request.params.slug)
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
  const project = projects.find((item) => item.slug === request.params.slug)
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

app.use(express.static(distDir))

app.get(/.*/, (_request, response) => {
  response.sendFile(path.join(distDir, 'index.html'))
})

app.listen(port, () => {
  console.log(`Portfolio server listening on http://localhost:${port}`)
})
