import pg from 'pg'

const { Pool } = pg

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const toComment = (row) => ({
  id: row.id,
  projectSlug: row.project_slug,
  author: row.author,
  message: row.message,
  createdAt: row.created_at.toISOString(),
})

const ensureSchema = async (pool) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contact_messages (
      id text PRIMARY KEY,
      name text NOT NULL,
      email text NOT NULL,
      message text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS project_likes (
      project_slug text NOT NULL,
      visitor_id text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (project_slug, visitor_id)
    );

    CREATE TABLE IF NOT EXISTS project_comments (
      id text PRIMARY KEY,
      project_slug text NOT NULL,
      author text NOT NULL,
      message text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS project_comments_slug_created_idx
      ON project_comments (project_slug, created_at);

    CREATE TABLE IF NOT EXISTS download_requests (
      id text PRIMARY KEY,
      status text NOT NULL DEFAULT 'pending',
      project_slug text NOT NULL,
      project_title text NOT NULL,
      name text NOT NULL,
      email text NOT NULL,
      purpose text NOT NULL,
      ip text,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS download_requests_status_created_idx
      ON download_requests (status, created_at);
  `)
}

export const createPostgresStores = async (databaseUrl) => {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: Number(process.env.PG_POOL_MAX || 2),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  })

  await ensureSchema(pool)

  const contactMessagesStore = {
    addMessage: async (message) => {
      const id = createId()
      const result = await pool.query(
        `
          INSERT INTO contact_messages (id, name, email, message)
          VALUES ($1, $2, $3, $4)
          RETURNING id, created_at
        `,
        [id, message.name, message.email, message.message],
      )

      return {
        id,
        ...message,
        createdAt: result.rows[0].created_at.toISOString(),
      }
    },
  }

  const interactionsStore = {
    getProjectState: async (slug) => {
      const [likesResult, commentsResult] = await Promise.all([
        pool.query('SELECT count(*)::int AS count FROM project_likes WHERE project_slug = $1', [
          slug,
        ]),
        pool.query(
          `
            SELECT id, author, message, created_at
            FROM project_comments
            WHERE project_slug = $1
            ORDER BY created_at ASC
            LIMIT 100
          `,
          [slug],
        ),
      ])

      return {
        likes: Array.from({ length: likesResult.rows[0].count }, (_, index) => String(index)),
        comments: commentsResult.rows.map(toComment),
      }
    },

    toggleLike: async (slug, visitorId) => {
      const client = await pool.connect()

      try {
        await client.query('BEGIN')
        const deleted = await client.query(
          `
            DELETE FROM project_likes
            WHERE project_slug = $1 AND visitor_id = $2
            RETURNING visitor_id
          `,
          [slug, visitorId],
        )

        const liked = deleted.rowCount === 0

        if (liked) {
          await client.query(
            `
              INSERT INTO project_likes (project_slug, visitor_id)
              VALUES ($1, $2)
              ON CONFLICT DO NOTHING
            `,
            [slug, visitorId],
          )
        }

        const countResult = await client.query(
          'SELECT count(*)::int AS count FROM project_likes WHERE project_slug = $1',
          [slug],
        )
        await client.query('COMMIT')

        return {
          liked,
          likeCount: countResult.rows[0].count,
        }
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },

    addComment: async (slug, comment) => {
      const id = createId()
      const result = await pool.query(
        `
          INSERT INTO project_comments (id, project_slug, author, message)
          VALUES ($1, $2, $3, $4)
          RETURNING id, author, message, created_at
        `,
        [id, slug, comment.author, comment.message],
      )

      return toComment(result.rows[0])
    },
  }

  const downloadRequestsStore = {
    addRequest: async (request) => {
      const id = createId()
      const result = await pool.query(
        `
          INSERT INTO download_requests
            (id, status, project_slug, project_title, name, email, purpose, ip)
          VALUES ($1, 'pending', $2, $3, $4, $5, $6, $7)
          RETURNING id, status, created_at
        `,
        [
          id,
          request.projectSlug,
          request.projectTitle,
          request.name,
          request.email,
          request.purpose,
          request.ip,
        ],
      )

      return {
        id,
        status: result.rows[0].status,
        ...request,
        createdAt: result.rows[0].created_at.toISOString(),
      }
    },
  }

  const adminStore = {
    getSummary: async () => {
      const result = await pool.query(`
        SELECT
          (SELECT count(*)::int FROM project_comments) AS comments,
          (SELECT count(*)::int FROM project_likes) AS likes,
          (SELECT count(*)::int FROM download_requests) AS download_requests,
          (SELECT count(*)::int FROM download_requests WHERE status = 'pending') AS pending_downloads,
          (SELECT count(*)::int FROM contact_messages) AS contact_messages
      `)

      return result.rows[0]
    },

    listComments: async () => {
      const result = await pool.query(`
        SELECT id, project_slug, author, message, created_at
        FROM project_comments
        ORDER BY created_at DESC
        LIMIT 100
      `)

      return result.rows.map(toComment)
    },

    listContactMessages: async () => {
      const result = await pool.query(`
        SELECT id, name, email, message, created_at
        FROM contact_messages
        ORDER BY created_at DESC
        LIMIT 100
      `)

      return result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        message: row.message,
        createdAt: row.created_at.toISOString(),
      }))
    },

    listDownloadRequests: async () => {
      const result = await pool.query(`
        SELECT id, status, project_slug, project_title, name, email, purpose, ip, created_at
        FROM download_requests
        ORDER BY created_at DESC
        LIMIT 100
      `)

      return result.rows.map((row) => ({
        id: row.id,
        status: row.status,
        projectSlug: row.project_slug,
        projectTitle: row.project_title,
        name: row.name,
        email: row.email,
        purpose: row.purpose,
        ip: row.ip,
        createdAt: row.created_at.toISOString(),
      }))
    },

    updateDownloadRequestStatus: async (id, status) => {
      const result = await pool.query(
        `
          UPDATE download_requests
          SET status = $2
          WHERE id = $1
          RETURNING id, status
        `,
        [id, status],
      )

      return result.rows[0] || null
    },
  }

  return {
    adminStore,
    close: () => pool.end(),
    contactMessagesStore,
    downloadRequestsStore,
    interactionsStore,
  }
}
