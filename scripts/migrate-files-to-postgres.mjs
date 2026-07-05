import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { createPostgresStores } from '../server/postgresStores.js'

const { Pool } = pg

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const dataDir = process.env.DATA_DIR || path.join(rootDir, 'data')
const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required.')
}

const pool = new Pool({
  connectionString: databaseUrl,
  max: 1,
})

const readJsonl = async (fileName) => {
  try {
    const raw = await readFile(path.join(dataDir, fileName), 'utf8')
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

const readJson = async (fileName, fallback) => {
  try {
    const raw = await readFile(path.join(dataDir, fileName), 'utf8')
    return JSON.parse(raw)
  } catch (error) {
    if (error.code === 'ENOENT') return fallback
    throw error
  }
}

const migrate = async () => {
  const stores = await createPostgresStores(databaseUrl)
  await stores.close()

  const messages = await readJsonl('messages.jsonl')
  const downloadRequests = await readJsonl('download-requests.jsonl')
  const interactions = await readJson('project-interactions.json', {})

  for (const message of messages) {
    await pool.query(
      `
        INSERT INTO contact_messages (id, name, email, message, created_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO NOTHING
      `,
      [
        message.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        message.name,
        message.email,
        message.message,
        message.createdAt || new Date().toISOString(),
      ],
    )
  }

  for (const request of downloadRequests) {
    await pool.query(
      `
        INSERT INTO download_requests
          (id, status, project_slug, project_title, name, email, purpose, ip, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO NOTHING
      `,
      [
        request.id,
        request.status || 'pending',
        request.projectSlug,
        request.projectTitle,
        request.name,
        request.email,
        request.purpose,
        request.ip,
        request.createdAt || new Date().toISOString(),
      ],
    )
  }

  for (const [projectSlug, state] of Object.entries(interactions)) {
    for (const visitorId of state.likes || []) {
      await pool.query(
        `
          INSERT INTO project_likes (project_slug, visitor_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `,
        [projectSlug, visitorId],
      )
    }

    for (const comment of state.comments || []) {
      await pool.query(
        `
          INSERT INTO project_comments (id, project_slug, author, message, created_at)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (id) DO NOTHING
        `,
        [
          comment.id,
          projectSlug,
          comment.author,
          comment.message,
          comment.createdAt || new Date().toISOString(),
        ],
      )
    }
  }

  console.log(
    JSON.stringify({
      migrated: {
        messages: messages.length,
        downloadRequests: downloadRequests.length,
        interactionProjects: Object.keys(interactions).length,
      },
    }),
  )
}

try {
  await migrate()
} finally {
  await pool.end()
}
