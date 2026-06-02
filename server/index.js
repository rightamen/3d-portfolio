import cors from 'cors'
import express from 'express'
import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { experience, profile, projects, skills } from './content.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const dataDir = path.join(rootDir, 'data')
const messagesFile = path.join(dataDir, 'messages.jsonl')
const distDir = path.join(rootDir, 'dist')

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
