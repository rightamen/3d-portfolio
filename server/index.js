import cors from 'cors'
import express from 'express'
import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { experience, profile, projects, skills } from './content.js'
import { createDownloadRequestsStore } from './downloadRequestsStore.js'
import { createInteractionsStore } from './interactionsStore.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const dataDir = path.join(rootDir, 'data')
const messagesFile = path.join(dataDir, 'messages.jsonl')
const distDir = path.join(rootDir, 'dist')
const downloadRequestsStore = createDownloadRequestsStore(dataDir)
const interactionsStore = createInteractionsStore(dataDir)
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const app = express()
const port = process.env.PORT || 4173

app.use(cors({ origin: process.env.CORS_ORIGIN || true }))
app.use(express.json({ limit: '32kb' }))

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, service: 'mrright-portfolio' })
})

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

  await mkdir(dataDir, { recursive: true })
  await appendFile(messagesFile, `${JSON.stringify(normalized)}\n`, 'utf8')

  return response.status(201).json({ ok: true })
})

app.use(express.static(distDir))

app.get(/.*/, (_request, response) => {
  response.sendFile(path.join(distDir, 'index.html'))
})

app.listen(port, () => {
  console.log(`Portfolio server listening on http://localhost:${port}`)
})
