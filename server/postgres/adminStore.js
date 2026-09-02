import {
  createId,
  getLocalizedProjectValues,
  toAccountProfile,
  toAccountUserRecord,
  toAdminUser,
  toComment,
  toCommunityComment,
  toCommunityPost,
  toCommunityUpload,
} from './mappers.js'

// Everything /admin reads and writes. The largest store by far, because it is
// the only one that sees across all the others -- summaries, moderation,
// member management, and the audit trail.

export const createAdminStore = ({ pool, projectStore }) => {
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

    // Everything the dashboard needs, in one round trip. getSummary answers
    // "how many are there"; this answers "what is happening" -- the same
    // counters plus their movement against the previous window of equal
    // length, a daily series to plot, the queues that need a human, and the
    // few numbers that say whether the box itself is healthy.
    //
    // Deliberately one endpoint rather than a dozen: the dashboard is a single
    // view that either loads or does not, and eleven parallel requests over a
    // 100ms link is the difference between a dashboard and a progress bar.
    getOverview: async ({ days = 30 } = {}) => {
      // Clamped, not trusted: `days` reaches the SQL as an interval and as a
      // generate_series bound, so an absurd value is a slow query, not a
      // wrong answer.
      const span = Math.min(365, Math.max(1, Math.trunc(Number(days) || 30)))

      const [totals, series, queues, projects, feed, health] = await Promise.all([
        // Every counter, its movement this window, and the same window before
        // it -- one pass per table instead of three round trips per metric.
        pool.query(
          `
          WITH bounds AS (
            SELECT now() - make_interval(days => $1::int) AS window_start,
                   now() - make_interval(days => $1::int * 2) AS prior_start
          ),
          events AS (
            SELECT 'comments' AS metric, created_at FROM project_comments
            UNION ALL SELECT 'likes', created_at FROM project_likes
            UNION ALL SELECT 'downloadRequests', created_at FROM download_requests
            UNION ALL SELECT 'downloads', created_at FROM download_events
            UNION ALL SELECT 'members', created_at FROM visitor_users
            UNION ALL SELECT 'communityPosts', created_at FROM community_posts
            UNION ALL SELECT 'communityComments', created_at FROM community_comments
            UNION ALL SELECT 'communityUploads', created_at FROM community_uploads
            UNION ALL SELECT 'messages', created_at FROM contact_messages
          )
          SELECT
            events.metric,
            count(*)::int AS total,
            count(*) FILTER (WHERE events.created_at >= bounds.window_start)::int AS current,
            count(*) FILTER (
              WHERE events.created_at >= bounds.prior_start
                AND events.created_at < bounds.window_start
            )::int AS prior
          FROM events, bounds
          GROUP BY events.metric
        `,
          [span],
        ),

        // One row per calendar day in the window, zeros included. Days with no
        // activity have to be in the result or the chart draws a flat line
        // through a gap and quietly invents traffic that never happened.
        pool.query(
          `
          WITH days AS (
            SELECT generate_series(
              ((now() AT TIME ZONE 'UTC')::date - ($1::int - 1))::timestamp,
              ((now() AT TIME ZONE 'UTC')::date)::timestamp,
              interval '1 day'
            )::date AS day
          ),
          events AS (
            SELECT 'comments' AS metric, (created_at AT TIME ZONE 'UTC')::date AS day
              FROM project_comments
            UNION ALL SELECT 'likes', (created_at AT TIME ZONE 'UTC')::date FROM project_likes
            UNION ALL SELECT 'downloads', (created_at AT TIME ZONE 'UTC')::date FROM download_events
            UNION ALL SELECT 'members', (created_at AT TIME ZONE 'UTC')::date FROM visitor_users
            UNION ALL SELECT 'community', (created_at AT TIME ZONE 'UTC')::date
              FROM community_uploads
            UNION ALL SELECT 'community', (created_at AT TIME ZONE 'UTC')::date
              FROM community_posts
            UNION ALL SELECT 'messages', (created_at AT TIME ZONE 'UTC')::date
              FROM contact_messages
          )
          SELECT
            days.day,
            count(*) FILTER (WHERE events.metric = 'comments')::int AS comments,
            count(*) FILTER (WHERE events.metric = 'likes')::int AS likes,
            count(*) FILTER (WHERE events.metric = 'downloads')::int AS downloads,
            count(*) FILTER (WHERE events.metric = 'members')::int AS members,
            count(*) FILTER (WHERE events.metric = 'community')::int AS community,
            count(*) FILTER (WHERE events.metric = 'messages')::int AS messages
          FROM days
          LEFT JOIN events ON events.day = days.day
          GROUP BY days.day
          ORDER BY days.day
        `,
          [span],
        ),

        // The work queues. Each carries the age of its oldest item, because
        // "3 pending" and "3 pending, oldest 11 days" are different problems.
        pool.query(`
          SELECT
            (SELECT count(*)::int FROM project_comments WHERE status = 'pending') AS pending_comments,
            (SELECT min(created_at) FROM project_comments WHERE status = 'pending') AS oldest_comment,
            (SELECT count(*)::int FROM project_comments WHERE status = 'spam') AS spam_comments,
            (SELECT count(*)::int FROM community_uploads WHERE status = 'pending') AS pending_uploads,
            (SELECT min(created_at) FROM community_uploads WHERE status = 'pending') AS oldest_upload,
            (SELECT count(*)::int FROM download_requests WHERE status = 'pending') AS pending_requests,
            (SELECT min(created_at) FROM download_requests WHERE status = 'pending') AS oldest_request,
            (SELECT count(*)::int FROM contact_messages
              WHERE created_at >= now() - interval '7 days') AS recent_messages,
            (SELECT min(created_at) FROM contact_messages
              WHERE created_at >= now() - interval '7 days') AS oldest_message,
            (SELECT count(*)::int FROM visitor_users WHERE email_verified_at IS NULL) AS unverified_members,
            (SELECT count(*)::int FROM visitor_users WHERE profile_admin_disabled) AS disabled_profiles
        `),

        // Engagement per project. A download event is a completed transfer, not
        // a request, so this ranks what people actually took away.
        pool.query(`
          SELECT
            slug,
            sum(likes)::int AS likes,
            sum(comments)::int AS comments,
            sum(downloads)::int AS downloads
          FROM (
            SELECT project_slug AS slug, 1 AS likes, 0 AS comments, 0 AS downloads
              FROM project_likes
            UNION ALL SELECT project_slug, 0, 1, 0 FROM project_comments WHERE status <> 'spam'
            UNION ALL SELECT project_slug, 0, 0, 1 FROM download_events
          ) engagement
          GROUP BY slug
          ORDER BY sum(likes) + sum(comments) + sum(downloads) DESC, slug
          LIMIT 8
        `),

        // A merged timeline. Each source is capped before the union so one
        // chatty table cannot crowd the others out of the final window.
        pool.query(`
          SELECT * FROM (
            (SELECT 'comment' AS kind, project_comments.id, project_comments.created_at,
                    project_comments.project_slug AS context,
                    coalesce(visitor_users.display_name, project_comments.author) AS actor,
                    project_comments.message AS detail,
                    project_comments.status
               FROM project_comments
               LEFT JOIN visitor_users ON visitor_users.id = project_comments.user_id
              ORDER BY project_comments.created_at DESC LIMIT 12)
            UNION ALL
            (SELECT 'upload', community_uploads.id, community_uploads.created_at,
                    coalesce(community_uploads.asset_category, 'asset'),
                    coalesce(visitor_users.display_name, 'Someone'),
                    community_uploads.title, community_uploads.status
               FROM community_uploads
               LEFT JOIN visitor_users ON visitor_users.id = community_uploads.user_id
              ORDER BY community_uploads.created_at DESC LIMIT 12)
            UNION ALL
            (SELECT 'post', community_posts.id, community_posts.created_at,
                    community_posts.topic,
                    coalesce(visitor_users.display_name, 'Someone'),
                    community_posts.title, 'published'
               FROM community_posts
               LEFT JOIN visitor_users ON visitor_users.id = community_posts.user_id
              ORDER BY community_posts.created_at DESC LIMIT 12)
            UNION ALL
            (SELECT 'member', id, created_at, coalesce(access_level, 'member'), display_name,
                    CASE WHEN email_verified_at IS NULL THEN 'awaiting verification'
                         ELSE 'verified' END,
                    'joined'
               FROM visitor_users ORDER BY created_at DESC LIMIT 12)
            UNION ALL
            (SELECT 'request', id, created_at, project_slug, name, purpose, status
               FROM download_requests ORDER BY created_at DESC LIMIT 12)
            UNION ALL
            (SELECT 'message', id, created_at, 'contact', name, message, 'received'
               FROM contact_messages ORDER BY created_at DESC LIMIT 12)
            UNION ALL
            (SELECT 'download', download_events.id, download_events.created_at,
                    download_events.project_slug,
                    coalesce(visitor_users.display_name, download_events.actor),
                    'downloaded the source archive', 'completed'
               FROM download_events
               LEFT JOIN visitor_users ON visitor_users.id = download_events.user_id
              ORDER BY download_events.created_at DESC LIMIT 12)
          ) timeline
          ORDER BY created_at DESC
          LIMIT 20
        `),

        // Standing figures that are not events: catalogue size, storage, and
        // how much of the member base is real (verified) and awake (recent).
        pool.query(`
          SELECT
            (SELECT coalesce(sum(file_size), 0)::bigint FROM community_uploads) AS upload_bytes,
            (SELECT coalesce(sum(file_size), 0)::bigint FROM community_uploads
              WHERE status = 'approved') AS approved_bytes,
            (SELECT count(*)::int FROM custom_projects) AS custom_projects,
            (SELECT count(*)::int FROM project_overrides WHERE is_public = false) AS hidden_projects,
            (SELECT count(*)::int FROM visitor_users WHERE email_verified_at IS NOT NULL)
              AS verified_members,
            (SELECT count(*)::int FROM visitor_users
              WHERE last_login_at >= now() - interval '30 days') AS active_members,
            (SELECT count(*)::int FROM visitor_users WHERE profile_public IS NOT false)
              AS public_profiles,
            (SELECT count(*)::int FROM admin_sessions WHERE expires_at > now())
              AS active_admin_sessions,
            (SELECT count(*)::int FROM admin_users WHERE disabled_at IS NULL) AS admin_accounts,
            (SELECT count(*)::int FROM admin_users
              WHERE disabled_at IS NULL AND totp_confirmed_at IS NULL) AS admins_without_totp,
            (SELECT max(created_at) FROM admin_user_actions) AS last_admin_action
        `),
      ])

      const metrics = {}
      for (const row of totals.rows) {
        metrics[row.metric] = { current: row.current, prior: row.prior, total: row.total }
      }

      const iso = (value) => (value ? value.toISOString() : null)
      const queue = queues.rows[0] || {}
      const standing = health.rows[0] || {}

      return {
        activity: feed.rows.map((row) => ({
          actor: row.actor || '',
          context: row.context || '',
          createdAt: row.created_at.toISOString(),
          detail: row.detail || '',
          id: `${row.kind}-${row.id}`,
          kind: row.kind,
          status: row.status || '',
        })),
        catalogue: {
          adminAccounts: standing.admin_accounts ?? 0,
          adminsWithoutTotp: standing.admins_without_totp ?? 0,
          activeAdminSessions: standing.active_admin_sessions ?? 0,
          activeMembers: standing.active_members ?? 0,
          approvedBytes: Number(standing.approved_bytes ?? 0),
          customProjects: standing.custom_projects ?? 0,
          hiddenProjects: standing.hidden_projects ?? 0,
          lastAdminAction: iso(standing.last_admin_action),
          publicProfiles: standing.public_profiles ?? 0,
          uploadBytes: Number(standing.upload_bytes ?? 0),
          verifiedMembers: standing.verified_members ?? 0,
        },
        metrics,
        queues: {
          disabledProfiles: queue.disabled_profiles ?? 0,
          oldestComment: iso(queue.oldest_comment),
          oldestMessage: iso(queue.oldest_message),
          oldestRequest: iso(queue.oldest_request),
          oldestUpload: iso(queue.oldest_upload),
          pendingComments: queue.pending_comments ?? 0,
          pendingRequests: queue.pending_requests ?? 0,
          pendingUploads: queue.pending_uploads ?? 0,
          recentMessages: queue.recent_messages ?? 0,
          spamComments: queue.spam_comments ?? 0,
          unverifiedMembers: queue.unverified_members ?? 0,
        },
        range: { days: span },
        series: series.rows.map((row) => ({
          comments: row.comments,
          community: row.community,
          day: row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day),
          downloads: row.downloads,
          likes: row.likes,
          members: row.members,
          messages: row.messages,
        })),
        topProjects: projects.rows.map((row) => ({
          comments: row.comments,
          downloads: row.downloads,
          likes: row.likes,
          slug: row.slug,
          total: row.likes + row.comments + row.downloads,
        })),
      }
    },

    // `status` filters the moderation queue; omitting it lists everything, so
    // the existing admin comments view keeps working unchanged.
    listComments: async ({ status = '' } = {}) => {
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
          visitor_users.email,
          visitor_users.access_level
        FROM project_comments
        LEFT JOIN visitor_users ON visitor_users.id = project_comments.user_id
        WHERE ($1::text = '' OR project_comments.status = $1)
        ORDER BY project_comments.created_at DESC
        LIMIT 100
      `,
        [status],
      )

      return result.rows.map((row) => ({
        ...toComment(row, { includeEmail: true }),
        status: row.status,
      }))
    },

    setCommentStatus: async (id, status) => {
      const result = await pool.query(
        `
          UPDATE project_comments
          SET status = $2,
              moderated_at = now()
          WHERE id = $1
          RETURNING id, status
        `,
        [id, status],
      )

      return result.rows[0] || null
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

      return result.rows.map((row) => toCommunityUpload(row, { includeEmail: true }))
    },

    listCommunityPosts: async () => {
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
          visitor_users.email,
          visitor_users.access_level
        FROM community_posts
        LEFT JOIN visitor_users ON visitor_users.id = community_posts.user_id
        ORDER BY community_posts.created_at DESC
        LIMIT 200
      `)

      return result.rows.map((row) => toCommunityPost(row, { includeEmail: true }))
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

    listVisitors: async ({
      accessLevel,
      limit,
      offset,
      profileStatus,
      query,
      sort,
      verified,
    }) => {
      const values = []
      const conditions = []
      const addValue = (value) => {
        values.push(value)
        return `$${values.length}`
      }

      if (query) {
        const placeholder = addValue(`%${query}%`)
        conditions.push(
          `(visitor_users.email ILIKE ${placeholder} OR visitor_users.display_name ILIKE ${placeholder} OR visitor_users.handle ILIKE ${placeholder})`,
        )
      }
      if (verified === true) conditions.push('visitor_users.email_verified_at IS NOT NULL')
      if (verified === false) conditions.push('visitor_users.email_verified_at IS NULL')
      if (accessLevel) conditions.push(`visitor_users.access_level = ${addValue(accessLevel)}`)
      if (profileStatus === 'disabled') {
        conditions.push('visitor_users.profile_admin_disabled = true')
      } else if (profileStatus === 'public') {
        conditions.push(
          'visitor_users.profile_public = true AND visitor_users.profile_admin_disabled = false',
        )
      } else if (profileStatus === 'private') {
        conditions.push(
          'visitor_users.profile_public = false AND visitor_users.profile_admin_disabled = false',
        )
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
      const orderBy = {
        createdAt: 'visitor_users.created_at DESC',
        displayName: 'visitor_users.display_name ASC',
        lastLoginAt: 'visitor_users.last_login_at DESC NULLS LAST',
        updatedAt: 'visitor_users.updated_at DESC',
      }[sort] || 'visitor_users.created_at DESC'
      const countResult = await pool.query(
        `SELECT count(*)::int AS count FROM visitor_users ${where}`,
        values,
      )
      const limitPlaceholder = addValue(limit)
      const offsetPlaceholder = addValue(offset)
      const result = await pool.query(
        `
          SELECT
            visitor_users.*,
            (
              (SELECT count(*)::int FROM project_comments WHERE user_id = visitor_users.id) +
              (SELECT count(*)::int FROM community_comments WHERE user_id = visitor_users.id)
            ) AS comment_count,
            (SELECT count(*)::int FROM community_posts WHERE user_id = visitor_users.id) AS post_count,
            (SELECT count(*)::int FROM community_uploads WHERE user_id = visitor_users.id) AS upload_count,
            (SELECT count(*)::int FROM download_requests WHERE user_id = visitor_users.id)
              AS download_request_count
          FROM visitor_users
          ${where}
          ORDER BY ${orderBy}
          LIMIT ${limitPlaceholder}
          OFFSET ${offsetPlaceholder}
        `,
        values,
      )

      return {
        items: result.rows.map((row) => ({
          ...toAccountProfile(row),
          profileAdminDisabledReason: undefined,
        })),
        total: Number(countResult.rows[0]?.count || 0),
      }
    },

    getVisitor: async (id) => {
      const result = await pool.query(
        `
          SELECT
            visitor_users.*,
            (
              (SELECT count(*)::int FROM project_likes WHERE user_id = visitor_users.id) +
              (SELECT count(*)::int FROM community_comment_likes WHERE user_id = visitor_users.id)
            ) AS like_count,
            (
              (SELECT count(*)::int FROM project_comments WHERE user_id = visitor_users.id) +
              (SELECT count(*)::int FROM community_comments WHERE user_id = visitor_users.id)
            ) AS comment_count,
            (SELECT count(*)::int FROM download_requests WHERE user_id = visitor_users.id)
              AS download_request_count,
            (SELECT count(*)::int FROM community_uploads WHERE user_id = visitor_users.id)
              AS upload_count,
            (SELECT count(*)::int FROM community_posts WHERE user_id = visitor_users.id)
              AS post_count
          FROM visitor_users
          WHERE visitor_users.id = $1
          LIMIT 1
        `,
        [id],
      )
      const visitor = toAccountProfile(result.rows[0])
      if (!visitor) return null
      return {
        ...visitor,
        profileAdminDisableReason: result.rows[0].profile_admin_disable_reason || '',
        profileModeratedAt:
          result.rows[0].profile_moderated_at?.toISOString?.() ||
          result.rows[0].profile_moderated_at ||
          null,
      }
    },

    listVisitorActions: async (id, limit, offset) => {
      const [itemsResult, countResult] = await Promise.all([
        pool.query(
          `
            SELECT id, visitor_user_id, action, fields, reason, created_at
            FROM admin_user_actions
            WHERE visitor_user_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
          `,
          [id, limit, offset],
        ),
        pool.query(
          'SELECT count(*)::int AS count FROM admin_user_actions WHERE visitor_user_id = $1',
          [id],
        ),
      ])
      return {
        items: itemsResult.rows.map((row) => ({
          action: row.action,
          createdAt: row.created_at.toISOString(),
          fields: row.fields || [],
          id: row.id,
          reason: row.reason || '',
          visitorUserId: row.visitor_user_id,
        })),
        total: Number(countResult.rows[0]?.count || 0),
      }
    },

    listVisitorComments: async (id, limit, offset) => {
      const [itemsResult, countResult] = await Promise.all([
        pool.query(
          `
            SELECT *
            FROM (
              SELECT id, 'project' AS source, project_slug AS context_id, null::text AS context_title,
                author, message, created_at, created_at AS updated_at
              FROM project_comments
              WHERE user_id = $1
              UNION ALL
              SELECT community_comments.id, 'community' AS source,
                community_comments.post_id AS context_id, community_posts.title AS context_title,
                community_comments.author, community_comments.message,
                community_comments.created_at, community_comments.updated_at
              FROM community_comments
              LEFT JOIN community_posts ON community_posts.id = community_comments.post_id
              WHERE community_comments.user_id = $1
            ) AS comments
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
          `,
          [id, limit, offset],
        ),
        pool.query(
          `
            SELECT (
              (SELECT count(*) FROM project_comments WHERE user_id = $1) +
              (SELECT count(*) FROM community_comments WHERE user_id = $1)
            )::int AS count
          `,
          [id],
        ),
      ])
      return {
        items: itemsResult.rows.map((row) => ({
          author: row.author,
          contextId: row.context_id,
          contextTitle: row.context_title,
          createdAt: row.created_at.toISOString(),
          id: row.id,
          message: row.message,
          source: row.source,
          updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
        })),
        total: Number(countResult.rows[0]?.count || 0),
      }
    },

    listVisitorPosts: async (id, limit, offset) => {
      const [itemsResult, countResult] = await Promise.all([
        pool.query(
          `
            SELECT id, topic, title, message, created_at, updated_at
            FROM community_posts
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
          `,
          [id, limit, offset],
        ),
        pool.query('SELECT count(*)::int AS count FROM community_posts WHERE user_id = $1', [id]),
      ])
      return {
        items: itemsResult.rows.map((row) => ({
          createdAt: row.created_at.toISOString(),
          id: row.id,
          message: row.message,
          title: row.title,
          topic: row.topic,
          updatedAt: row.updated_at.toISOString(),
        })),
        total: Number(countResult.rows[0]?.count || 0),
      }
    },

    listVisitorUploads: async (id, limit, offset) => {
      const [itemsResult, countResult] = await Promise.all([
        pool.query(
          `
            SELECT id, status, title, description, asset_category, file_name, file_type,
              file_size, file_url, preview_url, created_at, updated_at
            FROM community_uploads
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
          `,
          [id, limit, offset],
        ),
        pool.query('SELECT count(*)::int AS count FROM community_uploads WHERE user_id = $1', [id]),
      ])
      return {
        items: itemsResult.rows.map((row) => toCommunityUpload(row, { includeEmail: true })),
        total: Number(countResult.rows[0]?.count || 0),
      }
    },

    listVisitorDownloadRequests: async (id, limit, offset) => {
      const [itemsResult, countResult] = await Promise.all([
        pool.query(
          `
            SELECT id, status, project_slug, project_title, name, email, purpose, ip,
              visitor_access_level, created_at
            FROM download_requests
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
          `,
          [id, limit, offset],
        ),
        pool.query('SELECT count(*)::int AS count FROM download_requests WHERE user_id = $1', [id]),
      ])
      return {
        items: itemsResult.rows.map((row) => ({
          createdAt: row.created_at.toISOString(),
          email: row.email,
          id: row.id,
          ip: row.ip,
          name: row.name,
          projectSlug: row.project_slug,
          projectTitle: row.project_title,
          purpose: row.purpose,
          status: row.status,
          visitorAccessLevel: row.visitor_access_level,
        })),
        total: Number(countResult.rows[0]?.count || 0),
      }
    },

    // `actor` is the admin_users row id of whoever is making the change, or
    // null when the call arrived on the shared static token. It is written into
    // the audit row rather than inferred afterwards, because "who did this" is
    // not recoverable after the fact.
    setVisitorProfileVisibility: async (id, disabled, reason, actor = null) => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await client.query(
          `
            UPDATE visitor_users
            SET profile_admin_disabled = $2,
                profile_admin_disabled_at = CASE WHEN $2 THEN now() ELSE null END,
                profile_admin_disable_reason = CASE WHEN $2 THEN $3 ELSE null END,
                profile_moderated_at = now(),
                updated_at = now()
            WHERE id = $1
            RETURNING id
          `,
          [id, disabled, reason || null],
        )
        if (!result.rows[0]) {
          await client.query('ROLLBACK')
          return null
        }
        await client.query(
          `
            INSERT INTO admin_user_actions (id, visitor_user_id, action, fields, reason, actor_admin_user_id)
            VALUES ($1, $2, $3, $4::jsonb, $5, $6)
          `,
          [
            createId(),
            id,
            disabled ? 'profile_disabled' : 'profile_restored',
            JSON.stringify(['profile']),
            reason || null,
            actor,
          ],
        )
        await client.query('COMMIT')
        return adminStore.getVisitor(id)
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },

    moderateVisitorProfile: async (id, fields, reason, actor = null) => {
      const assignments = []
      if (fields.includes('avatar')) assignments.push("avatar_url = ''")
      if (fields.includes('banner')) assignments.push("banner_url = ''")
      if (fields.includes('bio')) assignments.push("bio = ''")
      if (fields.includes('contacts')) {
        assignments.push("public_email = ''", "contact_links = '{}'::jsonb", 'contacts_public = false')
      }
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await client.query(
          `
            UPDATE visitor_users
            SET ${assignments.join(', ')},
                profile_moderated_at = now(),
                updated_at = now()
            WHERE id = $1
            RETURNING id
          `,
          [id],
        )
        if (!result.rows[0]) {
          await client.query('ROLLBACK')
          return null
        }
        await client.query(
          `
            INSERT INTO admin_user_actions (id, visitor_user_id, action, fields, reason, actor_admin_user_id)
            VALUES ($1, $2, 'profile_fields_cleared', $3::jsonb, $4, $5)
          `,
          [createId(), id, JSON.stringify(fields), reason || null, actor],
        )
        await client.query('COMMIT')
        return adminStore.getVisitor(id)
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
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

      return toAccountUserRecord(result.rows[0])
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

      return toAccountUserRecord(result.rows[0])
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

      return toAccountUserRecord(result.rows[0])
    },

    // Returns the requester's contact details alongside the new status so the
    // caller can notify them. Before this, a decision was invisible unless the
    // requester happened to revisit /account.
    updateDownloadRequestStatus: async (id, status) => {
      const result = await pool.query(
        `
          UPDATE download_requests
          SET status = $2,
              decided_at = now()
          WHERE id = $1
          RETURNING id, status, name, email, project_slug, project_title, user_id
        `,
        [id, status],
      )

      const row = result.rows[0]
      if (!row) return null

      return {
        email: row.email,
        id: row.id,
        name: row.name,
        projectSlug: row.project_slug,
        projectTitle: row.project_title,
        status: row.status,
        userId: row.user_id,
      }
    },

    markDownloadRequestNotified: async (id) => {
      await pool.query('UPDATE download_requests SET notified_at = now() WHERE id = $1', [id])
    },

    listDownloadEvents: async (limit = 100) => {
      const result = await pool.query(
        `
          SELECT
            download_events.id,
            download_events.project_slug,
            download_events.actor,
            download_events.ip,
            download_events.created_at,
            visitor_users.display_name,
            visitor_users.id AS user_id
          FROM download_events
          LEFT JOIN visitor_users ON visitor_users.id = download_events.user_id
          ORDER BY download_events.created_at DESC
          LIMIT $1
        `,
        [limit],
      )

      return result.rows.map((row) => ({
        actor: row.actor,
        createdAt: row.created_at.toISOString(),
        id: row.id,
        ip: row.ip,
        projectSlug: row.project_slug,
        user: row.user_id ? { displayName: row.display_name, id: row.user_id } : null,
      }))
    },

    // ---------------------------------------------------------------------
    // Admin sessions. See the admin_sessions comment in ensureSchema for why
    // the permanent static token had to stop being the thing the browser
    // holds on to.
    // ---------------------------------------------------------------------

    createAdminSession: async ({ adminUserId, expiresAt, ip, tokenHash, userAgent }) => {
      await pool.query(
        `
          INSERT INTO admin_sessions (token_hash, ip, user_agent, expires_at, last_seen_at, admin_user_id)
          VALUES ($1, $2, $3, $4, now(), $5)
        `,
        [tokenHash, ip || null, userAgent || null, expiresAt, adminUserId || null],
      )
    },

    // Resolves the session and the person behind it in one round trip, and
    // refuses a session whose account has since been disabled -- otherwise
    // disabling an admin would leave them working normally for up to
    // ADMIN_SESSION_HOURS, which is not what anyone means by "disable".
    getAdminSession: async (tokenHash) => {
      const result = await pool.query(
        `
          UPDATE admin_sessions
          SET last_seen_at = now()
          WHERE token_hash = $1
            AND expires_at > now()
            AND (
              admin_user_id IS NULL
              OR EXISTS (
                SELECT 1 FROM admin_users
                WHERE admin_users.id = admin_sessions.admin_user_id
                  AND admin_users.disabled_at IS NULL
              )
            )
          RETURNING expires_at, admin_user_id
        `,
        [tokenHash],
      )

      const row = result.rows[0]
      if (!row) return null

      let username = null
      if (row.admin_user_id) {
        const owner = await pool.query('SELECT username FROM admin_users WHERE id = $1', [
          row.admin_user_id,
        ])
        username = owner.rows[0]?.username || null
      }

      return {
        adminUserId: row.admin_user_id || null,
        expiresAt: row.expires_at.toISOString(),
        username,
      }
    },

    deleteAdminSession: async (tokenHash) => {
      await pool.query('DELETE FROM admin_sessions WHERE token_hash = $1', [tokenHash])
    },

    deleteExpiredAdminSessions: async () => {
      const result = await pool.query('DELETE FROM admin_sessions WHERE expires_at <= now()')
      return result.rowCount
    },

    listAdminSessions: async () => {
      const result = await pool.query(
        `
          SELECT
            admin_sessions.ip,
            admin_sessions.user_agent,
            admin_sessions.expires_at,
            admin_sessions.last_seen_at,
            admin_sessions.created_at,
            admin_sessions.admin_user_id,
            admin_users.username
          FROM admin_sessions
          LEFT JOIN admin_users ON admin_users.id = admin_sessions.admin_user_id
          WHERE admin_sessions.expires_at > now()
          ORDER BY admin_sessions.created_at DESC
          LIMIT 50
        `,
      )

      return result.rows.map((row) => ({
        adminUserId: row.admin_user_id || null,
        createdAt: row.created_at.toISOString(),
        expiresAt: row.expires_at.toISOString(),
        ip: row.ip,
        lastSeenAt: row.last_seen_at?.toISOString?.() || null,
        // null means the session was minted from the shared static token. It is
        // shown as such rather than hidden: an unattributable session is the
        // thing an operator most wants to notice in this list.
        username: row.username || null,
        userAgent: row.user_agent,
      }))
    },

    // ---------------------------------------------------------------------
    // Admin accounts.
    //
    // The password/lockout halves deliberately mirror the visitor equivalents
    // above (pbkdf2 hash supplied by the caller, per-account failure counter),
    // because the attack is the same one and there is no reason for the admin
    // path to have its own subtly different rules.
    // ---------------------------------------------------------------------

    createAdminUser: async ({
      displayName,
      id,
      passwordHash,
      recoveryCodeHashes = [],
      totpSecret = null,
      username,
    }) => {
      const result = await pool.query(
        `
          INSERT INTO admin_users (
            id, username, display_name, password_hash, totp_secret, recovery_code_hashes
          )
          VALUES ($1, lower($2), $3, $4, $5, $6::jsonb)
          RETURNING id, username
        `,
        [
          id,
          username,
          displayName || null,
          passwordHash,
          totpSecret,
          JSON.stringify(recoveryCodeHashes),
        ],
      )

      return { id: result.rows[0].id, username: result.rows[0].username }
    },

    getAdminUserByUsername: async (username) => {
      const result = await pool.query(
        'SELECT * FROM admin_users WHERE username = lower($1)',
        [String(username || '')],
      )
      return toAdminUser(result.rows[0])
    },

    getAdminUserById: async (id) => {
      const result = await pool.query('SELECT * FROM admin_users WHERE id = $1', [id])
      return toAdminUser(result.rows[0])
    },

    listAdminUsers: async () => {
      const result = await pool.query(
        `
          SELECT id, username, display_name, totp_confirmed_at, disabled_at, locked_until,
                 failed_login_count, last_login_at, created_at,
                 jsonb_array_length(recovery_code_hashes) AS recovery_codes_left
          FROM admin_users
          ORDER BY created_at
        `,
      )

      return result.rows.map((row) => ({
        createdAt: row.created_at.toISOString(),
        disabledAt: row.disabled_at?.toISOString?.() || null,
        displayName: row.display_name,
        failedLoginCount: row.failed_login_count,
        id: row.id,
        lastLoginAt: row.last_login_at?.toISOString?.() || null,
        lockedUntil: row.locked_until?.toISOString?.() || null,
        recoveryCodesLeft: row.recovery_codes_left,
        totpConfirmedAt: row.totp_confirmed_at?.toISOString?.() || null,
        username: row.username,
      }))
    },

    setAdminUserPassword: async (id, passwordHash) => {
      await pool.query(
        `
          UPDATE admin_users
          SET password_hash = $2,
              failed_login_count = 0,
              locked_until = null,
              updated_at = now()
          WHERE id = $1
        `,
        [id, passwordHash],
      )
    },

    // Enrolment is two-phase on purpose: the secret is stored unconfirmed, and
    // only a code the account holder actually produced flips totp_confirmed_at.
    // Confirming on write instead would let a mistyped secret lock the account
    // out of its own second factor.
    setAdminUserTotpSecret: async (id, { recoveryCodeHashes, totpSecret }) => {
      await pool.query(
        `
          UPDATE admin_users
          SET totp_secret = $2,
              totp_confirmed_at = null,
              totp_last_step = 0,
              recovery_code_hashes = COALESCE($3::jsonb, recovery_code_hashes),
              updated_at = now()
          WHERE id = $1
        `,
        [id, totpSecret, recoveryCodeHashes ? JSON.stringify(recoveryCodeHashes) : null],
      )
    },

    // Parks a candidate secret next to the live one. Each call overwrites the
    // previous candidate, so an abandoned enrolment cannot be resumed later
    // with a stale QR code that is still sitting in someone's scrollback.
    startAdminUserTotpEnrolment: async (id, { expiresAt, totpSecret }) => {
      await pool.query(
        `
          UPDATE admin_users
          SET pending_totp_secret = $2,
              pending_totp_expires_at = $3,
              updated_at = now()
          WHERE id = $1
        `,
        [id, totpSecret, expiresAt],
      )
    },

    // The promotion is one statement, guarded on the candidate still being
    // present and unexpired. Reading, checking and writing separately would let
    // two confirmations race, and the loser would silently install a secret the
    // winner had already replaced. Returns false when there was nothing valid
    // to promote, which the caller reports as "start the enrolment again".
    confirmAdminUserTotpEnrolment: async (id, { recoveryCodeHashes, step }) => {
      const result = await pool.query(
        `
          UPDATE admin_users
          SET totp_secret = pending_totp_secret,
              totp_confirmed_at = now(),
              totp_last_step = $2::bigint,
              recovery_code_hashes = $3::jsonb,
              pending_totp_secret = null,
              pending_totp_expires_at = null,
              failed_login_count = 0,
              locked_until = null,
              updated_at = now()
          WHERE id = $1
            AND pending_totp_secret IS NOT NULL
            AND pending_totp_expires_at > now()
          RETURNING id
        `,
        [id, String(step), JSON.stringify(recoveryCodeHashes)],
      )
      return Boolean(result.rows[0])
    },

    cancelAdminUserTotpEnrolment: async (id) => {
      await pool.query(
        `
          UPDATE admin_users
          SET pending_totp_secret = null,
              pending_totp_expires_at = null,
              updated_at = now()
          WHERE id = $1
        `,
        [id],
      )
    },

    confirmAdminUserTotp: async (id, step) => {
      await pool.query(
        `
          UPDATE admin_users
          SET totp_confirmed_at = COALESCE(totp_confirmed_at, now()),
              totp_last_step = GREATEST(totp_last_step, $2::bigint),
              updated_at = now()
          WHERE id = $1
        `,
        [id, String(step)],
      )
    },

    // Conditional on the step still being unused, so two requests racing with
    // the same code cannot both win: the second UPDATE matches zero rows.
    consumeAdminUserTotpStep: async (id, step) => {
      const result = await pool.query(
        `
          UPDATE admin_users
          SET totp_last_step = $2::bigint,
              updated_at = now()
          WHERE id = $1
            AND totp_last_step < $2::bigint
          RETURNING id
        `,
        [id, String(step)],
      )
      return Boolean(result.rows[0])
    },

    // Removes the matching hash and reports whether it was there, in one
    // statement, so a recovery code cannot be spent twice by two racing
    // requests.
    consumeAdminRecoveryCode: async (id, codeHash) => {
      const result = await pool.query(
        `
          UPDATE admin_users
          SET recovery_code_hashes = recovery_code_hashes - $2::text,
              updated_at = now()
          WHERE id = $1
            AND recovery_code_hashes ? $2::text
          RETURNING jsonb_array_length(recovery_code_hashes) AS remaining
        `,
        [id, codeHash],
      )

      const row = result.rows[0]
      return row ? { ok: true, remaining: row.remaining } : { ok: false, remaining: null }
    },

    replaceAdminRecoveryCodes: async (id, codeHashes) => {
      await pool.query(
        `
          UPDATE admin_users
          SET recovery_code_hashes = $2::jsonb,
              updated_at = now()
          WHERE id = $1
        `,
        [id, JSON.stringify(codeHashes)],
      )
    },

    setAdminUserDisabled: async (id, disabled) => {
      const result = await pool.query(
        `
          UPDATE admin_users
          SET disabled_at = CASE WHEN $2 THEN COALESCE(disabled_at, now()) ELSE null END,
              updated_at = now()
          WHERE id = $1
          RETURNING id
        `,
        [id, disabled],
      )

      if (!result.rows[0]) return false

      // A disabled account keeps no live sessions. getAdminSession already
      // refuses them, but leaving the rows around makes GET /api/admin/sessions
      // lie about who is currently able to act.
      if (disabled) {
        await pool.query('DELETE FROM admin_sessions WHERE admin_user_id = $1', [id])
      }

      return true
    },

    registerAdminLoginFailure: async (id, { lockAfter, lockMs }) => {
      const result = await pool.query(
        `
          UPDATE admin_users
          SET failed_login_count = failed_login_count + 1,
              locked_until = CASE
                WHEN failed_login_count + 1 >= $2
                  THEN now() + ($3::bigint * interval '1 millisecond')
                ELSE locked_until
              END,
              updated_at = now()
          WHERE id = $1
          RETURNING failed_login_count, locked_until
        `,
        [id, lockAfter, lockMs],
      )

      const row = result.rows[0]
      if (!row) return { failedCount: 0, lockedUntil: null }

      return {
        failedCount: row.failed_login_count,
        lockedUntil: row.locked_until?.toISOString?.() || null,
      }
    },

    registerAdminLoginSuccess: async (id) => {
      await pool.query(
        `
          UPDATE admin_users
          SET failed_login_count = 0,
              locked_until = null,
              last_login_at = now(),
              updated_at = now()
          WHERE id = $1
        `,
        [id],
      )
    },

    listAdminActions: async (limit = 50) => {
      const result = await pool.query(
        `
          SELECT
            admin_user_actions.id,
            admin_user_actions.action,
            admin_user_actions.fields,
            admin_user_actions.reason,
            admin_user_actions.created_at,
            admin_user_actions.visitor_user_id,
            admin_user_actions.actor_admin_user_id,
            admin_users.username AS actor_username,
            visitor_users.email AS target_email
          FROM admin_user_actions
          LEFT JOIN admin_users ON admin_users.id = admin_user_actions.actor_admin_user_id
          LEFT JOIN visitor_users ON visitor_users.id = admin_user_actions.visitor_user_id
          ORDER BY admin_user_actions.created_at DESC
          LIMIT $1
        `,
        [limit],
      )

      return result.rows.map((row) => ({
        action: row.action,
        // null actor = taken with the shared static token, before named
        // accounts existed or by a script that still uses it.
        actorUsername: row.actor_username || null,
        createdAt: row.created_at.toISOString(),
        fields: row.fields,
        id: row.id,
        reason: row.reason,
        targetEmail: row.target_email || null,
        targetUserId: row.visitor_user_id || null,
      }))
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

      return toCommunityUpload(updated.rows[0], { includeEmail: true })
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

  return adminStore
}
