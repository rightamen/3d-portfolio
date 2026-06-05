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

const toProjectOverride = (row) => ({
  assetCategory: row.asset_category,
  downloadPolicy: row.download_policy,
  downloadPolicyEn: row.download_policy_en,
  downloadPolicyJa: row.download_policy_ja,
  downloadPolicyZh: row.download_policy_zh,
  format: row.format,
  formatEn: row.format_en,
  formatJa: row.format_ja,
  formatZh: row.format_zh,
  image: row.image,
  isPublic: row.is_public,
  modelSize: row.model_size,
  modelSizeEn: row.model_size_en,
  modelSizeJa: row.model_size_ja,
  modelSizeZh: row.model_size_zh,
  modelUrl: row.model_url,
  slug: row.slug,
  stack: row.stack,
  summary: row.summary,
  summaryEn: row.summary_en,
  summaryJa: row.summary_ja,
  summaryZh: row.summary_zh,
  title: row.title,
  titleEn: row.title_en,
  titleJa: row.title_ja,
  titleZh: row.title_zh,
  viewerFeatures: row.viewer_features,
  workflow: row.workflow,
  workflowEn: row.workflow_en,
  workflowJa: row.workflow_ja,
  workflowZh: row.workflow_zh,
  year: row.year,
})

const toCustomProject = (row) => ({
  assetCategory: row.asset_category,
  downloadPolicy: row.download_policy,
  downloadPolicyEn: row.download_policy_en,
  downloadPolicyJa: row.download_policy_ja,
  downloadPolicyZh: row.download_policy_zh,
  format: row.format,
  formatEn: row.format_en,
  formatJa: row.format_ja,
  formatZh: row.format_zh,
  image: row.image,
  isPublic: row.is_public,
  modelSize: row.model_size,
  modelSizeEn: row.model_size_en,
  modelSizeJa: row.model_size_ja,
  modelSizeZh: row.model_size_zh,
  modelUrl: row.model_url,
  slug: row.slug,
  stack: row.stack || [],
  summary: row.summary,
  summaryEn: row.summary_en,
  summaryJa: row.summary_ja,
  summaryZh: row.summary_zh,
  title: row.title,
  titleEn: row.title_en,
  titleJa: row.title_ja,
  titleZh: row.title_zh,
  viewerFeatures: row.viewer_features || [],
  workflow: row.workflow,
  workflowEn: row.workflow_en,
  workflowJa: row.workflow_ja,
  workflowZh: row.workflow_zh,
  year: row.year,
})

const mergeProject = (project, override) => {
  if (!override) return { ...project, isPublic: true }

  return {
    ...project,
    ...Object.fromEntries(
      Object.entries(override).filter(
        ([key, value]) => key !== 'slug' && value !== null && value !== undefined,
      ),
    ),
  }
}

const localizedProjectFields = [
  'titleZh',
  'titleEn',
  'titleJa',
  'summaryZh',
  'summaryEn',
  'summaryJa',
  'workflowZh',
  'workflowEn',
  'workflowJa',
  'formatZh',
  'formatEn',
  'formatJa',
  'modelSizeZh',
  'modelSizeEn',
  'modelSizeJa',
  'downloadPolicyZh',
  'downloadPolicyEn',
  'downloadPolicyJa',
]

const getLocalizedProjectValues = (project) =>
  localizedProjectFields.map((field) => project[field] || null)

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

    CREATE TABLE IF NOT EXISTS project_overrides (
      slug text PRIMARY KEY,
      title text,
      summary text,
      workflow text,
      year text,
      image text,
      model_url text,
      format text,
      model_size text,
      asset_category text,
      download_policy text,
      stack jsonb,
      viewer_features jsonb,
      is_public boolean NOT NULL DEFAULT true,
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS custom_projects (
      slug text PRIMARY KEY,
      title text NOT NULL,
      summary text NOT NULL,
      workflow text,
      year text NOT NULL,
      image text NOT NULL,
      model_url text,
      format text,
      model_size text,
      asset_category text,
      download_policy text,
      stack jsonb NOT NULL DEFAULT '[]'::jsonb,
      viewer_features jsonb NOT NULL DEFAULT '[]'::jsonb,
      is_public boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS deleted_projects (
      slug text PRIMARY KEY,
      deleted_at timestamptz NOT NULL DEFAULT now()
    );
  `)

  await pool.query(`
    ALTER TABLE project_overrides
      ADD COLUMN IF NOT EXISTS asset_category text;

    ALTER TABLE custom_projects
      ADD COLUMN IF NOT EXISTS asset_category text;

    ALTER TABLE project_overrides
      ADD COLUMN IF NOT EXISTS title_zh text,
      ADD COLUMN IF NOT EXISTS title_en text,
      ADD COLUMN IF NOT EXISTS title_ja text,
      ADD COLUMN IF NOT EXISTS summary_zh text,
      ADD COLUMN IF NOT EXISTS summary_en text,
      ADD COLUMN IF NOT EXISTS summary_ja text,
      ADD COLUMN IF NOT EXISTS workflow_zh text,
      ADD COLUMN IF NOT EXISTS workflow_en text,
      ADD COLUMN IF NOT EXISTS workflow_ja text,
      ADD COLUMN IF NOT EXISTS format_zh text,
      ADD COLUMN IF NOT EXISTS format_en text,
      ADD COLUMN IF NOT EXISTS format_ja text,
      ADD COLUMN IF NOT EXISTS model_size_zh text,
      ADD COLUMN IF NOT EXISTS model_size_en text,
      ADD COLUMN IF NOT EXISTS model_size_ja text,
      ADD COLUMN IF NOT EXISTS download_policy_zh text,
      ADD COLUMN IF NOT EXISTS download_policy_en text,
      ADD COLUMN IF NOT EXISTS download_policy_ja text;

    ALTER TABLE custom_projects
      ADD COLUMN IF NOT EXISTS title_zh text,
      ADD COLUMN IF NOT EXISTS title_en text,
      ADD COLUMN IF NOT EXISTS title_ja text,
      ADD COLUMN IF NOT EXISTS summary_zh text,
      ADD COLUMN IF NOT EXISTS summary_en text,
      ADD COLUMN IF NOT EXISTS summary_ja text,
      ADD COLUMN IF NOT EXISTS workflow_zh text,
      ADD COLUMN IF NOT EXISTS workflow_en text,
      ADD COLUMN IF NOT EXISTS workflow_ja text,
      ADD COLUMN IF NOT EXISTS format_zh text,
      ADD COLUMN IF NOT EXISTS format_en text,
      ADD COLUMN IF NOT EXISTS format_ja text,
      ADD COLUMN IF NOT EXISTS model_size_zh text,
      ADD COLUMN IF NOT EXISTS model_size_en text,
      ADD COLUMN IF NOT EXISTS model_size_ja text,
      ADD COLUMN IF NOT EXISTS download_policy_zh text,
      ADD COLUMN IF NOT EXISTS download_policy_en text,
      ADD COLUMN IF NOT EXISTS download_policy_ja text;
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

  const projectStore = {
    listProjects: async (baseProjects, { includeHidden = false } = {}) => {
      const result = await pool.query(`
        SELECT slug, title, title_zh, title_en, title_ja, summary, summary_zh, summary_en,
          summary_ja, workflow, workflow_zh, workflow_en, workflow_ja, year, image, model_url,
          format, format_zh, format_en, format_ja, model_size, model_size_zh, model_size_en,
          model_size_ja, asset_category, download_policy, download_policy_zh, download_policy_en,
          download_policy_ja, stack, viewer_features, is_public
        FROM project_overrides
      `)
      const customResult = await pool.query(`
        SELECT slug, title, title_zh, title_en, title_ja, summary, summary_zh, summary_en,
          summary_ja, workflow, workflow_zh, workflow_en, workflow_ja, year, image, model_url,
          format, format_zh, format_en, format_ja, model_size, model_size_zh, model_size_en,
          model_size_ja, asset_category, download_policy, download_policy_zh, download_policy_en,
          download_policy_ja, stack, viewer_features, is_public
        FROM custom_projects
        ORDER BY created_at DESC
      `)
      const deletedResult = await pool.query('SELECT slug FROM deleted_projects')
      const deletedSlugs = new Set(deletedResult.rows.map((row) => row.slug))
      const overrides = new Map(
        result.rows.map((row) => [row.slug, toProjectOverride(row)]),
      )
      const customProjects = customResult.rows.map(toCustomProject)

      return [
        ...customProjects,
        ...baseProjects.map((project) => mergeProject(project, overrides.get(project.slug))),
      ]
        .filter((project) => !deletedSlugs.has(project.slug))
        .filter((project) => includeHidden || project.isPublic !== false)
    },

    getProject: async (baseProjects, slug, { includeHidden = false } = {}) => {
      const projects = await projectStore.listProjects(baseProjects, { includeHidden })
      return projects.find((project) => project.slug === slug) || null
    },
  }

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

    listLikes: async () => {
      const result = await pool.query(`
        SELECT project_slug, visitor_id, created_at
        FROM project_likes
        ORDER BY created_at DESC
        LIMIT 200
      `)

      return result.rows.map((row) => ({
        projectSlug: row.project_slug,
        visitorId: row.visitor_id,
        createdAt: row.created_at.toISOString(),
      }))
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

    listProjects: async (baseProjects) =>
      projectStore.listProjects(baseProjects, { includeHidden: true }),

    updateProject: async (slug, project) => {
      const customProject = await pool.query('SELECT slug FROM custom_projects WHERE slug = $1', [
        slug,
      ])

      if (customProject.rowCount > 0) {
        const result = await pool.query(
          `
            UPDATE custom_projects SET
              title = $2,
              summary = $3,
              workflow = $4,
              year = $5,
              image = $6,
              model_url = $7,
              format = $8,
              model_size = $9,
              asset_category = $10,
              download_policy = $11,
              stack = $12::jsonb,
              viewer_features = $13::jsonb,
              is_public = $14,
              title_zh = $15,
              title_en = $16,
              title_ja = $17,
              summary_zh = $18,
              summary_en = $19,
              summary_ja = $20,
              workflow_zh = $21,
              workflow_en = $22,
              workflow_ja = $23,
              format_zh = $24,
              format_en = $25,
              format_ja = $26,
              model_size_zh = $27,
              model_size_en = $28,
              model_size_ja = $29,
              download_policy_zh = $30,
              download_policy_en = $31,
              download_policy_ja = $32,
              updated_at = now()
            WHERE slug = $1
            RETURNING slug
          `,
          [
            slug,
            project.title,
            project.summary,
            project.workflow,
            project.year,
            project.image,
            project.modelUrl || null,
            project.format,
            project.modelSize,
            project.assetCategory || null,
            project.downloadPolicy,
            JSON.stringify(project.stack || []),
            JSON.stringify(project.viewerFeatures || []),
            project.isPublic !== false,
            ...getLocalizedProjectValues(project),
          ],
        )

        return result.rows[0] || null
      }

      const result = await pool.query(
        `
          INSERT INTO project_overrides
            (slug, title, summary, workflow, year, image, model_url, format,
             model_size, asset_category, download_policy, stack, viewer_features, is_public,
             title_zh, title_en, title_ja, summary_zh, summary_en, summary_ja,
             workflow_zh, workflow_en, workflow_ja, format_zh, format_en, format_ja,
             model_size_zh, model_size_en, model_size_ja, download_policy_zh,
             download_policy_en, download_policy_ja, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14,
            $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, now())
          ON CONFLICT (slug) DO UPDATE SET
            title = EXCLUDED.title,
            title_zh = EXCLUDED.title_zh,
            title_en = EXCLUDED.title_en,
            title_ja = EXCLUDED.title_ja,
            summary = EXCLUDED.summary,
            summary_zh = EXCLUDED.summary_zh,
            summary_en = EXCLUDED.summary_en,
            summary_ja = EXCLUDED.summary_ja,
            workflow = EXCLUDED.workflow,
            workflow_zh = EXCLUDED.workflow_zh,
            workflow_en = EXCLUDED.workflow_en,
            workflow_ja = EXCLUDED.workflow_ja,
            year = EXCLUDED.year,
            image = EXCLUDED.image,
            model_url = EXCLUDED.model_url,
            format = EXCLUDED.format,
            format_zh = EXCLUDED.format_zh,
            format_en = EXCLUDED.format_en,
            format_ja = EXCLUDED.format_ja,
            model_size = EXCLUDED.model_size,
            model_size_zh = EXCLUDED.model_size_zh,
            model_size_en = EXCLUDED.model_size_en,
            model_size_ja = EXCLUDED.model_size_ja,
            asset_category = EXCLUDED.asset_category,
            download_policy = EXCLUDED.download_policy,
            download_policy_zh = EXCLUDED.download_policy_zh,
            download_policy_en = EXCLUDED.download_policy_en,
            download_policy_ja = EXCLUDED.download_policy_ja,
            stack = EXCLUDED.stack,
            viewer_features = EXCLUDED.viewer_features,
            is_public = EXCLUDED.is_public,
            updated_at = now()
          RETURNING slug
        `,
        [
          slug,
          project.title,
          project.summary,
          project.workflow,
          project.year,
          project.image,
          project.modelUrl || null,
          project.format,
          project.modelSize,
          project.assetCategory || null,
          project.downloadPolicy,
          JSON.stringify(project.stack || []),
          JSON.stringify(project.viewerFeatures || []),
          project.isPublic !== false,
          ...getLocalizedProjectValues(project),
        ],
      )

      return result.rows[0] || null
    },

    createProject: async (project) => {
      const result = await pool.query(
        `
          INSERT INTO custom_projects
            (slug, title, summary, workflow, year, image, model_url, format,
             model_size, asset_category, download_policy, stack, viewer_features, is_public,
             title_zh, title_en, title_ja, summary_zh, summary_en, summary_ja,
             workflow_zh, workflow_en, workflow_ja, format_zh, format_en, format_ja,
             model_size_zh, model_size_en, model_size_ja, download_policy_zh,
             download_policy_en, download_policy_ja)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14,
            $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32)
          RETURNING slug
        `,
        [
          project.slug,
          project.title,
          project.summary,
          project.workflow,
          project.year,
          project.image,
          project.modelUrl || null,
          project.format,
          project.modelSize,
          project.assetCategory || null,
          project.downloadPolicy,
          JSON.stringify(project.stack || []),
          JSON.stringify(project.viewerFeatures || []),
          project.isPublic !== false,
          ...getLocalizedProjectValues(project),
        ],
      )

      return result.rows[0] || null
    },

    deleteProject: async (slug) => {
      const customResult = await pool.query(
        `
          DELETE FROM custom_projects
          WHERE slug = $1
          RETURNING slug
        `,
        [slug],
      )

      if (customResult.rows[0]) return customResult.rows[0]

      const deletedResult = await pool.query(
        `
          INSERT INTO deleted_projects (slug)
          VALUES ($1)
          ON CONFLICT (slug) DO UPDATE SET deleted_at = now()
          RETURNING slug
        `,
        [slug],
      )

      return deletedResult.rows[0] || null
    },

    deleteComment: async (id) => {
      const result = await pool.query(
        `
          DELETE FROM project_comments
          WHERE id = $1
          RETURNING id
        `,
        [id],
      )

      return result.rows[0] || null
    },

    deleteContactMessage: async (id) => {
      const result = await pool.query(
        `
          DELETE FROM contact_messages
          WHERE id = $1
          RETURNING id
        `,
        [id],
      )

      return result.rows[0] || null
    },

    deleteDownloadRequest: async (id) => {
      const result = await pool.query(
        `
          DELETE FROM download_requests
          WHERE id = $1
          RETURNING id
        `,
        [id],
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
    projectStore,
  }
}
