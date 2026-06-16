import pg from 'pg'

const { Pool } = pg

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const toComment = (row) => ({
  id: row.id,
  projectSlug: row.project_slug,
  author: row.author,
  message: row.message,
  user: row.user_id
    ? {
        accessLevel: row.access_level,
        displayName: row.display_name,
        email: row.email,
        id: row.user_id,
      }
    : null,
  createdAt: row.created_at.toISOString(),
})

const toPublicUser = (row) =>
  row
    ? {
        accessLevel: row.access_level,
        createdAt: row.created_at?.toISOString?.() || row.created_at,
        displayName: row.display_name,
        email: row.email,
        emailVerified: Boolean(row.email_verified_at),
        emailVerifiedAt: row.email_verified_at?.toISOString?.() || row.email_verified_at || null,
        id: row.id,
      }
    : null

const toPrivateUser = (row) =>
  row
    ? {
        ...toPublicUser(row),
        passwordHash: row.password_hash,
      }
    : null

const toCommunityUpload = (row) => ({
  assetCategory: row.asset_category,
  createdAt: row.created_at.toISOString(),
  description: row.description,
  fileName: row.file_name,
  fileSize: Number(row.file_size),
  fileType: row.file_type,
  fileUrl: row.file_url,
  id: row.id,
  previewUrl: row.preview_url,
  status: row.status,
  title: row.title,
  updatedAt: row.updated_at.toISOString(),
  user: row.user_id
    ? {
        accessLevel: row.access_level,
        displayName: row.display_name,
        email: row.email,
        id: row.user_id,
      }
    : null,
})

const toCommunityPost = (row) => ({
  createdAt: row.created_at.toISOString(),
  id: row.id,
  message: row.message,
  title: row.title,
  topic: row.topic,
  updatedAt: row.updated_at.toISOString(),
  user: row.user_id
    ? {
        accessLevel: row.access_level,
        displayName: row.display_name,
        email: row.email,
        id: row.user_id,
      }
    : null,
})

const toCommunityComment = (row) => ({
  author: row.author,
  createdAt: row.created_at.toISOString(),
  id: row.id,
  likeCount: Number(row.like_count || 0),
  liked: Boolean(row.liked),
  message: row.message,
  parentId: row.parent_id || null,
  postId: row.post_id,
  updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
  user: row.user_id
    ? {
        accessLevel: row.access_level,
        displayName: row.display_name,
        id: row.user_id,
      }
    : null,
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

    CREATE TABLE IF NOT EXISTS visitor_users (
      id text PRIMARY KEY,
      email text NOT NULL UNIQUE,
      display_name text NOT NULL,
      password_hash text NOT NULL,
      access_level text NOT NULL DEFAULT 'member',
      email_verified_at timestamptz,
      verification_code_hash text,
      verification_expires_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS visitor_sessions (
      token_hash text PRIMARY KEY,
      user_id text NOT NULL REFERENCES visitor_users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS visitor_sessions_user_idx
      ON visitor_sessions (user_id, expires_at);

    CREATE TABLE IF NOT EXISTS project_likes (
      project_slug text NOT NULL,
      visitor_id text NOT NULL,
      user_id text REFERENCES visitor_users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (project_slug, visitor_id)
    );

    CREATE TABLE IF NOT EXISTS project_comments (
      id text PRIMARY KEY,
      project_slug text NOT NULL,
      user_id text REFERENCES visitor_users(id) ON DELETE SET NULL,
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
      user_id text REFERENCES visitor_users(id) ON DELETE SET NULL,
      visitor_access_level text,
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

    CREATE TABLE IF NOT EXISTS community_uploads (
      id text PRIMARY KEY,
      status text NOT NULL DEFAULT 'pending',
      user_id text REFERENCES visitor_users(id) ON DELETE SET NULL,
      title text NOT NULL,
      description text NOT NULL,
      asset_category text,
      file_name text NOT NULL,
      file_type text NOT NULL,
      file_size bigint NOT NULL,
      file_url text NOT NULL,
      preview_url text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS community_uploads_status_created_idx
      ON community_uploads (status, created_at DESC);

    CREATE INDEX IF NOT EXISTS community_uploads_user_idx
      ON community_uploads (user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS community_posts (
      id text PRIMARY KEY,
      user_id text REFERENCES visitor_users(id) ON DELETE SET NULL,
      topic text NOT NULL DEFAULT 'general',
      title text NOT NULL,
      message text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS community_posts_created_idx
      ON community_posts (created_at DESC);

    CREATE INDEX IF NOT EXISTS community_posts_user_idx
      ON community_posts (user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS community_comments (
      id text PRIMARY KEY,
      post_id text NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
      parent_id text REFERENCES community_comments(id) ON DELETE CASCADE,
      user_id text REFERENCES visitor_users(id) ON DELETE SET NULL,
      author text NOT NULL,
      message text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS community_comments_post_created_idx
      ON community_comments (post_id, created_at);

    CREATE INDEX IF NOT EXISTS community_comments_parent_idx
      ON community_comments (parent_id, created_at);

    CREATE INDEX IF NOT EXISTS community_comments_user_idx
      ON community_comments (user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS community_comment_likes (
      comment_id text NOT NULL REFERENCES community_comments(id) ON DELETE CASCADE,
      user_id text NOT NULL REFERENCES visitor_users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (comment_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS community_comment_likes_comment_idx
      ON community_comment_likes (comment_id);
  `)

  await pool.query(`
    ALTER TABLE project_overrides
      ADD COLUMN IF NOT EXISTS asset_category text;

    ALTER TABLE custom_projects
      ADD COLUMN IF NOT EXISTS asset_category text;

    ALTER TABLE project_likes
      ADD COLUMN IF NOT EXISTS user_id text REFERENCES visitor_users(id) ON DELETE SET NULL;

    ALTER TABLE project_comments
      ADD COLUMN IF NOT EXISTS user_id text REFERENCES visitor_users(id) ON DELETE SET NULL;

    ALTER TABLE download_requests
      ADD COLUMN IF NOT EXISTS user_id text REFERENCES visitor_users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS visitor_access_level text;

    ALTER TABLE visitor_users
      ADD COLUMN IF NOT EXISTS email_verified_at timestamptz,
      ADD COLUMN IF NOT EXISTS verification_code_hash text,
      ADD COLUMN IF NOT EXISTS verification_expires_at timestamptz;

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

  const authStore = {
    createUser: async (user) => {
      const result = await pool.query(
        `
          INSERT INTO visitor_users
            (
              id,
              email,
              display_name,
              password_hash,
              access_level,
              verification_code_hash,
              verification_expires_at
            )
          VALUES ($1, lower($2), $3, $4, $5, $6, $7)
          RETURNING id, email, display_name, access_level, email_verified_at, created_at
        `,
        [
          user.id,
          user.email,
          user.displayName,
          user.passwordHash,
          user.accessLevel,
          user.verificationCodeHash,
          user.verificationExpiresAt,
        ],
      )

      return toPublicUser(result.rows[0])
    },

    createSession: async (session) => {
      await pool.query(
        `
          INSERT INTO visitor_sessions (token_hash, user_id, expires_at)
          VALUES ($1, $2, $3)
        `,
        [session.tokenHash, session.userId, session.expiresAt],
      )
    },

    deleteSession: async (tokenHash) => {
      await pool.query('DELETE FROM visitor_sessions WHERE token_hash = $1', [tokenHash])
    },

    getSessionUser: async (tokenHash) => {
      const result = await pool.query(
        `
          SELECT
            visitor_users.id,
            visitor_users.email,
            visitor_users.display_name,
            visitor_users.access_level,
            visitor_users.email_verified_at,
            visitor_users.created_at
          FROM visitor_sessions
          JOIN visitor_users ON visitor_users.id = visitor_sessions.user_id
          WHERE visitor_sessions.token_hash = $1
            AND visitor_sessions.expires_at > now()
          LIMIT 1
        `,
        [tokenHash],
      )

      return toPublicUser(result.rows[0])
    },

    getUserByEmail: async (email) => {
      const result = await pool.query(
        `
          SELECT id, email, display_name, password_hash, access_level, created_at
            , email_verified_at, verification_code_hash, verification_expires_at
          FROM visitor_users
          WHERE email = lower($1)
          LIMIT 1
        `,
        [email],
      )

      return toPrivateUser(result.rows[0])
    },

    verifyEmail: async (email, verificationCodeHash) => {
      const result = await pool.query(
        `
          UPDATE visitor_users
          SET email_verified_at = now(),
              verification_code_hash = null,
              verification_expires_at = null,
              updated_at = now()
          WHERE email = lower($1)
            AND verification_code_hash = $2
            AND verification_expires_at > now()
            AND email_verified_at IS NULL
          RETURNING id, email, display_name, access_level, email_verified_at, created_at
        `,
        [email, verificationCodeHash],
      )

      return toPublicUser(result.rows[0])
    },

    setVerificationCode: async (email, verificationCodeHash, verificationExpiresAt) => {
      const result = await pool.query(
        `
          UPDATE visitor_users
          SET verification_code_hash = $2,
              verification_expires_at = $3,
              updated_at = now()
          WHERE email = lower($1)
            AND email_verified_at IS NULL
          RETURNING id
        `,
        [email, verificationCodeHash, verificationExpiresAt],
      )

      return Boolean(result.rows[0])
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
            SELECT
              project_comments.id,
              project_comments.project_slug,
              project_comments.author,
              project_comments.message,
              project_comments.created_at,
              visitor_users.id AS user_id,
              visitor_users.display_name,
              visitor_users.email,
              visitor_users.access_level
            FROM project_comments
            LEFT JOIN visitor_users ON visitor_users.id = project_comments.user_id
            WHERE project_comments.project_slug = $1
            ORDER BY project_comments.created_at ASC
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

    toggleLike: async (slug, visitorId, userId = null) => {
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

          if (userId) {
            await client.query(
              `
                UPDATE project_likes
                SET user_id = $3
                WHERE project_slug = $1 AND visitor_id = $2
              `,
              [slug, visitorId, userId],
            )
          }
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
          INSERT INTO project_comments (id, project_slug, user_id, author, message)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, project_slug, author, message, created_at, user_id
        `,
        [id, slug, comment.userId || null, comment.author, comment.message],
      )

      if (!comment.userId) return toComment(result.rows[0])

      const enriched = await pool.query(
        `
          SELECT
            project_comments.id,
            project_comments.project_slug,
            project_comments.author,
            project_comments.message,
            project_comments.created_at,
            visitor_users.id AS user_id,
            visitor_users.display_name,
            visitor_users.email,
            visitor_users.access_level
          FROM project_comments
          LEFT JOIN visitor_users ON visitor_users.id = project_comments.user_id
          WHERE project_comments.id = $1
        `,
        [id],
      )

      return toComment(enriched.rows[0])
    },
  }

  const downloadRequestsStore = {
    addRequest: async (request) => {
      const id = createId()
      const result = await pool.query(
        `
          INSERT INTO download_requests
            (
              id,
              status,
              project_slug,
              project_title,
              name,
              email,
              purpose,
              user_id,
              visitor_access_level,
              ip
            )
          VALUES ($1, 'pending', $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id, status, created_at
        `,
        [
          id,
          request.projectSlug,
          request.projectTitle,
          request.name,
          request.email,
          request.purpose,
          request.userId || null,
          request.visitorAccessLevel || null,
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

  const communityStore = {
    listApprovedUploads: async () => {
      const result = await pool.query(`
        SELECT
          community_uploads.id,
          community_uploads.status,
          community_uploads.title,
          community_uploads.description,
          community_uploads.asset_category,
          community_uploads.file_name,
          community_uploads.file_type,
          community_uploads.file_size,
          community_uploads.file_url,
          community_uploads.preview_url,
          community_uploads.created_at,
          community_uploads.updated_at,
          visitor_users.id AS user_id,
          visitor_users.display_name,
          visitor_users.email,
          visitor_users.access_level
        FROM community_uploads
        LEFT JOIN visitor_users ON visitor_users.id = community_uploads.user_id
        WHERE community_uploads.status = 'approved'
        ORDER BY community_uploads.created_at DESC
        LIMIT 100
      `)

      return result.rows.map(toCommunityUpload)
    },

    listPosts: async () => {
      const result = await pool.query(`
        SELECT
          community_posts.id,
          community_posts.topic,
          community_posts.title,
          community_posts.message,
          community_posts.created_at,
          community_posts.updated_at,
          visitor_users.id AS user_id,
          visitor_users.display_name,
          visitor_users.email,
          visitor_users.access_level
        FROM community_posts
        LEFT JOIN visitor_users ON visitor_users.id = community_posts.user_id
        ORDER BY community_posts.created_at DESC
        LIMIT 100
      `)

      return result.rows.map(toCommunityPost)
    },

    getPost: async (id) => {
      const result = await pool.query(
        `
          SELECT
            community_posts.id,
            community_posts.topic,
            community_posts.title,
            community_posts.message,
            community_posts.created_at,
            community_posts.updated_at,
            visitor_users.id AS user_id,
            visitor_users.display_name,
            visitor_users.email,
            visitor_users.access_level
          FROM community_posts
          LEFT JOIN visitor_users ON visitor_users.id = community_posts.user_id
          WHERE community_posts.id = $1
          LIMIT 1
        `,
        [id],
      )

      return result.rows[0] ? toCommunityPost(result.rows[0]) : null
    },

    listComments: async (postId, { sort = 'newest', viewerId = null } = {}) => {
      const orderBy =
        sort === 'top'
          ? 'like_count DESC, community_comments.created_at ASC'
          : 'community_comments.created_at ASC'

      const result = await pool.query(
        `
          SELECT
            community_comments.id,
            community_comments.post_id,
            community_comments.parent_id,
            community_comments.author,
            community_comments.message,
            community_comments.created_at,
            community_comments.updated_at,
            visitor_users.id AS user_id,
            visitor_users.display_name,
            visitor_users.access_level,
            COALESCE(like_counts.count, 0) AS like_count,
            CASE WHEN viewer_likes.user_id IS NULL THEN false ELSE true END AS liked
          FROM community_comments
          LEFT JOIN visitor_users ON visitor_users.id = community_comments.user_id
          LEFT JOIN (
            SELECT comment_id, count(*)::int AS count
            FROM community_comment_likes
            GROUP BY comment_id
          ) AS like_counts ON like_counts.comment_id = community_comments.id
          LEFT JOIN community_comment_likes AS viewer_likes
            ON viewer_likes.comment_id = community_comments.id
            AND viewer_likes.user_id = $2
          WHERE community_comments.post_id = $1
          ORDER BY ${orderBy}
          LIMIT 500
        `,
        [postId, viewerId],
      )

      return result.rows.map(toCommunityComment)
    },

    createComment: async (comment) => {
      await pool.query(
        `
          INSERT INTO community_comments (id, post_id, parent_id, user_id, author, message)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          comment.id,
          comment.postId,
          comment.parentId || null,
          comment.userId || null,
          comment.author,
          comment.message,
        ],
      )

      const enriched = await pool.query(
        `
          SELECT
            community_comments.id,
            community_comments.post_id,
            community_comments.parent_id,
            community_comments.author,
            community_comments.message,
            community_comments.created_at,
            community_comments.updated_at,
            visitor_users.id AS user_id,
            visitor_users.display_name,
            visitor_users.access_level,
            0 AS like_count,
            false AS liked
          FROM community_comments
          LEFT JOIN visitor_users ON visitor_users.id = community_comments.user_id
          WHERE community_comments.id = $1
        `,
        [comment.id],
      )

      return toCommunityComment(enriched.rows[0])
    },

    deleteUserComment: async (id, userId) => {
      const result = await pool.query(
        `
          DELETE FROM community_comments
          WHERE id = $1 AND user_id = $2
          RETURNING id
        `,
        [id, userId],
      )

      return result.rows[0] || null
    },

    toggleCommentLike: async (commentId, userId) => {
      const client = await pool.connect()

      try {
        await client.query('BEGIN')
        const existing = await client.query(
          `
            SELECT comment_id FROM community_comments WHERE id = $1
          `,
          [commentId],
        )

        if (!existing.rows[0]) {
          await client.query('ROLLBACK')
          return null
        }

        const deleted = await client.query(
          `
            DELETE FROM community_comment_likes
            WHERE comment_id = $1 AND user_id = $2
            RETURNING comment_id
          `,
          [commentId, userId],
        )

        const liked = deleted.rowCount === 0

        if (liked) {
          await client.query(
            `
              INSERT INTO community_comment_likes (comment_id, user_id)
              VALUES ($1, $2)
              ON CONFLICT DO NOTHING
            `,
            [commentId, userId],
          )
        }

        const countResult = await client.query(
          'SELECT count(*)::int AS count FROM community_comment_likes WHERE comment_id = $1',
          [commentId],
        )
        await client.query('COMMIT')

        return { liked, likeCount: countResult.rows[0].count }
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },

    listUserUploads: async (userId) => {
      const result = await pool.query(
        `
          SELECT
            community_uploads.id,
            community_uploads.status,
            community_uploads.title,
            community_uploads.description,
            community_uploads.asset_category,
            community_uploads.file_name,
            community_uploads.file_type,
            community_uploads.file_size,
            community_uploads.file_url,
            community_uploads.preview_url,
            community_uploads.created_at,
            community_uploads.updated_at,
            visitor_users.id AS user_id,
            visitor_users.display_name,
            visitor_users.email,
            visitor_users.access_level
          FROM community_uploads
          LEFT JOIN visitor_users ON visitor_users.id = community_uploads.user_id
          WHERE community_uploads.user_id = $1
          ORDER BY community_uploads.created_at DESC
          LIMIT 100
        `,
        [userId],
      )

      return result.rows.map(toCommunityUpload)
    },

    listUserPosts: async (userId) => {
      const result = await pool.query(
        `
          SELECT
            community_posts.id,
            community_posts.topic,
            community_posts.title,
            community_posts.message,
            community_posts.created_at,
            community_posts.updated_at,
            visitor_users.id AS user_id,
            visitor_users.display_name,
            visitor_users.email,
            visitor_users.access_level
          FROM community_posts
          LEFT JOIN visitor_users ON visitor_users.id = community_posts.user_id
          WHERE community_posts.user_id = $1
          ORDER BY community_posts.created_at DESC
          LIMIT 100
        `,
        [userId],
      )

      return result.rows.map(toCommunityPost)
    },

    createUpload: async (upload) => {
      const result = await pool.query(
        `
          INSERT INTO community_uploads
            (
              id,
              status,
              user_id,
              title,
              description,
              asset_category,
              file_name,
              file_type,
              file_size,
              file_url,
              preview_url
            )
          VALUES ($1, 'pending', $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING
            id,
            status,
            title,
            description,
            asset_category,
            file_name,
            file_type,
            file_size,
            file_url,
            preview_url,
            created_at,
            updated_at,
            user_id
        `,
        [
          upload.id,
          upload.userId,
          upload.title,
          upload.description,
          upload.assetCategory,
          upload.fileName,
          upload.fileType,
          upload.fileSize,
          upload.fileUrl,
          upload.previewUrl,
        ],
      )

      return toCommunityUpload({
        ...result.rows[0],
        access_level: upload.user.accessLevel,
        display_name: upload.user.displayName,
        email: upload.user.email,
        user_id: upload.user.id,
      })
    },

    createPost: async (post) => {
      const result = await pool.query(
        `
          INSERT INTO community_posts (id, user_id, topic, title, message)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, user_id, topic, title, message, created_at, updated_at
        `,
        [post.id, post.userId, post.topic, post.title, post.message],
      )

      return toCommunityPost({
        ...result.rows[0],
        access_level: post.user.accessLevel,
        display_name: post.user.displayName,
        email: post.user.email,
        user_id: post.user.id,
      })
    },

    deleteUserUpload: async (id, userId) => {
      const result = await pool.query(
        `
          DELETE FROM community_uploads
          WHERE id = $1 AND user_id = $2
          RETURNING id, file_url
        `,
        [id, userId],
      )

      return result.rows[0] || null
    },

    deleteUserPost: async (id, userId) => {
      const result = await pool.query(
        `
          DELETE FROM community_posts
          WHERE id = $1 AND user_id = $2
          RETURNING id
        `,
        [id, userId],
      )

      return result.rows[0] || null
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
          (SELECT count(*)::int FROM contact_messages) AS contact_messages,
          (SELECT count(*)::int FROM visitor_users) AS visitors,
          (SELECT count(*)::int FROM community_posts) AS community_posts,
          (SELECT count(*)::int FROM community_comments) AS community_comments,
          (SELECT count(*)::int FROM community_uploads) AS community_uploads,
          (SELECT count(*)::int FROM community_uploads WHERE status = 'pending') AS pending_community_uploads
      `)

      return result.rows[0]
    },

    listComments: async () => {
      const result = await pool.query(`
        SELECT
          project_comments.id,
          project_comments.project_slug,
          project_comments.author,
          project_comments.message,
          project_comments.created_at,
          visitor_users.id AS user_id,
          visitor_users.display_name,
          visitor_users.email,
          visitor_users.access_level
        FROM project_comments
        LEFT JOIN visitor_users ON visitor_users.id = project_comments.user_id
        ORDER BY project_comments.created_at DESC
        LIMIT 100
      `)

      return result.rows.map(toComment)
    },

    listCommunityUploads: async () => {
      const result = await pool.query(`
        SELECT
          community_uploads.id,
          community_uploads.status,
          community_uploads.title,
          community_uploads.description,
          community_uploads.asset_category,
          community_uploads.file_name,
          community_uploads.file_type,
          community_uploads.file_size,
          community_uploads.file_url,
          community_uploads.preview_url,
          community_uploads.created_at,
          community_uploads.updated_at,
          visitor_users.id AS user_id,
          visitor_users.display_name,
          visitor_users.email,
          visitor_users.access_level
        FROM community_uploads
        LEFT JOIN visitor_users ON visitor_users.id = community_uploads.user_id
        ORDER BY
          CASE community_uploads.status
            WHEN 'pending' THEN 0
            WHEN 'approved' THEN 1
            ELSE 2
          END,
          community_uploads.created_at DESC
        LIMIT 200
      `)

      return result.rows.map(toCommunityUpload)
    },

    listCommunityPosts: async () => {
      const result = await pool.query(`
        SELECT
          community_posts.id,
          community_posts.topic,
          community_posts.title,
          community_posts.message,
          community_posts.created_at,
          community_posts.updated_at,
          visitor_users.id AS user_id,
          visitor_users.display_name,
          visitor_users.email,
          visitor_users.access_level
        FROM community_posts
        LEFT JOIN visitor_users ON visitor_users.id = community_posts.user_id
        ORDER BY community_posts.created_at DESC
        LIMIT 200
      `)

      return result.rows.map(toCommunityPost)
    },

    listCommunityComments: async () => {
      const result = await pool.query(`
        SELECT
          community_comments.id,
          community_comments.post_id,
          community_comments.parent_id,
          community_comments.author,
          community_comments.message,
          community_comments.created_at,
          community_comments.updated_at,
          community_posts.title AS post_title,
          visitor_users.id AS user_id,
          visitor_users.display_name,
          visitor_users.email,
          visitor_users.access_level,
          COALESCE(like_counts.count, 0) AS like_count,
          false AS liked
        FROM community_comments
        LEFT JOIN community_posts ON community_posts.id = community_comments.post_id
        LEFT JOIN visitor_users ON visitor_users.id = community_comments.user_id
        LEFT JOIN (
          SELECT comment_id, count(*)::int AS count
          FROM community_comment_likes
          GROUP BY comment_id
        ) AS like_counts ON like_counts.comment_id = community_comments.id
        ORDER BY community_comments.created_at DESC
        LIMIT 200
      `)

      return result.rows.map((row) => ({
        ...toCommunityComment(row),
        postTitle: row.post_title || null,
        user: row.user_id
          ? {
              accessLevel: row.access_level,
              displayName: row.display_name,
              email: row.email,
              id: row.user_id,
            }
          : null,
      }))
    },

    listLikes: async () => {
      const result = await pool.query(`
        SELECT
          project_likes.project_slug,
          project_likes.visitor_id,
          project_likes.created_at,
          visitor_users.id AS user_id,
          visitor_users.display_name,
          visitor_users.email,
          visitor_users.access_level
        FROM project_likes
        LEFT JOIN visitor_users ON visitor_users.id = project_likes.user_id
        ORDER BY project_likes.created_at DESC
        LIMIT 200
      `)

      return result.rows.map((row) => ({
        projectSlug: row.project_slug,
        visitorId: row.visitor_id,
        user: row.user_id
          ? {
              accessLevel: row.access_level,
              displayName: row.display_name,
              email: row.email,
              id: row.user_id,
            }
          : null,
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
        SELECT
          download_requests.id,
          download_requests.status,
          download_requests.project_slug,
          download_requests.project_title,
          download_requests.name,
          download_requests.email,
          download_requests.purpose,
          download_requests.ip,
          download_requests.visitor_access_level,
          download_requests.created_at,
          visitor_users.id AS user_id,
          visitor_users.display_name,
          visitor_users.email AS user_email,
          visitor_users.access_level
        FROM download_requests
        LEFT JOIN visitor_users ON visitor_users.id = download_requests.user_id
        ORDER BY download_requests.created_at DESC
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
        visitorAccessLevel: row.visitor_access_level,
        user: row.user_id
          ? {
              accessLevel: row.access_level,
              displayName: row.display_name,
              email: row.user_email,
              id: row.user_id,
            }
          : null,
        createdAt: row.created_at.toISOString(),
      }))
    },

    listVisitors: async () => {
      const result = await pool.query(`
        SELECT
          visitor_users.id,
          visitor_users.email,
          visitor_users.display_name,
          visitor_users.access_level,
          visitor_users.email_verified_at,
          visitor_users.created_at,
          visitor_users.updated_at,
          count(DISTINCT project_likes.project_slug) AS like_count,
          count(DISTINCT project_comments.id) AS comment_count,
          count(DISTINCT download_requests.id) AS download_request_count
        FROM visitor_users
        LEFT JOIN project_likes ON project_likes.user_id = visitor_users.id
        LEFT JOIN project_comments ON project_comments.user_id = visitor_users.id
        LEFT JOIN download_requests ON download_requests.user_id = visitor_users.id
        GROUP BY visitor_users.id
        ORDER BY visitor_users.created_at DESC
        LIMIT 200
      `)

      return result.rows.map((row) => ({
        ...toPublicUser(row),
        commentCount: Number(row.comment_count),
        downloadRequestCount: Number(row.download_request_count),
        likeCount: Number(row.like_count),
        updatedAt: row.updated_at.toISOString(),
      }))
    },

    updateVisitorAccessLevel: async (id, accessLevel) => {
      const result = await pool.query(
        `
          UPDATE visitor_users
          SET access_level = $2,
              updated_at = now()
          WHERE id = $1
          RETURNING id, email, display_name, access_level, email_verified_at, created_at
        `,
        [id, accessLevel],
      )

      return toPublicUser(result.rows[0])
    },

    setVisitorEmailVerified: async (id, verified) => {
      const result = await pool.query(
        `
          UPDATE visitor_users
          SET email_verified_at = CASE WHEN $2 THEN COALESCE(email_verified_at, now()) ELSE null END,
              verification_code_hash = CASE WHEN $2 THEN null ELSE verification_code_hash END,
              verification_expires_at = CASE WHEN $2 THEN null ELSE verification_expires_at END,
              updated_at = now()
          WHERE id = $1
          RETURNING id, email, display_name, access_level, email_verified_at, created_at
        `,
        [id, verified],
      )

      return toPublicUser(result.rows[0])
    },

    deleteVisitor: async (id) => {
      const result = await pool.query(
        `
          DELETE FROM visitor_users
          WHERE id = $1
          RETURNING id, email, display_name, access_level, email_verified_at, created_at
        `,
        [id],
      )

      return toPublicUser(result.rows[0])
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

    updateCommunityUploadStatus: async (id, status) => {
      const result = await pool.query(
        `
          UPDATE community_uploads
          SET status = $2,
              updated_at = now()
          WHERE id = $1
          RETURNING id
        `,
        [id, status],
      )

      if (!result.rows[0]) return null

      const updated = await pool.query(
        `
          SELECT
            community_uploads.id,
            community_uploads.status,
            community_uploads.title,
            community_uploads.description,
            community_uploads.asset_category,
            community_uploads.file_name,
            community_uploads.file_type,
            community_uploads.file_size,
            community_uploads.file_url,
            community_uploads.preview_url,
            community_uploads.created_at,
            community_uploads.updated_at,
            visitor_users.id AS user_id,
            visitor_users.display_name,
            visitor_users.email,
            visitor_users.access_level
          FROM community_uploads
          LEFT JOIN visitor_users ON visitor_users.id = community_uploads.user_id
          WHERE community_uploads.id = $1
        `,
        [id],
      )

      return toCommunityUpload(updated.rows[0])
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

    deleteCommunityUpload: async (id) => {
      const result = await pool.query(
        `
          DELETE FROM community_uploads
          WHERE id = $1
          RETURNING id, file_url
        `,
        [id],
      )

      return result.rows[0] || null
    },

    deleteCommunityPost: async (id) => {
      const result = await pool.query(
        `
          DELETE FROM community_posts
          WHERE id = $1
          RETURNING id
        `,
        [id],
      )

      return result.rows[0] || null
    },

    deleteCommunityComment: async (id) => {
      const result = await pool.query(
        `
          DELETE FROM community_comments
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
    authStore,
    close: () => pool.end(),
    communityStore,
    contactMessagesStore,
    downloadRequestsStore,
    interactionsStore,
    projectStore,
  }
}
