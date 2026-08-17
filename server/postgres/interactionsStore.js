import { createId, toComment } from './mappers.js'

// Likes and project comments -- the two things a visitor can do to a project.

export const createInteractionsStore = ({ pool }) => ({
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
            visitor_users.access_level
          FROM project_comments
          LEFT JOIN visitor_users ON visitor_users.id = project_comments.user_id
          WHERE project_comments.project_slug = $1
            -- Pending and spam rows exist but are not public.
            AND project_comments.status = 'published'
          ORDER BY project_comments.created_at ASC
          LIMIT 100
        `,
        [slug],
      ),
    ])

    return {
      likes: Array.from({ length: likesResult.rows[0].count }, (_, index) => String(index)),
      comments: commentsResult.rows.map((row) => toComment(row)),
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

  // Counts what one account has posted in a rolling window. Used instead of
  // a per-IP limiter, which is meaningless on this deployment.
  countRecentUserComments: async (userId, windowMs) => {
    const result = await pool.query(
      `
        SELECT count(*)::int AS total
        FROM project_comments
        WHERE user_id = $1
          AND created_at > now() - ($2::bigint * interval '1 millisecond')
      `,
      [userId, windowMs],
    )

    return result.rows[0]?.total ?? 0
  },

  // Detects a poster repeating the same message, which is what a spam run
  // looks like and what a human almost never does.
  hasRecentDuplicate: async ({ message, slug, userId }, windowMs) => {
    const result = await pool.query(
      `
        SELECT 1
        FROM project_comments
        WHERE project_slug = $1
          AND message = $2
          AND ($3::text IS NULL OR user_id = $3)
          AND created_at > now() - ($4::bigint * interval '1 millisecond')
        LIMIT 1
      `,
      [slug, message, userId || null, windowMs],
    )

    return result.rowCount > 0
  },

  addComment: async (slug, comment) => {
    const id = createId()
    const result = await pool.query(
      `
        INSERT INTO project_comments (id, project_slug, user_id, author, message, status)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, project_slug, author, message, created_at, user_id, status
      `,
      [id, slug, comment.userId || null, comment.author, comment.message, comment.status || 'published'],
    )

    if (!comment.userId) return { ...toComment(result.rows[0]), status: result.rows[0].status }

    const enriched = await pool.query(
      `
        SELECT
          project_comments.id,
          project_comments.project_slug,
          project_comments.author,
          project_comments.message,
          project_comments.created_at,
          project_comments.status,
          visitor_users.id AS user_id,
          visitor_users.display_name,
          visitor_users.access_level
        FROM project_comments
        LEFT JOIN visitor_users ON visitor_users.id = project_comments.user_id
        WHERE project_comments.id = $1
      `,
      [id],
    )

    return { ...toComment(enriched.rows[0]), status: enriched.rows[0].status }
  },

  // The account page shows the author their own comments including the ones
  // still awaiting review, so a pending comment does not look like it
  // vanished.
  listUserComments: async (userId) => {
    const result = await pool.query(
      `
        SELECT
          project_comments.id,
          project_comments.project_slug,
          project_comments.author,
          project_comments.message,
          project_comments.created_at,
          project_comments.status,
          visitor_users.id AS user_id,
          visitor_users.display_name,
          visitor_users.access_level
        FROM project_comments
        LEFT JOIN visitor_users ON visitor_users.id = project_comments.user_id
        WHERE project_comments.user_id = $1
        ORDER BY project_comments.created_at DESC
        LIMIT 100
      `,
      [userId],
    )

    return result.rows.map((row) => ({ ...toComment(row), status: row.status }))
  },

  countUserLikes: async (userId) => {
    const result = await pool.query(
      'SELECT count(*)::int AS count FROM project_likes WHERE user_id = $1',
      [userId],
    )

    return result.rows[0].count
  },
})
