import { toComment, toCommunityComment, toCommunityPost, toCommunityUpload } from './mappers.js'

// The community area: posts, their comments, and uploaded resources.

export const createCommunityStore = ({ pool }) => ({
  // Rolling-window upload usage for one account. The per-IP limiter capped
  // request count but nothing capped stored bytes, so a single member could
  // park gigabytes on the VPS disk one 120MB model at a time.
  getUploadUsage: async (userId, windowMs) => {
    const result = await pool.query(
      `
        SELECT
          count(*)::int AS upload_count,
          coalesce(sum(file_size), 0)::bigint AS total_bytes
        FROM community_uploads
        WHERE user_id = $1
          AND created_at > now() - ($2::bigint * interval '1 millisecond')
      `,
      [userId, windowMs],
    )

    const row = result.rows[0]
    return {
      bytes: Number(row?.total_bytes || 0),
      count: Number(row?.upload_count || 0),
    }
  },

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
        visitor_users.access_level
      FROM community_uploads
      LEFT JOIN visitor_users ON visitor_users.id = community_uploads.user_id
      WHERE community_uploads.status = 'approved'
      ORDER BY community_uploads.created_at DESC
      LIMIT 100
    `)

    return result.rows.map((row) => toCommunityUpload(row))
  },

  // Rows the content health checker opens on disk. Rejected uploads are
  // excluded because their files are already unreachable by design, so a
  // missing one is the system working; approved and pending are both worth
  // checking, the first because visitors can reach it and the second because
  // a moderator is about to decide on it.
  listUploadsForHealth: async (limit = 200) => {
    const result = await pool.query(
      `
        SELECT id, status, title, file_type, file_size, file_url, preview_url
        FROM community_uploads
        WHERE status IN ('approved', 'pending')
        ORDER BY
          CASE status WHEN 'approved' THEN 0 ELSE 1 END,
          created_at DESC
        LIMIT $1
      `,
      [limit],
    )

    return result.rows.map((row) => ({
      fileSize: Number(row.file_size),
      fileType: row.file_type,
      fileUrl: row.file_url,
      id: row.id,
      previewUrl: row.preview_url,
      status: row.status,
      title: row.title,
    }))
  },

  // Reverse lookup used by the /uploads access gate: a file on disk only
  // reveals its moderation state through the row that points at it.
  getUploadByAssetUrl: async (assetUrl) => {
    const result = await pool.query(
      `
        SELECT id, user_id, status
        FROM community_uploads
        WHERE file_url = $1 OR preview_url = $1
        LIMIT 1
      `,
      [assetUrl],
    )

    return result.rows[0] || null
  },

  listPosts: async () => {
    const result = await pool.query(`
      SELECT
        community_posts.id,
        community_posts.topic,
        community_posts.title,
        community_posts.message,
        community_posts.image_url,
        community_posts.created_at,
        community_posts.updated_at,
        visitor_users.id AS user_id,
        visitor_users.display_name,
        visitor_users.access_level
      FROM community_posts
      LEFT JOIN visitor_users ON visitor_users.id = community_posts.user_id
      ORDER BY community_posts.created_at DESC
      LIMIT 100
    `)

    return result.rows.map((row) => toCommunityPost(row))
  },

  getPost: async (id) => {
    const result = await pool.query(
      `
        SELECT
          community_posts.id,
          community_posts.topic,
          community_posts.title,
          community_posts.message,
        community_posts.image_url,
          community_posts.created_at,
          community_posts.updated_at,
          visitor_users.id AS user_id,
          visitor_users.display_name,
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
          SELECT id FROM community_comments WHERE id = $1
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
          visitor_users.access_level
        FROM community_uploads
        LEFT JOIN visitor_users ON visitor_users.id = community_uploads.user_id
        WHERE community_uploads.user_id = $1
        ORDER BY community_uploads.created_at DESC
        LIMIT 100
      `,
      [userId],
    )

    return result.rows.map((row) => toCommunityUpload(row))
  },

  listUserPosts: async (userId) => {
    const result = await pool.query(
      `
        SELECT
          community_posts.id,
          community_posts.topic,
          community_posts.title,
          community_posts.message,
        community_posts.image_url,
          community_posts.created_at,
          community_posts.updated_at,
          visitor_users.id AS user_id,
          visitor_users.display_name,
          visitor_users.access_level
        FROM community_posts
        LEFT JOIN visitor_users ON visitor_users.id = community_posts.user_id
        WHERE community_posts.user_id = $1
        ORDER BY community_posts.created_at DESC
        LIMIT 100
      `,
      [userId],
    )

    return result.rows.map((row) => toCommunityPost(row))
  },

  listPublicUserUploads: async (userId) => {
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
          visitor_users.access_level
        FROM community_uploads
        LEFT JOIN visitor_users ON visitor_users.id = community_uploads.user_id
        WHERE community_uploads.user_id = $1
          AND community_uploads.status = 'approved'
        ORDER BY community_uploads.created_at DESC
        LIMIT 100
      `,
      [userId],
    )

    return result.rows.map((row) => toCommunityUpload(row))
  },

  listPublicUserPosts: async (userId) => {
    const result = await pool.query(
      `
        SELECT
          community_posts.id,
          community_posts.topic,
          community_posts.title,
          community_posts.message,
        community_posts.image_url,
          community_posts.created_at,
          community_posts.updated_at,
          visitor_users.id AS user_id,
          visitor_users.display_name,
          visitor_users.access_level
        FROM community_posts
        LEFT JOIN visitor_users ON visitor_users.id = community_posts.user_id
        WHERE community_posts.user_id = $1
        ORDER BY community_posts.created_at DESC
        LIMIT 100
      `,
      [userId],
    )

    return result.rows.map((row) => toCommunityPost(row))
  },

  listPublicUserComments: async (userId) => {
    const result = await pool.query(
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
        WHERE project_comments.user_id = $1
        ORDER BY project_comments.created_at DESC
        LIMIT 100
      `,
      [userId],
    )

    return result.rows.map((row) => toComment(row))
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
        INSERT INTO community_posts (id, user_id, topic, title, message, image_url)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, user_id, topic, title, message, image_url, created_at, updated_at
      `,
      [post.id, post.userId, post.topic, post.title, post.message, post.imageUrl || null],
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
})
